"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { MicroRouter } = require("../src/routes/micro-router");
const { registerRuntimeRoutes } = require("../src/routes/runtime");

function req(method, url, body = null) {
  const r = new EventEmitter();
  r.method = method;
  r.url = url;
  r.headers = { host: "localhost:43120" };
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

test("runtime router route forwards normalized payload to modelRouter", async () => {
  const router = new MicroRouter();
  let captured = null;

  registerRuntimeRoutes(router, {
    modelRuntime: null,
    modelRouter: {
      route: (payload) => {
        captured = payload;
        return { modelType: "reasoner", reason: "test" };
      },
      getPerformanceStats: () => ({}),
      getFineTuneStats: () => ({}),
      recordOutcome: () => {},
      exportFineTuneData: () => [],
    },
    requirePermission: async () => ({ allowed: true }),
    auditedAction: async (_a, _m, fn) => fn(),
    permissionManager: {},
    logger: { error: () => {}, info: () => {} },
  });

  const m = router.match("POST", "/runtime/router");
  assert.ok(m);
  const response = res();
  await m.handler(
    req("POST", "/runtime/router", {
      prompt: "debug this",
      contextSize: 321,
      reasoning: true,
      preference: "auto",
      maxLatencyMs: 5000,
    }),
    response,
    {},
  );

  assert.equal(response.status, 200);
  assert.equal(response.json().modelType, "reasoner");
  assert.equal(captured.contextLength, 321);
  assert.equal(captured.mode, "plan");
});
