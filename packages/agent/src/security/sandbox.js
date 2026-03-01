const { Worker } = require("worker_threads");
const path = require("path");
const fs = require("fs");
const { EventEmitter } = require("events");

/**
 * @class Sandbox
 * @description Executes code safely in isolated Worker threads with timeout protection
 * @extends EventEmitter
 * @example
 * const sandbox = new Sandbox({ timeout: 5000 });
 * const result = await sandbox.execute(code, { timeout: 5000 });
 */
class Sandbox extends EventEmitter {
  constructor(options = {}) {
    super();

    this.timeout = options.timeout || 30000;
    this.maxWorkers = options.maxWorkers || 10;
    this.maxMemory = options.maxMemory || 256 * 1024 * 1024;
    this.workers = new Map();
    this.workerPool = [];
    this.execCounter = 0;

    this.initializeWorkerPool();
  }

  /**
   * Initialize the worker thread pool
   * @private
   */
  initializeWorkerPool() {
    const workerScript = path.join(__dirname, "sandbox-worker.js");

    if (!fs.existsSync(workerScript)) {
      const workerContent = `
const { parentPort } = require('worker_threads');

parentPort.on('message', async (message) => {
  const { id, code, context, timeout } = message;
  
  try {
    const func = new Function(...Object.keys(context), code);
    const result = await func(...Object.values(context));
    
    parentPort.postMessage({
      id,
      success: true,
      result,
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
      fs.writeFileSync(workerScript, workerContent);
    }
  }

  /**
   * Execute code in isolated worker thread with timeout
   * @param {string} code - Code to execute
   * @param {Object} options - Execution options
   * @returns {Promise} Result of code execution
   * @example
   * const result = await sandbox.execute('return 2 + 2', {
   *   timeout: 5000,
   *   context: { x: 10 },
   *   abort: false
   * });
   */
  async execute(code, options = {}) {
    if (typeof code !== "string") {
      throw new Error("Code must be a string");
    }

    const { timeout = this.timeout, context = {}, abort = false } = options;

    const execId = ++this.execCounter;

    if (code.length > 1024 * 1024) {
      throw new Error("Code exceeds maximum size (1MB)");
    }

    try {
      JSON.stringify(context);
    } catch (error) {
      throw new Error("Context must be JSON serializable");
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.cleanup(execId);
        reject(new Error(`Code execution timeout after ${timeout}ms`));
      }, timeout);

      const worker = new Worker(path.join(__dirname, "sandbox-worker.js"));
      this.workers.set(execId, worker);

      const messageHandler = (message) => {
        clearTimeout(timeoutId);
        worker.removeListener("message", messageHandler);
        worker.removeListener("error", errorHandler);
        worker.terminate();
        this.workers.delete(execId);

        if (message.success) {
          resolve({
            success: true,
            result: message.result,
            error: null,
            execTime: Date.now(),
          });
        } else {
          reject(new Error(`${message.error.name}: ${message.error.message}`));
        }
      };

      const errorHandler = (error) => {
        clearTimeout(timeoutId);
        worker.removeListener("message", messageHandler);
        worker.removeListener("error", errorHandler);
        worker.terminate();
        this.workers.delete(execId);
        reject(error);
      };

      worker.on("message", messageHandler);
      worker.on("error", errorHandler);
      worker.on("exit", (code) => {
        if (code !== 0) {
          clearTimeout(timeoutId);
          worker.removeListener("message", messageHandler);
          worker.removeListener("error", errorHandler);
          this.workers.delete(execId);
          reject(new Error(`Worker exited with code ${code}`));
        }
      });

      worker.postMessage({
        id: execId,
        code,
        context,
        timeout,
      });
    });
  }

  /**
   * Execute multiple code blocks in parallel
   * @param {string[]} codeBlocks - Array of code strings
   * @param {Object} options - Execution options
   * @returns {Promise} Array of results
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

  /**
   * Clean up worker resources
   * @private
   */
  cleanup(execId) {
    const worker = this.workers.get(execId);
    if (worker) {
      try {
        worker.terminate();
      } catch (err) {
        // Worker already terminated
      }
      this.workers.delete(execId);
    }
  }

  /**
   * Terminate all workers
   */
  async terminateAll() {
    const promises = [];
    for (const [id, worker] of this.workers.entries()) {
      promises.push(
        new Promise((resolve) => {
          worker.once("exit", resolve);
          worker.terminate();
        }),
      );
    }
    await Promise.all(promises);
    this.workers.clear();
  }

  /**
   * Get status of sandbox
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      activeWorkers: this.workers.size,
      maxWorkers: this.maxWorkers,
      executionCount: this.execCounter,
      memory: process.memoryUsage(),
    };
  }

  /**
   * Validate code before execution (syntax check)
   * @param {string} code - Code to validate
   * @returns {Object} Validation result
   */
  validateCode(code) {
    const errors = [];

    if (typeof code !== "string") {
      return { valid: false, errors: ["Code must be a string"], safe: false };
    }

    const dangerousPatterns = [
      /require\s*\(/gi,
      /import\s+/gi,
      /process\./gi,
      /global\./gi,
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
      /child_process/gi,
      /fs\./gi,
      /path\./gi,
      /os\./gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }

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
}

module.exports = { Sandbox };
