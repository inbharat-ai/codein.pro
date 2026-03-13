const { Worker } = require("worker_threads");
const path = require("path");
const fs = require("fs");
const { EventEmitter } = require("events");

/**
 * Worker wrapper that tracks state for pool management.
 * @private
 */
class PooledWorker {
  constructor(worker, id) {
    this.worker = worker;
    this.id = id;
    this.busy = false;
    this.execCount = 0;
    this.createdAt = Date.now();
    this.lastUsedAt = Date.now();
    this.healthy = true;
  }
}

/**
 * @class Sandbox
 * @description Executes code safely in isolated Worker threads with timeout protection,
 * worker pool reuse, memory limits via resourceLimits, and hardened code validation.
 * @extends EventEmitter
 * @example
 * const sandbox = new Sandbox({ timeout: 5000, poolSize: 4 });
 * const result = await sandbox.execute('return 2 + 2', { timeout: 5000 });
 * await sandbox.terminateAll();
 */
class Sandbox extends EventEmitter {
  constructor(options = {}) {
    super();

    this.timeout = options.timeout || 30000;
    this.maxWorkers = options.maxWorkers || 10;
    this.maxMemory = options.maxMemory || 256; // MB
    this.poolSize = options.poolSize || Math.min(options.maxWorkers || 10, 4);
    this.maxExecsPerWorker = options.maxExecsPerWorker || 50;
    this.maxOldGenerationSizeMb = options.maxOldGenerationSizeMb || 128;
    this.maxYoungGenerationSizeMb = options.maxYoungGenerationSizeMb || 32;
    this.stackSizeMb = options.stackSizeMb || 4;

    /** @type {Map<number, PooledWorker>} Active (in-flight) executions */
    this.activeExecutions = new Map();
    /** @type {PooledWorker[]} Idle workers ready for reuse */
    this.idlePool = [];
    /** @type {number} Monotonic execution counter */
    this.execCounter = 0;
    /** @type {number} Monotonic worker ID counter */
    this._workerIdCounter = 0;

    this._workerScriptPath = path.join(__dirname, "sandbox-worker.js");
    this._ensureWorkerScript();
    this._warmPool();
  }

  // ---------------------------------------------------------------------------
  //  Worker script management
  // ---------------------------------------------------------------------------

  /**
   * Ensure the worker script file exists on disk.
   * @private
   */
  _ensureWorkerScript() {
    // Always overwrite to keep in sync with this version of the sandbox.
    const workerContent = `'use strict';
const { parentPort } = require('worker_threads');

parentPort.on('message', async (message) => {
  const { id, code, context } = message;

  try {
    const keys = Object.keys(context);
    const values = Object.values(context);
    const func = new Function(...keys, code);
    const result = await func(...values);

    parentPort.postMessage({
      id,
      success: true,
      result: result === undefined ? null : result,
      error: null
    });
  } catch (error) {
    parentPort.postMessage({
      id,
      success: false,
      result: null,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  }
});
`;
    fs.writeFileSync(this._workerScriptPath, workerContent);
  }

  // ---------------------------------------------------------------------------
  //  Worker pool
  // ---------------------------------------------------------------------------

  /**
   * Pre-warm the pool with idle workers up to poolSize.
   * @private
   */
  _warmPool() {
    while (this.idlePool.length < this.poolSize) {
      const pw = this._createWorker();
      if (pw) {
        this.idlePool.push(pw);
      } else {
        break;
      }
    }
  }

  /**
   * Create a new Worker with resource limits.
   * @private
   * @returns {PooledWorker|null}
   */
  _createWorker() {
    try {
      const worker = new Worker(this._workerScriptPath, {
        resourceLimits: {
          maxOldGenerationSizeMb: this.maxOldGenerationSizeMb,
          maxYoungGenerationSizeMb: this.maxYoungGenerationSizeMb,
          stackSizeMb: this.stackSizeMb,
        },
      });

      const id = ++this._workerIdCounter;
      const pw = new PooledWorker(worker, id);

      // Mark unhealthy on unexpected exit so we don't reuse it.
      worker.on("exit", (code) => {
        pw.healthy = false;
        this._removeFromIdlePool(pw);
      });

      return pw;
    } catch (err) {
      this.emit("error", new Error(`Failed to create worker: ${err.message}`));
      return null;
    }
  }

