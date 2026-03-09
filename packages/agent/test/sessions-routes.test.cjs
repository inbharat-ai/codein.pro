"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { MicroRouter } = require("../src/routes/micro-router");
const { registerSessionRoutes } = require("../src/routes/sessions");

function createReq(method, url, body, userId = "anonymous") {
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
    body: "",
    writeHead(status) {
      this.status = status;
    },
    end(body = "") {
      this.body = body;
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    },
  };
}

async function dispatch(router, req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const matched = router.match(req.method, pathname);
  assert.ok(matched);
  await matched.handler(req, res, matched.params || {});
  return res;
}

test("sessions routes enforce ownership boundaries", async () => {
  const router = new MicroRouter();
  const deps = { config: {} };
  registerSessionRoutes(router, deps);

  const createResponse = await dispatch(
    router,
    createReq("POST", "/sessions", {}, "owner"),
    createRes(),
  );
  assert.equal(createResponse.status, 201);
  const sessionId = createResponse.json().session.sessionId;

  const forbidden = await dispatch(
    router,
    createReq("GET", `/sessions/${sessionId}`, undefined, "other"),
    createRes(),
  );
  assert.equal(forbidden.status, 403);

  const deleteOk = await dispatch(
    router,
    createReq("DELETE", `/sessions/${sessionId}`, undefined, "owner"),
    createRes(),
  );
  assert.equal(deleteOk.status, 200);

  await deps.sessionManager.shutdown();
});
