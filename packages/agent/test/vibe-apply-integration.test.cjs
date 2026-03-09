"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MicroRouter } = require("../src/routes/micro-router");
const { registerVibeRoutes } = require("../src/routes/vibe");

function req(method, url, body) {
  const r = new EventEmitter();
  r.method = method;
  r.url = url;
  r.headers = { host: "localhost:43120" };
  process.nextTick(() => {
    r.emit("data", Buffer.from(JSON.stringify(body), "utf8"));
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

test("vibe apply writes files transactionally", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-apply-"));

  const router = new MicroRouter();
  registerVibeRoutes(router, {
    externalProviders: {
      completeWithFallback: async () => ({ content: "{}" }),
    },
    logger: { error: () => {}, info: () => {} },
  });

  const m = router.match("POST", "/vibe/apply");
  assert.ok(m);
  const response = res();

  await m.handler(
    req("POST", "/vibe/apply", {
      workspaceRoot,
      files: [
        {
          path: "src/App.tsx",
          content: "export default function App(){return null}",
        },
      ],
    }),
    response,
    {},
  );

  assert.equal(response.status, 200);
  const written = fs.readFileSync(
    path.join(workspaceRoot, "src", "App.tsx"),
    "utf8",
  );
  assert.match(written, /export default function App/);
});