  /**
   * Acquire a worker from the pool or create a new one.
   * @private
   * @returns {PooledWorker}
   */
  _acquireWorker() {
    // Try to grab a healthy idle worker
    while (this.idlePool.length > 0) {
      const pw = this.idlePool.pop();
      if (pw.healthy && pw.execCount < this.maxExecsPerWorker) {
        pw.busy = true;
        return pw;
      }
      // Worker is stale or unhealthy — terminate it
      this._terminateWorker(pw);
    }

    // Check active count limit
    if (this.activeExecutions.size >= this.maxWorkers) {
      throw new Error(
        `Maximum concurrent workers (${this.maxWorkers}) reached`,
      );
    }

    // Create a fresh worker
    const pw = this._createWorker();
    if (!pw) {
      throw new Error("Failed to create sandbox worker");
    }
    pw.busy = true;
    return pw;
  }

  /**
   * Return a worker to the idle pool (or terminate if past limits).
   * @private
   */
  _releaseWorker(pw) {
    pw.busy = false;
    pw.lastUsedAt = Date.now();

    if (!pw.healthy || pw.execCount >= this.maxExecsPerWorker) {
      this._terminateWorker(pw);
      // Replenish pool
      this._warmPool();
      return;
    }

    if (this.idlePool.length < this.poolSize) {
      this.idlePool.push(pw);
    } else {
      this._terminateWorker(pw);
    }
  }

  /**
   * Safely terminate a single pooled worker.
   * @private
   */
  _terminateWorker(pw) {
    pw.healthy = false;
    try {
      pw.worker.removeAllListeners();
      pw.worker.terminate();
    } catch (_) {
      // already terminated
    }
  }

  /**
   * Remove a specific worker from the idle pool.
   * @private
   */
  _removeFromIdlePool(pw) {
    const idx = this.idlePool.indexOf(pw);
    if (idx !== -1) {
      this.idlePool.splice(idx, 1);
    }
  }

  // ---------------------------------------------------------------------------
  //  Code validation (hardened)
  // ---------------------------------------------------------------------------

