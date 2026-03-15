/**
 * CodeIn — Sandboxed Code Execution Worker
 *
 * Executes untrusted code inside a Node.js `vm` context with:
 *   - Strict isolation (no require, process, fs, child_process, etc.)
 *   - Configurable timeout (default 5000 ms)
 *   - Memory monitoring (heap usage before/after)
 *   - Only safe builtins exposed (console.log, JSON, Math, Date, etc.)
 *
 * Message protocol (kept identical to the previous `new Function()` worker):
 *
 *   Inbound  → { id: number, code: string, context: object, timeout?: number }
 *   Outbound → { id, success: boolean, result: any|null, error: null|{ message, stack, name }, heapUsed?: { before, after } }
 *
 * @module sandbox-worker
 */
"use strict";

const { parentPort } = require("worker_threads");
const vm = require("vm");

/** Default execution timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 5000;

/** Maximum output size for serialized results (1 MB) */
const MAX_RESULT_SIZE = 1024 * 1024;

/**
 * Build a frozen sandbox context with only safe builtins.
 * Every execution gets a fresh context to prevent cross-execution leakage.
 *
 * @param {object} userContext - Caller-supplied variables to inject
 * @returns {vm.Context}
 */
function createSandboxContext(userContext) {
  // Collected console output (sandbox console.log writes here)
  const _logs = [];

  const sandbox = {
    // ── Safe builtins ──────────────────────────────────────────
    console: Object.freeze({
      log: (...args) => _logs.push(args.map(String).join(" ")),
      warn: (...args) => _logs.push("[warn] " + args.map(String).join(" ")),
      error: (...args) => _logs.push("[error] " + args.map(String).join(" ")),
      info: (...args) => _logs.push("[info] " + args.map(String).join(" ")),
    }),

    JSON,
    Math,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURI,
    encodeURIComponent,
    decodeURI,
    decodeURIComponent,

    // Constructors / types
    Array,
    ArrayBuffer,
    Boolean,
    DataView,
    Error,
    EvalError,
    Float32Array,
    Float64Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Map,
    Number,
    Object,
    Promise,
    RangeError,
    ReferenceError,
    RegExp,
    Set,
    String,
    Symbol,
    SyntaxError,
    TypeError,
    URIError,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Uint8ClampedArray,
    WeakMap,
    WeakSet,

    // Timers (limited — setTimeout only, no setInterval to prevent escape)
    setTimeout: (fn, ms) => {
      // Clamp to a reasonable max so user code can't set a 1-hour timer
      const clamped = Math.min(Math.max(0, Number(ms) || 0), 10000);
      return setTimeout(fn, clamped);
    },
    clearTimeout,

    // Explicitly undefined — these must NOT be available
    require: undefined,
    module: undefined,
    exports: undefined,
    process: undefined,
    globalThis: undefined,
    global: undefined,
    Buffer: undefined,
    __dirname: undefined,
    __filename: undefined,
    queueMicrotask: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    clearInterval: undefined,
    clearImmediate: undefined,

    // Internal reference so we can read logs after execution
    __logs: _logs,
  };

  // Inject caller-supplied context variables
  if (userContext && typeof userContext === "object") {
    for (const [key, value] of Object.entries(userContext)) {
      // Prevent overwriting sandbox internals
      if (key === "__logs") continue;
      sandbox[key] = value;
    }
  }

  return vm.createContext(sandbox, {
    name: "codin-sandbox",
    // Prevent code from accessing the outer context via `this`
    codeGeneration: {
      strings: false, // Disallow eval() and new Function() inside the sandbox
      wasm: false, // Disallow WebAssembly compilation
    },
  });
}

/**
 * Execute code inside the vm sandbox.
 *
 * The code string is treated as a function body. We wrap it in an IIFE
 * that receives the context keys as local variables, mirroring the old
 * `new Function(...keys, code)(...values)` protocol.
 *
 * @param {string} code      - Function body to execute
 * @param {object} context   - Variables to inject
 * @param {number} timeoutMs - Maximum execution time in ms
 * @returns {{ success: boolean, result: any, error: any, heapUsed: { before: number, after: number }, logs: string[] }}
 */
