/**
 * Swarm Routes Security & Hardening Tests
 *
 * Validates body size limits, input validation, and task timeout.
 */
"use strict";

const { describe, it, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const { registerSwarmRoutes } = require("../src/routes/swarm");

// ── Minimal test harness ─────────────────────────────────────

class FakeRouter {
  constructor() {
    this.routes = {};
  }
  get(path, handler) {
    this.routes[`GET ${path}`] = handler;
  }
  post(path, handler) {
    this.routes[`POST ${path}`] = handler;
  }
  del(path, handler) {
    this.routes[`DELETE ${path}`] = handler;
  }
}

function fakeReq(body = "", method = "POST") {
  const chunks = body ? [Buffer.from(body)] : [];
  return {
    method,
    headers: { host: "localhost:43120", "content-length": String(body.length) },
    url: "/",
    user: { userId: "test-user" },
    on(event, cb) {
      if (event === "data") {
        for (const c of chunks) cb(c);
      }
      if (event === "end") cb();
      if (event === "error") {
        /* noop */
      }
    },
  };
}

function fakeRes() {
  let _status = 0;
  let _body = null;
  return {
    writeHead(status) {
      _status = status;
    },
    end(data) {
      if (data) _body = JSON.parse(data);
    },
    setHeader() {},
    getStatus: () => _status,
    getBody: () => _body,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("Swarm Routes Hardening", () => {
  let router;

  beforeEach(() => {
    router = new FakeRouter();
    registerSwarmRoutes(router, {
      runLLM: async () => "{}",
      mcpClientManager: null,
      requirePermission: async () => ({ allowed: true }),
      permissionManager: null,
      logger: { info() {}, warn() {}, error() {} },
    });
  });

  it("POST /swarm/agents rejects missing type", async () => {
    const handler = router.routes["POST /swarm/agents"];
    assert.ok(handler, "Route should exist");

    const req = fakeReq(JSON.stringify({}));
    const res = fakeRes();
    await handler(req, res);
    assert.ok(res.getStatus() === 400, `Expected 400, got ${res.getStatus()}`);
    assert.ok(res.getBody().error.includes("type"), "Should mention 'type'");
  });

  it("POST /swarm/agents rejects oversized type string", async () => {
    const handler = router.routes["POST /swarm/agents"];
    const req = fakeReq(JSON.stringify({ type: "x".repeat(60) }));
    const res = fakeRes();
    await handler(req, res);
    assert.ok(res.getStatus() === 400, `Expected 400, got ${res.getStatus()}`);
  });

  it("POST /swarm/tasks rejects oversized goal", async () => {
    // First init the swarm
    const initHandler = router.routes["POST /swarm/init"];
    const initReq = fakeReq(JSON.stringify({}));
    const initRes = fakeRes();
    await initHandler(initReq, initRes);

    const handler = router.routes["POST /swarm/tasks"];
    const req = fakeReq(JSON.stringify({ goal: "x".repeat(50001) }));
    const res = fakeRes();
    await handler(req, res);
    assert.ok(res.getStatus() === 400, `Expected 400, got ${res.getStatus()}`);
  });

  it("GET /api/health returns ok", async () => {
    const handler = router.routes["GET /api/health"];
    assert.ok(handler, "Health route should exist");

    const req = fakeReq("");
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.strictEqual(res.getBody().status, "ok");
  });
});
