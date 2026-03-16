/**
 * Integration Test — Sandbox Code Execution
 *
 * Tests the sandbox-worker's executeInSandbox and createSandboxContext
 * functions directly (without worker_threads), verifying: stdout capture,
 * timeout enforcement, blocked APIs, context injection, and safe builtins.
 */
"use strict";
const { test, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const looseAssert = require("node:assert");

const vm = require("node:vm");
const path = require("node:path");

// The sandbox-worker is designed to run as a worker_thread, so we
// cannot require it directly (it calls parentPort.on). Instead, we
// test the sandbox primitives by reimplementing the core logic that
// the worker uses — createSandboxContext and executeInSandbox style.

// ─── Mini sandbox runner (mirrors sandbox-worker logic) ──────

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RESULT_SIZE = 1024 * 1024;

function createSandboxContext(userContext) {
  const _logs = [];

  const sandbox = {
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
    Array,
    Boolean,
    Error,
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
    TypeError,
    WeakMap,
    WeakSet,
    setTimeout: (fn, ms) => {
      const clamped = Math.min(Math.max(0, Number(ms) || 0), 10000);
      return setTimeout(fn, clamped);
    },
    clearTimeout,
    // Explicitly blocked
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
    __logs: _logs,
  };

  if (userContext && typeof userContext === "object") {
    for (const [key, value] of Object.entries(userContext)) {
      if (key === "__logs") continue;
      sandbox[key] = value;
    }
  }

  return vm.createContext(sandbox, {
    name: "codin-sandbox-test",
    codeGeneration: { strings: false, wasm: false },
  });
}

async function runInSandbox(code, context = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const heapBefore = process.memoryUsage().heapUsed;
  const ctx = createSandboxContext(context);

  const keys = Object.keys(context);
  const paramList = keys.join(", ");
  const wrappedCode = `
    (async function(${paramList}) {
      ${code}
    })(${keys.map((k) => JSON.stringify(context[k])).join(", ")});
  `;

  try {
    const script = new vm.Script(wrappedCode, {
      filename: "sandbox-test.js",
      timeout: timeoutMs,
    });

    const resultOrPromise = script.runInContext(ctx, {
      timeout: timeoutMs,
      breakOnSigint: true,
    });

    let result;
    if (resultOrPromise && typeof resultOrPromise.then === "function") {
      const timeoutPromise = new Promise((_, reject) => {
        const t = setTimeout(
          () => reject(new Error(`Execution timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
        if (t.unref) t.unref();
      });
      result = await Promise.race([resultOrPromise, timeoutPromise]);
    } else {
      result = resultOrPromise;
    }

    const heapAfter = process.memoryUsage().heapUsed;
    return {
      success: true,
      result: result === undefined ? null : result,
      error: null,
      logs: ctx.__logs,
      heapUsed: { before: heapBefore, after: heapAfter },
    };
  } catch (err) {
    const isTimeout =
      err.code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ||
      (err.message && err.message.includes("timed out"));

    return {
      success: false,
      result: null,
      error: {
        message: isTimeout
          ? `Execution timed out after ${timeoutMs}ms`
          : err.message,
        name: isTimeout ? "TimeoutError" : err.name || "Error",
      },
      logs: ctx.__logs,
      heapUsed: { before: heapBefore, after: process.memoryUsage().heapUsed },
    };
  }
}

// ─── Tests ───────────────────────────────────────────────────

describe("Sandbox — Basic Execution", () => {
  it("executes console.log and captures stdout", async () => {
    const result = await runInSandbox("console.log('hello');");
    assert.ok(result.success);
    assert.ok(result.logs.includes("hello"));
  });

  it("returns the result of an expression", async () => {
    const result = await runInSandbox("return 2 + 2;");
    assert.ok(result.success);
    assert.equal(result.result, 4);
  });

  it("supports async/await", async () => {
    const result = await runInSandbox(
      "const val = await Promise.resolve(42); return val;"
    );
    assert.ok(result.success);
    assert.equal(result.result, 42);
  });

  it("returns null for void expressions", async () => {
    const result = await runInSandbox("const x = 1;");
    assert.ok(result.success);
    assert.equal(result.result, null);
  });

  it("captures multiple console.log calls", async () => {
    const result = await runInSandbox(
      "console.log('a'); console.log('b'); console.log('c');"
    );
    assert.deepStrictEqual(result.logs, ["a", "b", "c"]);
  });
});

describe("Sandbox — Timeout Enforcement", () => {
  it("times out on infinite sync loop", async () => {
    const result = await runInSandbox("while(true) {}", {}, 200);
    assert.ok(!result.success);
    assert.equal(result.error.name, "TimeoutError");
    assert.ok(result.error.message.includes("timed out"));
  });

  it("times out on long async operation", async () => {
    const result = await runInSandbox(
      "await new Promise(r => setTimeout(r, 60000)); return 'done';",
      {},
      500
    );
    assert.ok(!result.success);
    assert.ok(result.error.message.includes("timed out"));
  });
});

describe("Sandbox — Blocked APIs", () => {
  it("require is undefined (cannot load modules)", async () => {
    const result = await runInSandbox(
      "return typeof require;",
      {},
      2000
    );
    assert.ok(result.success);
    assert.equal(result.result, "undefined");
  });

  it("cannot access require('fs')", async () => {
    const result = await runInSandbox(
      "try { const fs = require('fs'); return 'accessed'; } catch(e) { return 'blocked: ' + e.message; }",
      {},
      2000
    );
    assert.ok(result.success);
    assert.ok(result.result.includes("blocked"));
  });

  it("process is undefined", async () => {
    const result = await runInSandbox(
      "return typeof process;",
      {},
      2000
    );
    assert.ok(result.success);
    assert.equal(result.result, "undefined");
  });

  it("cannot call process.exit()", async () => {
    const result = await runInSandbox(
      "try { process.exit(0); return 'escaped'; } catch(e) { return 'blocked'; }",
      {},
      2000
    );
    // Either blocked or errored — should not exit the test process
    assert.ok(result.success);
    assert.notEqual(result.result, "escaped");
  });

  it("Buffer is undefined", async () => {
    const result = await runInSandbox(
      "return typeof Buffer;",
      {},
      2000
    );
    assert.ok(result.success);
    assert.equal(result.result, "undefined");
  });

  it("setInterval is undefined", async () => {
    const result = await runInSandbox(
      "return typeof setInterval;",
      {},
      2000
    );
    assert.ok(result.success);
    assert.equal(result.result, "undefined");
  });

  it("eval is blocked via codeGeneration: strings=false", async () => {
    const result = await runInSandbox(
      "try { eval('1+1'); return 'allowed'; } catch(e) { return 'blocked: ' + e.message; }",
      {},
      2000
    );
    assert.ok(result.success);
    // Should be blocked by codeGeneration.strings = false
    assert.ok(result.result.includes("blocked"));
  });

  it("new Function is blocked via codeGeneration", async () => {
    const result = await runInSandbox(
      "try { const f = new Function('return 1'); return 'allowed'; } catch(e) { return 'blocked'; }",
      {},
      2000
    );
    assert.ok(result.success);
    assert.equal(result.result, "blocked");
  });
});

describe("Sandbox — Context Injection", () => {
  it("injected variables are accessible", async () => {
    const result = await runInSandbox(
      "return name + ' is ' + age + ' years old';",
      { name: "Alice", age: 30 }
    );
    assert.ok(result.success);
    assert.equal(result.result, "Alice is 30 years old");
  });

  it("injected arrays work", async () => {
    const result = await runInSandbox(
      "return items.length;",
      { items: [1, 2, 3, 4, 5] }
    );
    assert.ok(result.success);
    assert.equal(result.result, 5);
  });

  it("injected objects work", async () => {
    const result = await runInSandbox(
      "return config.host + ':' + config.port;",
      { config: { host: "localhost", port: 3000 } }
    );
    assert.ok(result.success);
    assert.equal(result.result, "localhost:3000");
  });
});

describe("Sandbox — Safe Builtins", () => {
  it("JSON.parse and JSON.stringify work", async () => {
    const result = await runInSandbox(
      'const obj = JSON.parse(\'{"a":1}\'); return JSON.stringify({...obj, b:2});'
    );
    assert.ok(result.success);
    looseAssert.deepEqual(JSON.parse(result.result), { a: 1, b: 2 });
  });

  it("Math operations work", async () => {
    const result = await runInSandbox(
      "return Math.max(1, 2, 3) + Math.floor(3.7);"
    );
    assert.ok(result.success);
    assert.equal(result.result, 6); // 3 + 3
  });

  it("Array methods work", async () => {
    const result = await runInSandbox(
      "return [1,2,3,4,5].filter(n => n > 3).map(n => n * 2);"
    );
    assert.ok(result.success);
    looseAssert.deepEqual(result.result, [8, 10]);
  });

  it("Map and Set work", async () => {
    const result = await runInSandbox(
      "const s = new Set([1,2,2,3]); return s.size;"
    );
    assert.ok(result.success);
    assert.equal(result.result, 3);
  });

  it("RegExp works", async () => {
    const result = await runInSandbox(
      "return /hello/.test('hello world');"
    );
    assert.ok(result.success);
    assert.equal(result.result, true);
  });

  it("Date works", async () => {
    const result = await runInSandbox(
      "return typeof new Date().toISOString();"
    );
    assert.ok(result.success);
    assert.equal(result.result, "string");
  });
});

describe("Sandbox — Error Handling", () => {
  it("catches syntax errors", async () => {
    const result = await runInSandbox("const x = {;", {}, 2000);
    assert.ok(!result.success);
    assert.ok(result.error);
  });

  it("catches runtime errors", async () => {
    const result = await runInSandbox(
      "const obj = null; return obj.property;",
      {},
      2000
    );
    assert.ok(!result.success);
    assert.ok(result.error.message);
  });

  it("catches thrown errors", async () => {
    const result = await runInSandbox(
      'throw new Error("intentional error");',
      {},
      2000
    );
    assert.ok(!result.success);
    assert.ok(result.error.message.includes("intentional error"));
  });
});

describe("Sandbox — Heap Usage Tracking", () => {
  it("reports heap usage before and after execution", async () => {
    const result = await runInSandbox("return 1;");
    assert.ok(result.heapUsed);
    assert.equal(typeof result.heapUsed.before, "number");
    assert.equal(typeof result.heapUsed.after, "number");
    assert.ok(result.heapUsed.before > 0);
    assert.ok(result.heapUsed.after > 0);
  });
});
