/**
 * HTTP Integration Test for Swarm Routes
 *
 * Spins up a lightweight HTTP server with only the swarm routes registered,
 * then exercises the full lifecycle: init → spawn → status → events → shutdown.
 */
"use strict";
const { describe, it, before, after } = require("node:test");

const http = require("node:http");
const assert = require("node:assert/strict");

const { MicroRouter } = require("../src/routes/micro-router");

let registerSwarmRoutes;
try {
  ({ registerSwarmRoutes } = require("../src/routes/swarm"));
} catch (err) {
  console.log("swarm routes not loadable:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

// ─── Test Server Setup ──────────────────────────────────────

let server;
let baseUrl;

function makeDeps() {
  return {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    requirePermission: async () => ({ allowed: true, reason: "test" }),
    permissionManager: null,
    runLLM: async (systemPrompt, userPrompt) => {
      if (systemPrompt.includes("Planner") || userPrompt.includes("Plan:")) {
        return JSON.stringify({
          nodes: [
            { goal: "Test node", agentType: "coder", dependencies: [], maxRetries: 1 },
          ],
          edges: [],
        });
      }
      return JSON.stringify({ answer: "mock response" });
    },
  };
}

async function fetch(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOpts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    };

    const req = http.request(reqOpts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let body;
        try {
          body = JSON.parse(data);
        } catch {
          body = data;
        }
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });

    req.on("error", reject);
    if (opts.body) {
      req.write(typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body));
    }
    req.end();
  });
}

// ─── Tests ──────────────────────────────────────────────────

describe("HTTP Swarm Integration", () => {
  before(async () => {
    const router = new MicroRouter();
    const deps = makeDeps();
    registerSwarmRoutes(router, deps);

    server = http.createServer(async (req, res) => {
      // Attach mock user (simulates JWT auth)
      req.user = { userId: "test-user", role: "admin" };

      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const match = router.match(req.method, url.pathname);
      if (match) {
        try {
          await match.handler(req, res, match.params);
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
  });

  it("GET /swarm/status returns state before init", async () => {
    const res = await fetch("/swarm/status");
    assert.equal(res.status, 200);
    assert.ok(res.body.state);
    assert.ok(res.headers["x-swarm-api-version"]);
  });

  it("POST /swarm/init initializes the swarm", async () => {
    const res = await fetch("/swarm/init", {
      method: "POST",
      body: { maxAgents: 8 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "active");
  });

  it("POST /swarm/init again is idempotent (returns 200)", async () => {
    const res = await fetch("/swarm/init", {
      method: "POST",
      body: {},
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.alreadyInitialized || res.body.status === "active");
  });

  it("GET /swarm/status shows active state", async () => {
    const res = await fetch("/swarm/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.state, "active");
  });

  it("POST /swarm/agents spawns an agent", async () => {
    const res = await fetch("/swarm/agents", {
      method: "POST",
      body: { type: "coder" },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.type, "coder");
  });

  it("POST /swarm/agents without type returns 400", async () => {
    const res = await fetch("/swarm/agents", {
      method: "POST",
      body: {},
    });
    assert.equal(res.status, 400);
  });

  it("GET /swarm/agents lists spawned agents", async () => {
    const res = await fetch("/swarm/agents");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.agents));
    assert.ok(res.body.agents.length >= 1);
  });

  it("GET /swarm/agents?type=coder filters by type", async () => {
    const res = await fetch("/swarm/agents?type=coder");
    assert.equal(res.status, 200);
    assert.ok(res.body.agents.every((a) => a.type === "coder"));
  });

  it("GET /swarm/agents/metrics returns metrics", async () => {
    const res = await fetch("/swarm/agents/metrics");
    assert.equal(res.status, 200);
    assert.ok(res.body.metrics);
  });

  it("GET /swarm/memory returns memory usage", async () => {
    const res = await fetch("/swarm/memory");
    assert.equal(res.status, 200);
    assert.ok(res.body.shortTerm !== undefined);
  });

  it("GET /swarm/permissions returns pending list", async () => {
    const res = await fetch("/swarm/permissions");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.pending));
  });

  it("GET /swarm/events/log returns event log", async () => {
    const res = await fetch("/swarm/events/log");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.events));
    assert.ok(res.body.events.length >= 1); // At least the init event
  });

  it("GET /swarm/events/log?limit=1 limits results", async () => {
    const res = await fetch("/swarm/events/log?limit=1");
    assert.equal(res.status, 200);
    assert.ok(res.body.events.length <= 1);
  });

  it("POST /swarm/tasks validates input", async () => {
    // Missing goal should return 400
    const res = await fetch("/swarm/tasks", {
      method: "POST",
      body: {},
    });
    assert.equal(res.status, 400);
  });

  it("GET /swarm/tasks/:taskId returns 404 for unknown task", async () => {
    const res = await fetch("/swarm/tasks/nonexistent-id");
    assert.equal(res.status, 404);
  });

  it("POST /swarm/shutdown shuts down the swarm", async () => {
    const res = await fetch("/swarm/shutdown", { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "shutdown");
  });

  it("GET /swarm/status shows shutdown state after shutdown", async () => {
    const res = await fetch("/swarm/status");
    assert.equal(res.status, 200);
    assert.ok(["shutdown", "shutting_down"].includes(res.body.state));
  });

  it("POST /swarm/shutdown again is safe", async () => {
    const res = await fetch("/swarm/shutdown", { method: "POST" });
    assert.equal(res.status, 200);
  });

  it("POST /swarm/init after shutdown re-initializes", async () => {
    const res = await fetch("/swarm/init", {
      method: "POST",
      body: { maxAgents: 4 },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.status === "active" || res.body.alreadyInitialized);

    // Cleanup
    await fetch("/swarm/shutdown", { method: "POST" });
  });
});
