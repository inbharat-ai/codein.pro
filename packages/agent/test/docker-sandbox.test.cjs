/**
 * Tests for DockerSandbox — container-based code execution
 */
"use strict";

const assert = require("node:assert");

let DockerSandbox;
try {
  ({ DockerSandbox } = require("../src/mas/docker-sandbox"));
} catch (err) {
  console.log("docker-sandbox.js not found — skipping:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

describe("DockerSandbox", () => {
  it("instantiates with defaults", () => {
    const sandbox = new DockerSandbox();
    assert.ok(sandbox);
    assert.ok(typeof sandbox.isAvailable === "function" || typeof sandbox.isAvailable === "boolean");
  });

  it("has execute method", () => {
    const sandbox = new DockerSandbox();
    assert.ok(typeof sandbox.execute === "function");
  });

  it("has cleanup method", () => {
    const sandbox = new DockerSandbox();
    assert.ok(typeof sandbox.cleanup === "function" || typeof sandbox.destroy === "function" || typeof sandbox.shutdown === "function");
  });

  it("supports language runtimes check", () => {
    const sandbox = new DockerSandbox();
    // Should have some way to list/check supported runtimes
    if (typeof sandbox.supportedRuntimes === "function") {
      const runtimes = sandbox.supportedRuntimes();
      assert.ok(Array.isArray(runtimes));
    } else if (sandbox.runtimes || sandbox.RUNTIMES) {
      assert.ok(typeof (sandbox.runtimes || sandbox.RUNTIMES) === "object");
    }
  });

  it("handles execution when Docker is not available", async () => {
    const sandbox = new DockerSandbox({ dockerAvailable: false });
    const result = await sandbox.execute({ code: "console.log('hello')", runtime: "node" });
    // Should return a fallback result with descriptive error
    assert.ok(result);
    assert.ok(
      result.exitCode !== 0 || (result.stderr && result.stderr.includes("Docker")),
      "Should indicate Docker unavailability",
    );
  });
});
