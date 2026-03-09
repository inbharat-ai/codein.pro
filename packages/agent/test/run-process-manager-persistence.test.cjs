"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { ProcessManager } = require("../src/run/process-manager");

test("ProcessManager persists runtime metadata and recovers running entry as failed", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codin-run-"));
  const stateFile = path.join(tempRoot, "processes.json");

  const pmA = new ProcessManager();
  pmA.stateFile = stateFile;
  pmA.processes.set("run-x", {
    runId: "run-x",
    process: null,
    profile: { runCmd: "npm run dev", cwd: "." },
    logs: [],
    status: "running",
    url: null,
    startedAt: new Date().toISOString(),
    timeout: 1000,
  });
  pmA._persistState();
  pmA._stopSupervision();

  const pmB = new ProcessManager();
  pmB.stateFile = stateFile;
  pmB._loadPersistedState();

  const status = pmB.getStatus("run-x");
  assert.ok(status);
  assert.equal(status.status, "failed");
  await pmA.destroy();
  await pmB.destroy();
});
