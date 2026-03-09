/**
 * Vibe Routes Path Security Tests
 *
 * Validates workspace path traversal protection for /vibe/apply and /vibe/preview.
 */
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { registerVibeRoutes } = require("../src/routes/vibe");

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
}

function fakeReq(body = "", url = "/") {
  const chunks = body ? [Buffer.from(body)] : [];
  return {
    method: "POST",
    headers: { host: "localhost:43120", "content-length": String(body.length) },
    url,
    user: { userId: "tester" },
    on(event, cb) {
      if (event === "data") for (const c of chunks) cb(c);
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
      if (data) {
        try {
          _body = JSON.parse(data);
        } catch {
          _body = { raw: data };
        }
      }
    },
    setHeader() {},
    getStatus: () => _status,
    getBody: () => _body,
  };
}

describe("Vibe Routes Path Security", () => {
  let router;

  beforeEach(() => {
    router = new FakeRouter();
    registerVibeRoutes(router, {
      externalProviders: null,
      logger: { info() {}, warn() {}, error() {} },
    });
  });

  it("/vibe/apply rejects path traversal in workspaceRoot", async () => {
    const handler = router.routes["POST /vibe/apply"];
    assert.ok(handler, "Route should exist");

    const body = JSON.stringify({
      workspaceRoot: "/tmp/../../../etc",
      files: [{ path: "test.js", content: "x" }],
    });
    const req = fakeReq(body);
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 400);
    assert.ok(
      res.getBody().error.includes("traversal") ||
        res.getBody().error.includes("Invalid"),
    );
  });

  it("/vibe/apply rejects .git in workspaceRoot", async () => {
    const handler = router.routes["POST /vibe/apply"];
    const body = JSON.stringify({
      workspaceRoot: "/home/user/.git",
      files: [{ path: "test.js", content: "x" }],
    });
    const req = fakeReq(body);
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 400);
  });

  it("/vibe/apply rejects missing workspaceRoot", async () => {
    const handler = router.routes["POST /vibe/apply"];
    const body = JSON.stringify({
      files: [{ path: "test.js", content: "x" }],
    });
    const req = fakeReq(body);
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 400);
    assert.ok(res.getBody().error.includes("root"));
  });

  it("/vibe/generate rejects empty body", async () => {
    const handler = router.routes["POST /vibe/generate"];
    const req = fakeReq("");
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 400);
  });

  it("/vibe/preview rejects path traversal in workspace param", async () => {
    const handler = router.routes["GET /vibe/preview"];
    assert.ok(handler, "Route should exist");

    const req = fakeReq("", "/vibe/preview?workspace=../../etc/passwd");
    req.method = "GET";
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 400);
  });
});
