"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { SessionManager } = require("../src/utils/session-manager");

test("SessionManager persists and reloads sessions", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codin-sessions-"));
  const stateFile = path.join(tempRoot, "sessions-state.json");
  const workspaceDir = path.join(tempRoot, "workspaces");

  const managerA = new SessionManager({
    stateFile,
    baseWorkspaceDir: workspaceDir,
    cleanupInterval: 60_000,
    sessionTTL: 60_000,
  });

  const created = await managerA.createSession({
    userId: "user-a",
    metadata: { source: "test" },
  });
  managerA.addTask(created.sessionId, "t1", { kind: "compute" });
  managerA.updateActivity(created.sessionId, { ping: true });

  clearInterval(managerA._cleanupTimer);

  const managerB = new SessionManager({
    stateFile,
    baseWorkspaceDir: workspaceDir,
    cleanupInterval: 60_000,
    sessionTTL: 60_000,
  });

  const loaded = managerB.getSession(created.sessionId);
  assert.ok(loaded, "Session should be loaded from persisted state");
  assert.equal(loaded.userId, "user-a");
  assert.equal(loaded.metadata.source, "test");

  const listed = managerB.listSessions({ userId: "user-a" });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].tasks.length, 1);

  clearInterval(managerB._cleanupTimer);
  await managerB.terminateSession(created.sessionId);
});
