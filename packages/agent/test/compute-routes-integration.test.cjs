"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { MicroRouter } = require("../src/routes/micro-router");
const { registerComputeRoutes } = require("../src/routes/compute");

function createReq(method, url, body, userId = "local") {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:43120" };
  req.user = { userId };

  process.nextTick(() => {
    if (body !== undefined) {
      req.emit("data", Buffer.from(JSON.stringify(body), "utf8"));
    }
    req.emit("end");
  });

  return req;
}

function createRes() {
  return {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = { ...(headers || {}) };
    },
    end(chunk = "") {
      this.body = chunk;
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    },
  };
}

async function dispatch(router, req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const matched = router.match(req.method, pathname);
  assert.ok(matched, `Route not found: ${req.method} ${pathname}`);
  await matched.handler(req, res, matched.params || {});
  return res;
}

test("compute routes enforce job ownership boundaries", async () => {
  const router = new MicroRouter();
  registerComputeRoutes(router, {});

  const createResObj = await dispatch(
    router,
    createReq("POST", "/compute/jobs", { goal: "write tests" }, "user-a"),
    createRes(),
  );

  assert.equal(createResObj.status, 201);
  const created = createResObj.json();
  const jobId = created.job.id;
  assert.ok(jobId);

  const forbidden = await dispatch(
    router,
    createReq("GET", `/compute/jobs/${jobId}`, undefined, "user-b"),
    createRes(),
  );
  assert.equal(forbidden.status, 403);

  const allowed = await dispatch(
    router,
    createReq("GET", `/compute/jobs/${jobId}`, undefined, "user-a"),
    createRes(),
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.json().job.userId, "user-a");
});

test("compute GPU connect validates missing API key with 400", async () => {
  const router = new MicroRouter();
  registerComputeRoutes(router, {});

  const res = await dispatch(
    router,
    createReq("POST", "/compute/gpu/connect", {}, "user-a"),
    createRes(),
  );

  assert.equal(res.status, 400);
  assert.match(res.json().error, /required|configured/i);
});
