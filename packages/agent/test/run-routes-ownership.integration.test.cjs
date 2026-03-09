"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { MicroRouter } = require("../src/routes/micro-router");
const { registerRunRoutes } = require("../src/routes/run");

function req(method, url, body = null, userId = "local") {
  const r = new EventEmitter();
  r.method = method;
  r.url = url;
  r.headers = { host: "localhost:43120" };
  r.user = { userId };
  process.nextTick(() => {
    if (body !== null) {
      r.emit("data", Buffer.from(JSON.stringify(body), "utf8"));
    }
    r.emit("end");
  });
  return r;
}

function res() {
  return {
    status: 0,
    body: "",
    writeHead(code) {
      this.status = code;
    },
    end(payload = "") {
      this.body = payload;
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    },
  };
}

test("run routes enforce ownership on status and process listing", async () => {
  const router = new MicroRouter();
  const processManager = {
    start: async (profile) => ({ runId: `run-${profile.ownerUserId}` }),
    isOwnedBy: (runId, userId) => runId === `run-${userId}`,
    getStatus: (runId) => ({ runId, status: "running" }),
    getAllProcesses: () => [
      { runId: "run-a", ownerUserId: "a", status: "running" },
      { runId: "run-b", ownerUserId: "b", status: "running" },
    ],
  };

  registerRunRoutes(router, {
    processManager,
    projectDetector: null,
    validator: { isValidCommand: () => ({ valid: true, errors: [] }) },
    requirePermission: async () => ({ allowed: true }),
    auditedAction: async (_a, _m, fn) => fn(),
    permissionManager: {},
    logger: { error: () => {} },
  });

  const statusRoute = router.match("GET", "/run/run-a/status");
  assert.ok(statusRoute);

  const denied = res();
  await statusRoute.handler(
    req("GET", "/run/run-a/status", null, "b"),
    denied,
    {
      runId: "run-a",
    },
  );
  assert.equal(denied.status, 403);

  const allowed = res();
  await statusRoute.handler(
    req("GET", "/run/run-a/status", null, "a"),
    allowed,
    {
      runId: "run-a",
    },
  );
  assert.equal(allowed.status, 200);

  const listRoute = router.match("GET", "/run/processes");
  assert.ok(listRoute);
  const listRes = res();
  await listRoute.handler(req("GET", "/run/processes", null, "a"), listRes, {});

  const payload = listRes.json();
  assert.equal(payload.processes.length, 1);
  assert.equal(payload.processes[0].runId, "run-a");
});
