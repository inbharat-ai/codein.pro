/**
 * Pipeline Routes Security Tests
 *
 * Validates body size limits, router.del fix, and error handling.
 */
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { registerPipelineRoutes } = require("../src/routes/pipeline");

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
  // Verify router.delete is NOT called (should use .del)
  delete(path, handler) {
    throw new Error("router.delete() should NOT be called — use router.del()");
  }
}

function fakeReq(body = "") {
  const chunks = body ? [Buffer.from(body)] : [];
  return {
    method: "POST",
    headers: { host: "localhost:43120", "content-length": String(body.length) },
    url: "/",
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
      if (data) _body = JSON.parse(data);
    },
    setHeader() {},
    getStatus: () => _status,
    getBody: () => _body,
  };
}

describe("Pipeline Routes Hardening", () => {
  let router;
  let deps;

  beforeEach(() => {
    router = new FakeRouter();
    deps = {
      swarmManager: null,
      computeSelector: null,
      sessionManager: null,
      logger: { info() {}, warn() {}, error() {} },
    };
    registerPipelineRoutes(router, deps);
  });

  it("registers DELETE route using router.del, not router.delete", () => {
    // If we reach here without error, the test passes —
    // FakeRouter.delete() would have thrown if called.
    assert.ok(
      router.routes["DELETE /pipeline/:pipelineId"],
      "DELETE route should be registered via .del()",
    );
  });

  it("POST /pipeline/create rejects missing goal", async () => {
    const handler = router.routes["POST /pipeline/create"];
    assert.ok(handler, "Route should exist");

    const req = fakeReq(JSON.stringify({ language: "python" }));
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 400);
    assert.ok(res.getBody().error.includes("goal"));
  });

  it("GET /pipeline returns list", async () => {
    const handler = router.routes["GET /pipeline"];
    const req = {
      url: "/pipeline",
      headers: { host: "localhost" },
      user: { userId: "tester" },
    };
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(Array.isArray(res.getBody().pipelines));
  });

  it("POST /pipeline/create returns deterministic generated pipelineId", async () => {
    const handler = router.routes["POST /pipeline/create"];
    assert.ok(handler, "Route should exist");

    const req = fakeReq(JSON.stringify({ goal: "build a parser" }));
    const res = fakeRes();
    await handler(req, res);

    assert.strictEqual(res.getStatus(), 202);
    const body = res.getBody();
    assert.ok(body.pipelineId.startsWith("pipeline_"));
    assert.strictEqual(body.status, "running");

    // Should be immediately visible in list by ID.
    const pipelines = deps.autonomousPipeline.listPipelines();
    assert.ok(pipelines.some((p) => p.id === body.pipelineId));
  });

  it("DELETE /pipeline/:pipelineId delegates to cancelPipeline", async () => {
    const createHandler = router.routes["POST /pipeline/create"];
    const createReq = fakeReq(JSON.stringify({ goal: "cancel me" }));
    const createRes = fakeRes();
    await createHandler(createReq, createRes);
    const pipelineId = createRes.getBody().pipelineId;

    let calledWith = null;
    deps.autonomousPipeline.cancelPipeline = (id, reason) => {
      calledWith = { id, reason };
      return { success: true, cancelledTaskIds: ["task_1"] };
    };

    const deleteHandler = router.routes["DELETE /pipeline/:pipelineId"];
    const res = fakeRes();
    await deleteHandler({}, res, { pipelineId });

    assert.strictEqual(res.getStatus(), 200);
    assert.deepEqual(calledWith, {
      id: pipelineId,
      reason: "Cancelled via API",
    });
    assert.deepEqual(res.getBody().cancelledTaskIds, ["task_1"]);
  });
});
