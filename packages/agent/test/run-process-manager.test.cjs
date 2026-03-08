"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ProcessManager } = require("../src/run/process-manager");

test("ProcessManager _retryStart retries and succeeds", async () => {
  const pm = new ProcessManager();
  let attempts = 0;

  pm.start = async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("transient failure");
    }
    return { runId: "run-123", url: null };
  };

  pm.restartBaseDelayMs = 1;

  const result = await pm._retryStart({ runCmd: "npm run dev", cwd: "." }, {
    attempts: 3,
  });

  assert.equal(result.runId, "run-123");
  assert.equal(result.attemptsUsed, 3);
  assert.equal(attempts, 3);
});

test("ProcessManager restart returns previous and new run ids", async () => {
  const pm = new ProcessManager();

  pm.processes.set("run-old", {
    runId: "run-old",
    profile: { runCmd: "npm run dev", cwd: "." },
    timeout: 5000,
    status: "running",
  });

  pm.stop = async () => ({ success: true });
  pm._retryStart = async () => ({ runId: "run-new", url: "http://localhost:3000", attemptsUsed: 1 });

  const restarted = await pm.restart("run-old");

  assert.equal(restarted.restarted, true);
  assert.equal(restarted.previousRunId, "run-old");
  assert.equal(restarted.runId, "run-new");
});
