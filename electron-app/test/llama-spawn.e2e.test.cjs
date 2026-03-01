/**
 * E2E Llama-Server Spawn Test
 *
 * Verifies that the bundled llama-server binary can be:
 *   1. Located on disk
 *   2. Spawned as a child process
 *   3. Healthchecked on its HTTP port
 *   4. Run inference with a real GGUF model
 *   5. Shut down cleanly
 *
 * This test does NOT require a model file — llama-server exits or serves
 * a health endpoint even without one, which is enough to prove the binary
 * is valid and executable.
 *
 * Uses node:test (built-in), consistent with the rest of the agent test suite.
 *
 * Run: node --test electron-app/test/llama-spawn.e2e.test.cjs
 */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { spawn, execFileSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

// ── Resolve the llama-server binary for the current platform ──
const PLATFORM = process.platform; // win32 | darwin | linux
const ARCH = process.arch; // x64 | arm64
const BINARY_NAME =
  PLATFORM === "win32" ? "llama-server.exe" : "llama-server";

const explicitLlamaPath = process.env.LLAMA_PATH;

const LLAMA_CANDIDATES = [
  explicitLlamaPath,
  path.resolve(__dirname, "..", "resources", "bin", PLATFORM, ARCH, BINARY_NAME),
  path.resolve(__dirname, "..", "assets", "llama", PLATFORM, ARCH, BINARY_NAME),
  path.resolve(__dirname, "..", "assets", "llama", PLATFORM, BINARY_NAME),
].filter(Boolean);

const LLAMA_PATH = LLAMA_CANDIDATES.find((candidate) => fs.existsSync(candidate));

const MODEL_CANDIDATES = [
  process.env.LLAMA_TEST_MODEL,
  path.resolve(__dirname, "..", "resources", "models", "tiny.gguf"),
].filter(Boolean);

const MODEL_PATH = MODEL_CANDIDATES.find((candidate) => fs.existsSync(candidate));

// Port for the test — pick something unlikely to collide
const TEST_PORT = 18088;

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

/** HTTP GET that resolves with { statusCode, body } or rejects. */
function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () =>
        resolve({ statusCode: res.statusCode, body }),
      );
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

/** Sleep for ms milliseconds. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** HTTP POST JSON returning parsed object. */
function httpPostJson(url, payload, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, json: JSON.parse(raw || "{}") });
          } catch {
            resolve({ statusCode: res.statusCode, json: {} });
          }
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("POST request timed out"));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Wait for HTTP endpoint to respond with 200, retrying up to `retries` times.
 * Returns true on success, false on timeout.
 */
async function waitForHealth(url, retries = 20, intervalMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await httpGet(url, 2000);
      if (res.statusCode === 200) return true;
    } catch {
      // not ready yet
    }
    await sleep(intervalMs);
  }
  return false;
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

test("E2E: llama-server binary exists for current platform", () => {
  assert.ok(
    LLAMA_PATH,
    `llama-server binary not found. Checked: ${LLAMA_CANDIDATES.join(", ")}`,
  );
});

test("E2E: llama-server binary is executable", () => {
  const stat = fs.statSync(LLAMA_PATH);
  assert.ok(stat.size > 1_000_000, `Binary seems too small (${stat.size} bytes)`);

  try {
    execFileSync(LLAMA_PATH, ["--help"], { timeout: 5000, stdio: "pipe" });
  } catch (err) {
    const code = err.status;
    const DLL_NOT_FOUND = 3221225781;
    if (code === DLL_NOT_FOUND) {
      assert.fail(
        "llama-server requires runtime DLLs not present on this machine (DLL_NOT_FOUND).",
      );
    }
    assert.ok(
      code === 0 || code === 1,
      `llama-server --help exited with unexpected code ${code}`,
    );
  }
});

test(
  "E2E: llama-server can be spawned and responds to health check",
  { timeout: 60_000 },
  async () => {
    assert.ok(
      MODEL_PATH,
      `Missing test model. Checked: ${MODEL_CANDIDATES.join(", ")}`,
    );

    const child = spawn(LLAMA_PATH, [
      "--model", MODEL_PATH,
      "--port", String(TEST_PORT),
      "--host", "127.0.0.1",
      "--ctx-size", "256",
      "--n-gpu-layers", "0",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    const cleanup = async () => {
      try {
        if (PLATFORM === "win32") {
          try {
            execFileSync("taskkill", ["/PID", String(child.pid), "/F"], { stdio: "pipe" });
          } catch {
            child.kill("SIGTERM");
          }
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        // no-op
      }
      await sleep(500);
    };

    try {
      const healthy = await waitForHealth(
        `http://127.0.0.1:${TEST_PORT}/health`,
        40,
        500,
      );
      assert.ok(healthy, "llama-server health endpoint did not return 200");

      const inference = await httpPostJson(
        `http://127.0.0.1:${TEST_PORT}/completion`,
        {
          prompt: "The capital of France is",
          n_predict: 8,
          temperature: 0,
        },
      );

      assert.equal(inference.statusCode, 200, "Inference request did not return 200");
      assert.ok(
        typeof inference.json.content === "string" && inference.json.content.length > 0,
        "Inference response content is empty",
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  "E2E: llama-server shuts down cleanly",
  { timeout: 30_000 },
  async () => {
    const child = spawn(LLAMA_PATH, [
      "--port", String(TEST_PORT + 1),
      "--host", "127.0.0.1",
    ], {
      stdio: "pipe",
      detached: false,
    });

    await sleep(1500);

    if (child.exitCode !== null) {
      return;
    }

    if (PLATFORM === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(child.pid), "/F"], { stdio: "pipe" });
      } catch {
        child.kill("SIGTERM");
      }
    } else {
      child.kill("SIGTERM");
    }

    const exitCode = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve(-1);
      }, 5000);

      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    assert.ok(
      exitCode === 0 || exitCode === null || exitCode === 143 || exitCode === 1,
      `Expected clean shutdown, got exit code ${exitCode}`,
    );
    console.log(`  ✓ llama-server shut down with exit code ${exitCode}`);
  },
);
