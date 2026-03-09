"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { MicroRouter } = require("../src/routes/micro-router");
const {
  registerExternalProviderRoutes,
} = require("../src/routes/external-providers");

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
    headers: {},
    chunks: [],
    writeHead(code, headers) {
      this.status = code;
      this.headers = headers || {};
    },
    write(chunk) {
      this.chunks.push(String(chunk));
    },
    end(payload = "") {
      if (payload) this.chunks.push(String(payload));
      this.body = this.chunks.join("");
    },
    json() {
      return JSON.parse(this.body || "{}");
    },
  };
}

test("external provider health route returns provider health snapshot", async () => {
  const router = new MicroRouter();
  registerExternalProviderRoutes(router, {
    externalProviders: {
      listProviders: () => [],
      getProviderHealth: () => ({ openai: { state: "closed", failures: 0 } }),
    },
    modelRouter: null,
    sanitizer: null,
    logger: { error: () => {} },
    requirePermission: async () => ({ allowed: true }),
    auditedAction: async (a, m, fn) => fn(),
    permissionManager: {},
  });

  const m = router.match("GET", "/external-providers/health");
  assert.ok(m);
  const response = res();
  await m.handler(req("GET", "/external-providers/health"), response, {});
  assert.equal(response.status, 200);
  assert.equal(response.json().health.openai.state, "closed");
});

test("external provider stream route emits SSE data", async () => {
  const router = new MicroRouter();
  registerExternalProviderRoutes(router, {
    externalProviders: {
      isConfigured: () => true,
      streamComplete: async function* () {
        yield { content: "hello", done: false };
        yield { content: "", done: true };
      },
      listProviders: () => [],
    },
    modelRouter: null,
    sanitizer: null,
    logger: { error: () => {} },
    requirePermission: async () => ({ allowed: true }),
    auditedAction: async (a, m, fn) => fn(),
    permissionManager: {},
  });

  const m = router.match("POST", "/external-providers/stream");
  assert.ok(m);
  const response = res();
  await m.handler(
    req("POST", "/external-providers/stream", {
      provider: "openai",
      messages: [{ role: "user", content: "ping" }],
    }),
    response,
    {},
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers["Content-Type"], "text/event-stream");
  assert.match(response.body, /hello/);
  assert.match(response.body, /done/);
});
