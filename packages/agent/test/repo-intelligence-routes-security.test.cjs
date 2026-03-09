"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { MicroRouter } = require("../src/routes/micro-router");
const {
  registerRepoIntelligenceRoutes,
} = require("../src/routes/repo-intelligence");

function req(method, url, body = null, user = null) {
  const r = new EventEmitter();
  r.method = method;
  r.url = url;
  r.headers = { host: "localhost:43120" };
  if (user) {
    r.user = user;
  }
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

test("repo search requires authentication", async () => {
  const router = new MicroRouter();
  registerRepoIntelligenceRoutes(router, {
    logger: { error: () => {} },
    requirePermission: async () => ({ allowed: true }),
    permissionManager: {},
  });

  const m = router.match("POST", "/repo/search");
  assert.ok(m);

  const response = res();
  await m.handler(
    req("POST", "/repo/search", { terms: ["auth"] }),
    response,
    {},
  );

  assert.equal(response.status, 401);
  assert.match(response.json().error, /Authentication required/i);
});

test("repo file endpoint rejects unsafe path traversal", async () => {
  const router = new MicroRouter();
  registerRepoIntelligenceRoutes(router, {
    logger: { error: () => {} },
    requirePermission: async () => ({ allowed: true }),
    permissionManager: {},
  });

  const m = router.match("GET", "/repo/file");
  assert.ok(m);

  const response = res();
  await m.handler(
    req("GET", "/repo/file?path=..%2F..%2Fetc%2Fpasswd", null, {
      userId: "u1",
    }),
    response,
    {},
  );

  assert.equal(response.status, 400);
  assert.match(response.json().error, /Invalid repository file path/i);
});

test("repo refactor exec disallows skipValidation unless dryRun", async () => {
  const router = new MicroRouter();
  registerRepoIntelligenceRoutes(router, {
    logger: { error: () => {} },
    requirePermission: async () => ({ allowed: true }),
    permissionManager: {},
  });

  const m = router.match("POST", "/repo/refactor/exec");
  assert.ok(m);

  const response = res();
  await m.handler(
    req(
      "POST",
      "/repo/refactor/exec",
      {
        workspace: ".",
        plan: { id: "p1", steps: [] },
        edits: [
          { relativePath: "src/a.ts", newContent: "export const a = 1;" },
        ],
        skipValidation: true,
        dryRun: false,
      },
      { userId: "u1" },
    ),
    response,
    {},
  );

  assert.equal(response.status, 400);
  assert.match(response.json().error, /skipValidation/i);
});