  /**
   * Validate code before execution.
   * Blocks dangerous globals, constructors, reflection, and module access.
   * @param {string} code - Code to validate
   * @returns {{ valid: boolean, errors: string[], safe: boolean, code: string }}
   */
  validateCode(code) {
    const errors = [];

    if (typeof code !== "string") {
      return { valid: false, errors: ["Code must be a string"], safe: false };
    }

    const dangerousPatterns = [
      // Module / process access
      { pattern: /require\s*\(/gi, label: "require()" },
      { pattern: /import\s+/gi, label: "import statement" },
      { pattern: /import\s*\(/gi, label: "dynamic import()" },
      { pattern: /process\b/gi, label: "process" },
      { pattern: /child_process/gi, label: "child_process" },

      // Global scope escape
      { pattern: /\bglobal\b/gi, label: "global" },
      { pattern: /\bglobalThis\b/gi, label: "globalThis" },

      // Code generation
      { pattern: /\beval\s*\(/gi, label: "eval()" },
      { pattern: /\bFunction\s*\(/gi, label: "Function constructor" },
      { pattern: /\bGeneratorFunction\b/gi, label: "GeneratorFunction" },
      { pattern: /\bAsyncFunction\b/gi, label: "AsyncFunction" },

      // Timers (can escape timeout)
      { pattern: /\bsetTimeout\s*\(/gi, label: "setTimeout()" },
      { pattern: /\bsetInterval\s*\(/gi, label: "setInterval()" },
      { pattern: /\bsetImmediate\s*\(/gi, label: "setImmediate()" },
      { pattern: /\bqueueMicrotask\s*\(/gi, label: "queueMicrotask()" },

      // File system / OS
      { pattern: /\bfs\s*\./gi, label: "fs module" },
      { pattern: /\bpath\s*\./gi, label: "path module" },
      { pattern: /\bos\s*\./gi, label: "os module" },

      // Reflection & meta-programming
      { pattern: /\bReflect\s*\./gi, label: "Reflect" },
      { pattern: /\bnew\s+Proxy\s*\(/gi, label: "Proxy constructor" },
      { pattern: /\bProxy\s*\(/gi, label: "Proxy()" },
      { pattern: /\bProxy\s*\./gi, label: "Proxy" },

      // Prototype pollution
      { pattern: /__proto__/g, label: "__proto__" },
      { pattern: /\bconstructor\s*\[/gi, label: "constructor[] access" },
      { pattern: /prototype\s*\[/gi, label: "prototype[] access" },
      {
        pattern: /Object\s*\.\s*definePropert/gi,
        label: "Object.defineProperty",
      },
      {
        pattern: /Object\s*\.\s*setPrototypeOf/gi,
        label: "Object.setPrototypeOf",
      },
      {
        pattern: /Object\s*\.\s*assign\s*\(\s*Object\.prototype/gi,
        label: "prototype pollution via Object.assign",
      },

      // Worker / SharedArrayBuffer (can spawn threads)
      { pattern: /\bWorker\s*\(/gi, label: "Worker" },
      { pattern: /\bSharedArrayBuffer\b/gi, label: "SharedArrayBuffer" },

      // WebAssembly
      { pattern: /\bWebAssembly\b/gi, label: "WebAssembly" },
    ];

    for (const { pattern, label } of dangerousPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(code)) {
        errors.push(`Dangerous pattern detected: ${label}`);
      }
    }

    // Syntax check (safe — runs in the main V8 but never executes the body)
    try {
      new Function(code);
    } catch (error) {
      errors.push(`Syntax error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      safe: errors.length === 0,
      code,
    };
  }

  // ---------------------------------------------------------------------------
  //  Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute code in an isolated worker thread with timeout and resource limits.
   * @param {string} code - Code to execute (body of a function)
   * @param {Object} [options]
   * @param {number} [options.timeout] - Timeout in ms
   * @param {Object} [options.context={}] - Variables to inject
   * @param {boolean} [options.allowUnsafe=false] - Skip validation
   * @returns {Promise<{success: boolean, result: *, error: null, execTime: number}>}
   */
  async execute(code, options = {}) {
    if (typeof code !== "string") {
      throw new Error("Code must be a string");
    }

    const {
      timeout = this.timeout,
      context = {},
      allowUnsafe = false,
    } = options;

    const execId = ++this.execCounter;

    // Size guard
    if (code.length > 1024 * 1024) {
      throw new Error("Code exceeds maximum size (1MB)");
    }

    // Validation
    if (!allowUnsafe) {
      const validation = this.validateCode(code);
      if (!validation.safe) {
        throw new Error(
          `Sandbox rejected unsafe code: ${validation.errors.slice(0, 3).join("; ")}`,
        );
      }
    }

    // Context serialization check
    try {
      const serialized = JSON.stringify(context);
      if (serialized.length > 512 * 1024) {
        throw new Error("Context exceeds maximum size (512KB)");
      }
    } catch (error) {
      if (error.message.includes("Context exceeds")) throw error;
      throw new Error("Context must be JSON serializable");
    }

    // Acquire worker from pool
    const pooledWorker = this._acquireWorker();
    this.activeExecutions.set(execId, pooledWorker);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = () => {
        if (settled) return false;
        settled = true;
        return true;
      };

      const timeoutId = setTimeout(() => {
        if (!settle()) return;
        // On timeout, terminate the worker (it's stuck) — don't return to pool
        pooledWorker.healthy = false;
        this._cleanupExecution(execId, pooledWorker, false);
        reject(new Error(`Code execution timeout after ${timeout}ms`));
      }, timeout);

      const messageHandler = (message) => {
        if (message.id !== execId) return; // not our message
        if (!settle()) return;
        clearTimeout(timeoutId);
        pooledWorker.worker.removeListener("message", messageHandler);
        pooledWorker.worker.removeListener("error", errorHandler);
        pooledWorker.execCount++;
        this._cleanupExecution(execId, pooledWorker, true);

        if (message.success) {
          resolve({
            success: true,
            result: message.result,
            error: null,
            execTime: Date.now() - startTime,
          });
        } else {
          reject(new Error(`${message.error.name}: ${message.error.message}`));
        }
      };

      const errorHandler = (error) => {
        if (!settle()) return;
        clearTimeout(timeoutId);
        pooledWorker.worker.removeListener("message", messageHandler);
        pooledWorker.worker.removeListener("error", errorHandler);
        pooledWorker.healthy = false;
        this._cleanupExecution(execId, pooledWorker, false);
        reject(error);
      };

      const exitHandler = (exitCode) => {
        if (!settle()) return;
        clearTimeout(timeoutId);
        pooledWorker.worker.removeListener("message", messageHandler);
        pooledWorker.worker.removeListener("error", errorHandler);
        pooledWorker.healthy = false;
        this._cleanupExecution(execId, pooledWorker, false);
        reject(new Error(`Worker exited unexpectedly with code ${exitCode}`));
      };

      pooledWorker.worker.on("message", messageHandler);
      pooledWorker.worker.on("error", errorHandler);
      pooledWorker.worker.once("exit", exitHandler);

      pooledWorker.worker.postMessage({
        id: execId,
        code,
        context,
        timeout,
      });
    });
  }

  /**
   * Clean up after an execution completes.
   * @private
   * @param {number} execId
   * @param {PooledWorker} pw
   * @param {boolean} returnToPool - Whether to return the worker to the pool
   */
  _cleanupExecution(execId, pw, returnToPool) {
    this.activeExecutions.delete(execId);
    if (returnToPool) {
      this._releaseWorker(pw);
    } else {
      this._terminateWorker(pw);
      // Replenish pool
      this._warmPool();
    }
  }

  // ---------------------------------------------------------------------------
  //  Batch execution
  // ---------------------------------------------------------------------------

  /**
   * Execute multiple code blocks in parallel.
   * @param {string[]} codeBlocks
   * @param {Object} [options]
   * @returns {Promise<Array<{index: number, success: boolean, data: Object|null, error: string|null}>>}
   */
  async executeMultiple(codeBlocks, options = {}) {
    if (!Array.isArray(codeBlocks)) {
      throw new Error("Code blocks must be an array");
    }

    const results = await Promise.allSettled(
      codeBlocks.map((code) => this.execute(code, options)),
    );

    return results.map((result, index) => ({
      index,
      success: result.status === "fulfilled",
      data: result.value || null,
      error: result.reason?.message || null,
    }));
  }

  // ---------------------------------------------------------------------------
  //  Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Terminate all workers (active and idle) and drain the pool.
   */
  async terminateAll() {
    const promises = [];

    // Terminate active workers
    for (const [id, pw] of this.activeExecutions.entries()) {
      promises.push(
        new Promise((resolve) => {
          pw.worker.once("exit", resolve);
          this._terminateWorker(pw);
        }),
      );
    }
    this.activeExecutions.clear();

    // Terminate idle pool
    for (const pw of this.idlePool) {
      promises.push(
        new Promise((resolve) => {
          pw.worker.once("exit", resolve);
          this._terminateWorker(pw);
        }),
      );
    }
    this.idlePool = [];

    await Promise.all(promises);
  }

  /**
   * Get status of the sandbox.
   * @returns {Object}
   */
  getStatus() {
    return {
      activeWorkers: this.activeExecutions.size,
      idleWorkers: this.idlePool.length,
      maxWorkers: this.maxWorkers,
      poolSize: this.poolSize,
      executionCount: this.execCounter,
      resourceLimits: {
        maxOldGenerationSizeMb: this.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: this.maxYoungGenerationSizeMb,
        stackSizeMb: this.stackSizeMb,
      },
      memory: process.memoryUsage(),
    };
  }
}

module.exports = { Sandbox };
