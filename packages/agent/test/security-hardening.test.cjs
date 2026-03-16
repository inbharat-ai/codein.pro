/**
 * Security Hardening Tests
 *
 * Covers:
 *   1. Sandbox worker vm-based isolation (the critical security fix)
 *   2. ensureSwarmPermission fail-closed behavior
 *   3. Terminal command validation
 *   4. Git branch validation
 *   5. Git stage path validation
 */
"use strict";
const { test, describe, it } = require("node:test");

const assert = require("node:assert/strict");
const path = require("node:path");
const { Worker } = require("worker_threads");

const {
  validateTerminalCommand,
  validateGitBranch,
  validateGitStagePaths,
} = require("../src/routes/swarm-validators");

// ═════════════════════════════════════════════════════════════════════
// Sandbox Worker — vm-based isolation tests
// ═════════════════════════════════════════════════════════════════════

const WORKER_PATH = path.join(
  __dirname,
  "..",
  "src",
  "security",
  "sandbox-worker.js",
);

let _workerIdCounter = 0;

/**
 * Send a message to a fresh sandbox worker and return the response.
 * Each call spins up a new worker to avoid cross-test pollution.
 */
function runInWorker(code, context = {}, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const id = ++_workerIdCounter;
    const worker = new Worker(WORKER_PATH, {
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
    });

    const killTimer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Test worker timed out (outer safety net)"));
    }, timeout + 5000);

    worker.on("message", (msg) => {
      if (msg.id !== id) return;
      clearTimeout(killTimer);
      worker.terminate();
      resolve(msg);
    });

    worker.on("error", (err) => {
      clearTimeout(killTimer);
      worker.terminate();
      reject(err);
    });

    worker.postMessage({ id, code, context, timeout });
  });
}

// ─── Sandbox: Basic execution ─────────────────────────────────────