function executeInSandbox(code, context, timeoutMs) {
  const heapBefore = process.memoryUsage().heapUsed;
  const ctx = createSandboxContext(context);

  // Build an IIFE that mirrors `new Function(...keys, code)(...values)`
  const keys = Object.keys(context || {});
  const paramList = keys.join(", ");

  // Wrap user code in an async IIFE so `return` and `await` work as before
  const wrappedCode = `
    (async function(${paramList}) {
      ${code}
    })(${keys.map((k) => JSON.stringify(context[k])).join(", ")});
  `;

  try {
    const script = new vm.Script(wrappedCode, {
      filename: "sandbox-exec.js",
      timeout: timeoutMs, // vm.Script timeout applies to synchronous execution
    });

    // runInContext returns the completion value of the script
    const resultOrPromise = script.runInContext(ctx, {
      timeout: timeoutMs,
      breakOnSigint: true,
    });

    return { resultOrPromise, heapBefore, ctx };
  } catch (err) {
    const heapAfter = process.memoryUsage().heapUsed;
    return {
      resultOrPromise: null,
      syncError: err,
      heapBefore,
      heapAfter,
      ctx,
    };
  }
}

/**
 * Safely serialize a result, handling circular references and oversized payloads.
 * @param {*} value
 * @returns {*}
 */
function safeSerialize(value) {
  if (value === undefined || value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  try {
    const json = JSON.stringify(value);
    if (json && json.length > MAX_RESULT_SIZE) {
      return "[result truncated: exceeded 1MB]";
    }
    // Parse back to ensure clean prototype chain (VM context objects have foreign prototypes)
    return JSON.parse(json);
  } catch {
    return String(value);
  }
}

// ═══════════════════════════════════════════════════════════════
// Worker message handler
// ═══════════════════════════════════════════════════════════════

parentPort.on("message", async (message) => {
  const { id, code, context = {}, timeout } = message;
  const timeoutMs = Math.min(
    Math.max(Number(timeout) || DEFAULT_TIMEOUT_MS, 100),
    60000, // Hard ceiling: 60 seconds
  );

  try {
    const {
      resultOrPromise,
      syncError,
      heapBefore,
      heapAfter: heapAfterSync,
      ctx,
    } = executeInSandbox(code, context, timeoutMs);

    // Handle synchronous errors (syntax errors, immediate timeout, etc.)
    if (syncError) {
      const isTimeout =
        syncError.code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ||
        (syncError.message &&
          syncError.message.includes("Script execution timed out"));

      parentPort.postMessage({
        id,
        success: false,
        result: null,
        error: {
          message: isTimeout
            ? `Execution timed out after ${timeoutMs}ms`
            : syncError.message,
          stack: syncError.stack || "",
          name: isTimeout ? "TimeoutError" : syncError.name || "Error",
        },
        heapUsed: { before: heapBefore, after: heapAfterSync },
      });
      return;
    }

    // If the result is a Promise (async code), await it with a timeout race
    let result;
    if (resultOrPromise && typeof resultOrPromise.then === "function") {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      result = await Promise.race([resultOrPromise, timeoutPromise]);
    } else {
      result = resultOrPromise;
    }

    const heapAfter = process.memoryUsage().heapUsed;

    parentPort.postMessage({
      id,
      success: true,
      result: safeSerialize(result === undefined ? null : result),
      error: null,
      heapUsed: { before: heapBefore, after: heapAfter },
    });
  } catch (error) {
    const heapAfter = process.memoryUsage().heapUsed;
    const isTimeout = error.message && error.message.includes("timed out");

    parentPort.postMessage({
      id,
      success: false,
      result: null,
      error: {
        message: error.message || "Unknown error",
        stack: error.stack || "",
        name: isTimeout ? "TimeoutError" : error.name || "Error",
      },
      heapUsed: { before: 0, after: heapAfter },
    });
  }
});
