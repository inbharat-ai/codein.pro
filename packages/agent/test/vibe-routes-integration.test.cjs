"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { MicroRouter } = require("../src/routes/micro-router");
const { registerVibeRoutes } = require("../src/routes/vibe");

function createReq(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:43120" };

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
      this.headers = headers || {};
    },
    end(payload = "") {
      this.body = payload;
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    },
  };
}

test("vibe analyze accepts provider text responses and returns spec", async () => {
  const router = new MicroRouter();
  registerVibeRoutes(router, {
    externalProviders: {
      completeWithFallback: async () => ({
        content:
          '{"layout":{"type":"single","sections":["main"]},"components":[],"typography":{},"colors":{},"spacing":{},"interactions":[],"responsive":{},"content":[]}',
      }),
    },
    logger: { error: () => {} },
  });

  const matched = router.match("POST", "/vibe/analyze");
  assert.ok(matched);

  const req = createReq("POST", "/vibe/analyze", {
    imageBase64: "ZmFrZQ==",
    mimeType: "image/png",
  });
  const res = createRes();

  await matched.handler(req, res, {});

  assert.equal(res.status, 200);
  const payload = res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.spec.layout.type, "single");
});
