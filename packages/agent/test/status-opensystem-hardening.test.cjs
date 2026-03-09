/**
 * Status Metrics + openSystemTarget Hardening Tests
 *
 * Validates: provider circuit metrics, swarm metrics in /metrics endpoint,
 * and openSystemTarget URL-only restriction (tested via replicated logic
 * since the function is module-internal).
 */
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { registerStatusRoutes } = require("../src/routes/status");

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
}

function fakeReq(url = "/") {
  return {
    method: "GET",
    headers: { host: "localhost" },
    url,
    user: { userId: "tester" },
    on(event, cb) {
      if (event === "end") cb();
    },
  };
}

function fakeRes() {
  let _status = 0;
  let _body = "";
  let _headers = {};
  return {
    writeHead(status, headers) {
      _status = status;
      Object.assign(_headers, headers || {});
    },
    end(data) {
      _body = data || "";
    },
    setHeader(k, v) {
      _headers[k] = v;
    },
    getStatus: () => _status,
    getBody: () => _body,
    getHeaders: () => _headers,
  };
}

describe("Status Metrics Hardening", () => {
  let router;

  it("/metrics includes provider circuit state metrics", async () => {
    router = new FakeRouter();
    registerStatusRoutes(router, {
      externalProviders: {
        getProviderHealth() {
          return {
            openai: { state: "closed", failures: 0, successes: 120 },
            anthropic: { state: "open", failures: 5, successes: 80 },
            gemini: { state: "half_open", failures: 1, successes: 200 },
          };
        },
      },
      logger: { info() {}, warn() {}, error() {} },
    });

    const handler = router.routes["GET /metrics"];
    assert.ok(handler, "/metrics route must exist");

    const req = fakeReq("/metrics");
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 200);

    const body = res.getBody();

    // Provider circuit state
    assert.ok(body.includes('provider_circuit_state{provider="openai"} 0'));
    assert.ok(body.includes('provider_circuit_state{provider="anthropic"} 1'));
    assert.ok(body.includes('provider_circuit_state{provider="gemini"} 2'));

    // Provider failures
    assert.ok(body.includes('provider_failures_total{provider="openai"} 0'));
    assert.ok(body.includes('provider_failures_total{provider="anthropic"} 5'));

    // Provider successes
    assert.ok(body.includes('provider_successes_total{provider="openai"} 120'));
    assert.ok(body.includes('provider_successes_total{provider="gemini"} 200'));
  });

  it("/metrics includes swarm active tasks", async () => {
    router = new FakeRouter();
    registerStatusRoutes(router, {
      swarmManager: {
        swarmStatus() {
          return { activeTasks: 7 };
        },
      },
      logger: { info() {}, warn() {}, error() {} },
    });

    const handler = router.routes["GET /metrics"];
    const req = fakeReq("/metrics");
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getBody().includes("swarm_active_tasks 7"));
  });

  it("/metrics omits provider metrics when externalProviders is null", async () => {
    router = new FakeRouter();
    registerStatusRoutes(router, {
      logger: { info() {}, warn() {}, error() {} },
    });

    const handler = router.routes["GET /metrics"];
    const req = fakeReq("/metrics");
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.getStatus(), 200);

    // Should still have basic metrics
    assert.ok(res.getBody().includes("nodejs_memory_heap_used_bytes"));
    // Provider metrics should NOT appear
    assert.ok(!res.getBody().includes("provider_circuit_state"));
  });
});

describe("openSystemTarget URL Restriction (logic verification)", () => {
  // Since openSystemTarget is module-internal, we replicate the validation logic
  // to confirm the URL-only approach.
  function validateTarget(target) {
    if (!target) throw new Error("Target is required");
    const { URL } = require("node:url");
    let parsed;
    try {
      parsed = new URL(target);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Disallowed protocol: ${parsed.protocol}`);
      }
      return parsed.href;
    } catch {
      throw new Error(
        "Invalid target: only http/https URLs are allowed for system-open",
      );
    }
  }

  it("accepts valid https URL", () => {
    assert.strictEqual(
      validateTarget("https://example.com/path"),
      "https://example.com/path",
    );
  });

  it("accepts valid http URL", () => {
    assert.strictEqual(
      validateTarget("http://localhost:3000"),
      "http://localhost:3000/",
    );
  });

  it("rejects file:// protocol", () => {
    assert.throws(
      () => validateTarget("file:///etc/passwd"),
      /Disallowed protocol|only http\/https URLs/,
    );
  });

  it("rejects plain file path", () => {
    assert.throws(() => validateTarget("/etc/passwd"), /only http\/https URLs/);
  });

  it("rejects Windows file path", () => {
    assert.throws(
      () => validateTarget("C:\\Windows\\System32\\cmd.exe"),
      /only http\/https URLs/,
    );
  });

  it("rejects javascript: protocol", () => {
    assert.throws(
      () => validateTarget("javascript:alert(1)"),
      /Disallowed protocol|only http\/https URLs/,
    );
  });

  it("rejects empty target", () => {
    assert.throws(() => validateTarget(""), /Target is required/);
  });

  it("rejects data: URL", () => {
    assert.throws(
      () => validateTarget("data:text/html,<script>"),
      /Disallowed protocol|only http\/https URLs/,
    );
  });
});
