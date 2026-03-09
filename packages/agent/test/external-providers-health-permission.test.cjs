"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { MicroRouter } = require("../src/routes/micro-router");
const {
  registerExternalProviderRoutes,
} = require("../src/routes/external-providers");

function req(method, url) {
  const r = new EventEmitter();
  r.method = method;
  r.url = url;
  r.headers = { host: "localhost:43120" };
  process.nextTick(() => r.emit("end"));
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

test("external providers health endpoint denies without permission", async () => {
  const router = new MicroRouter();
  registerExternalProviderRoutes(router, {
    externalProviders: {
      listProviders: () => [],
      getProviderHealth: () => ({ openai: { state: "closed" } }),
    },
    modelRouter: null,
    sanitizer: null,
    logger: { error: () => {} },
    requirePermission: async () => ({ allowed: false, reason: "nope" }),
    auditedAction: async (_a, _m, fn) => fn(),
    permissionManager: {},
  });

  const m = router.match("GET", "/external-providers/health");
  assert.ok(m);

  const response = res();
  await m.handler(req("GET", "/external-providers/health"), response, {});

  assert.equal(response.status, 403);
  assert.match(response.json().error, /Permission denied/);
});