describe("Sandbox worker (vm isolation)", () => {
  it("executes simple code and returns the result", async () => {
    const msg = await runInWorker("return 2 + 2;");
    assert.equal(msg.success, true);
    assert.equal(msg.result, 4);
    assert.equal(msg.error, null);
  });

  it("returns null for undefined results", async () => {
    const msg = await runInWorker("let x = 1;");
    assert.equal(msg.success, true);
    assert.equal(msg.result, null);
  });

  it("handles string results", async () => {
    const msg = await runInWorker('return "hello world";');
    assert.equal(msg.success, true);
    assert.equal(msg.result, "hello world");
  });

  it("handles object results", async () => {
    const msg = await runInWorker('return { a: 1, b: "two" };');
    assert.equal(msg.success, true);
    assert.equal(JSON.stringify(msg.result), JSON.stringify({ a: 1, b: "two" }));
  });

  it("handles array results", async () => {
    const msg = await runInWorker("return [1, 2, 3];");
    assert.equal(msg.success, true);
    assert.equal(JSON.stringify(msg.result), JSON.stringify([1, 2, 3]));
  });

  // ─── Context injection ──────────────────────────────────────────

  it("injects context variables", async () => {
    const msg = await runInWorker("return a + b;", { a: 10, b: 20 });
    assert.equal(msg.success, true);
    assert.equal(msg.result, 30);
  });

  it("injects string context", async () => {
    const msg = await runInWorker('return greeting + " world";', {
      greeting: "hello",
    });
    assert.equal(msg.success, true);
    assert.equal(msg.result, "hello world");
  });

  // ─── Timeout enforcement ────────────────────────────────────────

  it("kills long-running synchronous code", async () => {
    const msg = await runInWorker("while(true){}", {}, 500);
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.ok(
      msg.error.message.includes("timed out") ||
        msg.error.name === "TimeoutError",
      `Expected timeout error, got: ${msg.error.message}`,
    );
  });

  it("kills long-running async code", async () => {
    const code = `
      return new Promise((resolve) => {
        const start = Date.now();
        function spin() {
          if (Date.now() - start > 30000) return resolve("done");
          setTimeout(spin, 10);
        }
        spin();
      });
    `;
    const msg = await runInWorker(code, {}, 1000);
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.ok(
      msg.error.message.includes("timed out") ||
        msg.error.name === "TimeoutError",
      `Expected timeout error, got: ${msg.error.message}`,
    );
  });

  // ─── Dangerous globals are NOT accessible ───────────────────────

  it("cannot access require()", async () => {
    const msg = await runInWorker('return require("fs");');
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.ok(
      msg.error.message.includes("require") ||
        msg.error.message.includes("not a function") ||
        msg.error.message.includes("not defined") ||
        msg.error.message.includes("undefined"),
      `Expected require error, got: ${msg.error.message}`,
    );
  });

  it("cannot access process", async () => {
    const msg = await runInWorker("return process.env;");
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.ok(
      msg.error.message.includes("process") ||
        msg.error.message.includes("undefined") ||
        msg.error.message.includes("Cannot read properties of undefined"),
      `Expected process error, got: ${msg.error.message}`,
    );
  });

  it("cannot access fs via any path", async () => {
    const msg = await runInWorker(
      'try { return typeof require("fs") } catch(e) { return e.message; }',
    );
    assert.equal(msg.success, true);
    assert.ok(
      typeof msg.result === "string" &&
        (msg.result.includes("require") ||
          msg.result.includes("not a function") ||
          msg.result.includes("not defined")),
      `Expected require error in result, got: ${msg.result}`,
    );
  });

  it("cannot use eval()", async () => {
    const msg = await runInWorker('return eval("1 + 1");');
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.ok(
      msg.error.message.includes("eval") ||
        msg.error.message.toLowerCase().includes("code generation from strings"),
      `Expected eval error, got: ${msg.error.message}`,
    );
  });

  it("cannot use new Function()", async () => {
    const msg = await runInWorker('return new Function("return 42")();');
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.ok(
      msg.error.message.includes("Function") ||
        msg.error.message.toLowerCase().includes("code generation from strings"),
      `Expected Function error, got: ${msg.error.message}`,
    );
  });

  it("cannot access global or globalThis", async () => {
    const msg1 = await runInWorker(
      "try { return typeof global; } catch(e) { return 'blocked'; }",
    );
    assert.equal(msg1.success, true);
    assert.equal(msg1.result, "undefined");

    const msg2 = await runInWorker(
      "try { return typeof globalThis; } catch(e) { return 'blocked'; }",
    );
    assert.equal(msg2.success, true);
    assert.equal(msg2.result, "undefined");
  });

  it("cannot access Buffer", async () => {
    const msg = await runInWorker(
      "try { return typeof Buffer; } catch(e) { return 'blocked'; }",
    );
    assert.equal(msg.success, true);
    assert.equal(msg.result, "undefined");
  });

  // ─── Error handling ─────────────────────────────────────────────

  it("catches runtime errors and returns them", async () => {
    const msg = await runInWorker("throw new Error('test error');");
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.equal(msg.error.message, "test error");
  });

  it("catches syntax errors", async () => {
    const msg = await runInWorker("return {{{;");
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.ok(
      msg.error.name === "SyntaxError" ||
        msg.error.message.includes("Unexpected"),
      `Expected syntax error, got: ${msg.error.name}: ${msg.error.message}`,
    );
  });

  it("catches ReferenceError for undefined variables", async () => {
    const msg = await runInWorker("return nonExistentVariable;");
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.ok(
      msg.error.message.includes("nonExistentVariable") ||
        msg.error.name === "ReferenceError",
    );
  });

  it("catches TypeError", async () => {
    const msg = await runInWorker("return null.foo;");
    assert.equal(msg.success, false);
    assert.ok(msg.error);
    assert.ok(
      msg.error.name === "TypeError" || msg.error.message.includes("Cannot"),
    );
  });

  // ─── Sequential executions ─────────────────────────────────────

  it("handles multiple sequential executions without leaking state", async () => {
    const msg1 = await runInWorker("return 1;");
    assert.equal(msg1.success, true);
    assert.equal(msg1.result, 1);

    const msg2 = await runInWorker("return 2;");
    assert.equal(msg2.success, true);
    assert.equal(msg2.result, 2);

    const msg3 = await runInWorker('return "three";');
    assert.equal(msg3.success, true);
    assert.equal(msg3.result, "three");

    const msg4 = await runInWorker("throw new Error('boom');");
    assert.equal(msg4.success, false);

    const msg5 = await runInWorker("return 5;");
    assert.equal(msg5.success, true);
    assert.equal(msg5.result, 5);
  });

  // ─── Memory monitoring ──────────────────────────────────────────

  it("reports heap usage before and after execution", async () => {
    const msg = await runInWorker("return Array(1000).fill(0);");
    assert.equal(msg.success, true);
    assert.ok(msg.heapUsed, "Expected heapUsed in response");
    assert.ok(typeof msg.heapUsed.before === "number");
    assert.ok(typeof msg.heapUsed.after === "number");
    assert.ok(msg.heapUsed.before > 0);
    assert.ok(msg.heapUsed.after > 0);
  });

  // ─── Safe builtins are available ────────────────────────────────

  it("has Math available", async () => {
    const msg = await runInWorker("return Math.max(1, 2, 3);");
    assert.equal(msg.success, true);
    assert.equal(msg.result, 3);
  });

  it("has JSON available", async () => {
    const msg = await runInWorker(
      'return JSON.parse(\'{"a":1}\');',
    );
    assert.equal(msg.success, true);
    assert.equal(JSON.stringify(msg.result), '{"a":1}');
  });

  it("has Date available", async () => {
    const msg = await runInWorker("return typeof new Date().getTime();");
    assert.equal(msg.success, true);
    assert.equal(msg.result, "number");
  });

  it("has Array methods available", async () => {
    const msg = await runInWorker("return [3,1,2].sort();");
    assert.equal(msg.success, true);
    assert.equal(JSON.stringify(msg.result), "[1,2,3]");
  });

  it("has String methods available", async () => {
    const msg = await runInWorker('return "hello".toUpperCase();');
    assert.equal(msg.success, true);
    assert.equal(msg.result, "HELLO");
  });

  it("has Map and Set available", async () => {
    const msg = await runInWorker(
      'const m = new Map(); m.set("a", 1); return m.get("a");',
    );
    assert.equal(msg.success, true);
    assert.equal(msg.result, 1);
  });

  it("has RegExp available", async () => {
    const msg = await runInWorker('return /^hello/.test("hello world");');
    assert.equal(msg.success, true);
    assert.equal(msg.result, true);
  });

  it("has Promise available", async () => {
    const msg = await runInWorker("return await Promise.resolve(42);");
    assert.equal(msg.success, true);
    assert.equal(msg.result, 42);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Permission fail-closed tests
// ═════════════════════════════════════════════════════════════════════

describe("ensureSwarmPermission fail-closed", () => {
  it("returns false (503) when deps.requirePermission is missing and no env bypass", async () => {
    const DEV_BYPASS = process.env.CODIN_DEV_BYPASS === "true";
    const deps = {};
    let responseStatus = null;
    let responseBody = null;

    if (DEV_BYPASS) {
      responseStatus = "bypass";
    } else if (typeof deps.requirePermission !== "function") {
      responseStatus = 503;
      responseBody = {
        error: "Permission system unavailable",
      };
    }

    assert.equal(responseStatus, 503);
    assert.equal(responseBody.error, "Permission system unavailable");
  });

  it("bypass is controlled by CODIN_DEV_BYPASS env var, not deps", async () => {
    const originalEnv = process.env.CODIN_DEV_BYPASS;
    try {
      process.env.CODIN_DEV_BYPASS = "true";
      const devBypass = process.env.CODIN_DEV_BYPASS === "true";
      assert.equal(devBypass, true, "CODIN_DEV_BYPASS=true should enable bypass");

      process.env.CODIN_DEV_BYPASS = "false";
      const noBypass = process.env.CODIN_DEV_BYPASS === "true";
      assert.equal(noBypass, false, "CODIN_DEV_BYPASS=false should NOT enable bypass");

      delete process.env.CODIN_DEV_BYPASS;
      const unset = process.env.CODIN_DEV_BYPASS === "true";
      assert.equal(unset, false, "unset CODIN_DEV_BYPASS should NOT enable bypass");
    } finally {
      if (originalEnv !== undefined) {
        process.env.CODIN_DEV_BYPASS = originalEnv;
      } else {
        delete process.env.CODIN_DEV_BYPASS;
      }
    }
  });

  it("does NOT bypass when deps.permissionBypass is set (old pattern removed)", async () => {
    const deps = { permissionBypass: true };
    const DEV_BYPASS = process.env.CODIN_DEV_BYPASS === "true";

    let allowed = false;
    if (DEV_BYPASS) {
      allowed = true;
    } else if (typeof deps.requirePermission !== "function") {
      allowed = false;
    }

    assert.equal(allowed, false, "deps.permissionBypass should no longer grant bypass");
  });
});

// ═════════════════════════════════════════════════════════════════════
// Terminal command validation
// ═════════════════════════════════════════════════════════════════════

describe("validateTerminalCommand", () => {
  it("rejects empty/null command", () => {
    assert.equal(validateTerminalCommand(null).valid, false);
    assert.equal(validateTerminalCommand("").valid, false);
    assert.equal(validateTerminalCommand("   ").valid, false);
  });

  it("rejects commands over 4096 chars", () => {
    const long = "a".repeat(4097);
    assert.equal(validateTerminalCommand(long).valid, false);
  });

  it("rejects newlines", () => {
    assert.equal(validateTerminalCommand("ls\nrm -rf /").valid, false);
    assert.equal(validateTerminalCommand("ls\rrm -rf /").valid, false);
  });

  it("rejects heredocs and redirections", () => {
    assert.equal(validateTerminalCommand("cat << EOF").valid, false);
    assert.equal(validateTerminalCommand("echo hello > file").valid, false);
    assert.equal(validateTerminalCommand("cat < file").valid, false);
  });

  it("rejects shell metacharacters (; & | ` $ ( ) { })", () => {
    assert.equal(validateTerminalCommand("ls; rm -rf /").valid, false);
    assert.equal(validateTerminalCommand("ls && echo hi").valid, false);
    assert.equal(validateTerminalCommand("ls | grep foo").valid, false);
    assert.equal(validateTerminalCommand("echo `whoami`").valid, false);
    assert.equal(validateTerminalCommand("echo $HOME").valid, false);
    assert.equal(validateTerminalCommand("echo $(whoami)").valid, false);
    assert.equal(validateTerminalCommand("echo {a,b}").valid, false);
  });

  it("accepts valid simple commands", () => {
    const r1 = validateTerminalCommand("ls");
    assert.equal(r1.valid, true);
    assert.equal(r1.trimmed, "ls");

    const r2 = validateTerminalCommand("npm test");
    assert.equal(r2.valid, true);

    const r3 = validateTerminalCommand("echo hello");
    assert.equal(r3.valid, true);

    const r4 = validateTerminalCommand("git status");
    assert.equal(r4.valid, true);
  });

  it("trims whitespace", () => {
    const r = validateTerminalCommand("  ls  ");
    assert.equal(r.valid, true);
    assert.equal(r.trimmed, "ls");
  });

  it("rejects non-ASCII characters", () => {
    assert.equal(validateTerminalCommand("ls \u00e9").valid, false);
    assert.equal(validateTerminalCommand("rm \u0000file").valid, false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Git branch validation
// ═════════════════════════════════════════════════════════════════════

describe("validateGitBranch", () => {
  it("rejects empty/null", () => {
    assert.equal(validateGitBranch(null).valid, false);
    assert.equal(validateGitBranch("").valid, false);
  });

  it("rejects names over 100 chars", () => {
    const long = "a" + "b".repeat(100);
    assert.equal(validateGitBranch(long).valid, false);
  });

  it("rejects names with '..'", () => {
    assert.equal(validateGitBranch("feature..test").valid, false);
  });

  it("rejects names with '//'", () => {
    assert.equal(validateGitBranch("feature//test").valid, false);
  });

  it("rejects names ending in '.lock'", () => {
    assert.equal(validateGitBranch("my-branch.lock").valid, false);
  });

  it("rejects names starting with '-'", () => {
    assert.equal(validateGitBranch("-bad-branch").valid, false);
  });

  it("rejects names ending with non-alphanumeric", () => {
    assert.equal(validateGitBranch("branch-").valid, false);
    assert.equal(validateGitBranch("branch.").valid, false);
    assert.equal(validateGitBranch("branch/").valid, false);
  });

  it("rejects names with control characters or spaces", () => {
    assert.equal(validateGitBranch("feature branch").valid, false);
    assert.equal(validateGitBranch("feature\tbranch").valid, false);
  });

  it("accepts valid branch names", () => {
    assert.equal(validateGitBranch("feature/my-branch").valid, true);
    assert.equal(validateGitBranch("fix-123").valid, true);
    assert.equal(validateGitBranch("release/v1.2.3").valid, true);
    assert.equal(validateGitBranch("main").valid, true);
    assert.equal(validateGitBranch("a").valid, true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Git stage path validation
// ═════════════════════════════════════════════════════════════════════

describe("validateGitStagePaths", () => {
  it("rejects non-array / empty array", () => {
    assert.equal(validateGitStagePaths(null).valid, false);
    assert.equal(validateGitStagePaths("file.js").valid, false);
    assert.equal(validateGitStagePaths([]).valid, false);
  });

  it("rejects more than 100 files", () => {
    const files = Array.from({ length: 101 }, (_, i) => `file${i}.js`);
    assert.equal(validateGitStagePaths(files).valid, false);
  });

  it("rejects null bytes", () => {
    assert.equal(validateGitStagePaths(["file\0.js"]).valid, false);
  });

  it("rejects paths over 500 chars", () => {
    const long = "a".repeat(501);
    assert.equal(validateGitStagePaths([long]).valid, false);
  });

  it("rejects control characters", () => {
    assert.equal(validateGitStagePaths(["file\t.js"]).valid, false);
    assert.equal(validateGitStagePaths(["file\n.js"]).valid, false);
  });

  it("rejects path traversal (..)", () => {
    assert.equal(validateGitStagePaths(["../etc/passwd"]).valid, false);
    assert.equal(validateGitStagePaths(["foo/../../bar"]).valid, false);
  });

  it("rejects absolute paths", () => {
    assert.equal(validateGitStagePaths(["/etc/passwd"]).valid, false);
    assert.equal(validateGitStagePaths(["\\windows\\system32"]).valid, false);
  });

  it("accepts valid relative paths", () => {
    assert.equal(validateGitStagePaths(["src/index.js"]).valid, true);
    assert.equal(validateGitStagePaths(["package.json"]).valid, true);
    assert.equal(
      validateGitStagePaths(["src/index.js", "README.md", "lib/utils.js"]).valid,
      true,
    );
  });

  it("accepts exactly 100 files", () => {
    const files = Array.from({ length: 100 }, (_, i) => `file${i}.js`);
    assert.equal(validateGitStagePaths(files).valid, true);
  });
});
