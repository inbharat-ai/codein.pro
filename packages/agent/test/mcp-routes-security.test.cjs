"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { MicroRouter } = require("../src/routes/micro-router");
const { registerMcpRoutes } = require("../src/routes/mcp");

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

test("MCP read routes deny without mcpManage permission", async () => {
  const router = new MicroRouter();
  registerMcpRoutes(router, {
    mcpClientManager: {
      getAllServers: () => [],
      listTools: () => [],
      getToolActivity: () => [],
    },
    requirePermission: async () => ({ allowed: false, reason: "blocked" }),
    auditedAction: async (a, m, fn) => fn(),
    permissionManager: {},
    logger: { error: () => {} },
  });

  for (const [method, path] of [
    ["GET", "/mcp/servers"],
    ["GET", "/mcp/tools"],
    ["GET", "/mcp/activity"],
  ]) {
    const m = router.match(method, path);
    assert.ok(m);
    const response = res();
    await m.handler(req(method, path), response, m.params || {});
    assert.equal(response.status, 403);
  }
});
