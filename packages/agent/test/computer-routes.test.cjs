/**
 * Computer Routes — HTTP Integration Tests
 *
 * Tests all /computer/* endpoints with a lightweight HTTP server,
 * following the same pattern as http-swarm-integration.test.cjs.
 */
"use strict";

const http = require("node:http");
const assert = require("node:assert/strict");

const { MicroRouter } = require("../src/routes/micro-router");

let registerComputerRoutes;
try {
  ({ registerComputerRoutes } = require("../src/routes/computer"));
} catch (err) {
  console.log("computer routes not loadable:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

// ─── Test Server Setup ──────────────────────────────────────

let server;
let baseUrl;

function makeDeps() {
  const skills = [
    { name: "file_read", description: "Read a file from disk", category: "file_ops", trustLevel: "builtin", requiredContext: ["path"] },
    { name: "file_write", description: "Write content to a file", category: "file_ops", trustLevel: "builtin", requiredContext: ["path", "content"] },
    { name: "shell_exec", description: "Execute a shell command", category: "system", trustLevel: "elevated", requiredContext: ["command"] },
    { name: "web_search", description: "Search the web", category: "network", trustLevel: "elevated", requiredContext: ["query"] },
  ];

  const activePlans = [];

  return {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    requirePermission: async () => ({ allowed: true, reason: "test" }),
    permissionManager: null,
    // Mock swarmManager
    swarmManager: {
      listSkills: (category) => {
        if (category) return skills.filter((s) => s.category === category);
        return skills;
      },
      getActivePlans: () => activePlans,
      getMemoryStore: () => null,
      _skillRegistry: null,
      runAutonomousPlan: async (goal, context) => {
        const plan = {
          id: `plan-${Date.now().toString(36)}`,
          goal,
          status: "running",
          steps: [
            { id: "s1", description: "Step 1", status: "pending" },
            { id: "s2", description: "Step 2", status: "pending" },
          ],
        };
        activePlans.push(plan);
        return plan;
      },
      taskOrchestrate: async (opts) => {
        return { status: "completed", taskId: `task-mock` };
      },
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

describe("Computer Routes", () => {
  beforeAll(async () => {
    const router = new MicroRouter();
    const deps = makeDeps();
    registerComputerRoutes(router, deps);

    server = http.createServer(async (req, res) => {
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

  afterAll(() => {
    if (server) server.close();
  });

  // ═══════════════════════════════════════════════════════════
  // Autonomous Execution
  // ═══════════════════════════════════════════════════════════

  let createdPlanId;

  it("POST /computer/run submits a goal", async () => {
    const res = await fetch("/computer/run", {
      method: "POST",
      body: { goal: "Build a REST API for user management" },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.planId);
    assert.ok(res.body.status);
    assert.ok(res.headers["x-computer-api-version"]);
    createdPlanId = res.body.planId;
  });

  it("POST /computer/run validates goal is required", async () => {
    const res = await fetch("/computer/run", {
      method: "POST",
      body: {},
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes("goal"));
  });

  it("POST /computer/run rejects empty goal", async () => {
    const res = await fetch("/computer/run", {
      method: "POST",
      body: { goal: "   " },
    });
    assert.equal(res.status, 400);
  });

  it("GET /computer/run/:planId returns plan status", async () => {
    assert.ok(createdPlanId, "Need a planId from previous test");
    const res = await fetch(`/computer/run/${createdPlanId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.planId, createdPlanId);
    assert.ok(res.body.progress !== undefined);
  });

  it("GET /computer/run/:planId returns 404 for unknown plan", async () => {
    const res = await fetch("/computer/run/nonexistent-plan");
    assert.equal(res.status, 404);
  });

  it("POST /computer/run/:planId/pause pauses a running plan", async () => {
    assert.ok(createdPlanId);
    const res = await fetch(`/computer/run/${createdPlanId}/pause`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "paused");
  });

  it("POST /computer/run/:planId/resume resumes a paused plan", async () => {
    assert.ok(createdPlanId);
    const res = await fetch(`/computer/run/${createdPlanId}/resume`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "running");
  });

  it("POST /computer/run/:planId/resume rejects non-paused plan", async () => {
    assert.ok(createdPlanId);
    const res = await fetch(`/computer/run/${createdPlanId}/resume`, { method: "POST" });
    assert.equal(res.status, 400);
  });

  it("POST /computer/run/:planId/cancel cancels a plan", async () => {
    assert.ok(createdPlanId);
    const res = await fetch(`/computer/run/${createdPlanId}/cancel`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "cancelled");
  });

  // ═══════════════════════════════════════════════════════════
  // Skills
  // ═══════════════════════════════════════════════════════════

  it("GET /computer/skills lists all skills", async () => {
    const res = await fetch("/computer/skills");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.skills));
    assert.ok(res.body.skills.length >= 4);
  });

  it("GET /computer/skills?category=file_ops filters by category", async () => {
    const res = await fetch("/computer/skills?category=file_ops");
    assert.equal(res.status, 200);
    assert.ok(res.body.skills.every((s) => s.category === "file_ops"));
  });

  it("GET /computer/skills?trustLevel=builtin filters by trust level", async () => {
    const res = await fetch("/computer/skills?trustLevel=builtin");
    assert.equal(res.status, 200);
    // All returned should match trustLevel or category
    assert.ok(res.body.skills.length >= 1);
  });

  it("POST /computer/skills/find searches for matching skills", async () => {
    const res = await fetch("/computer/skills/find", {
      method: "POST",
      body: { description: "read a file from disk" },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.matches));
    assert.ok(res.body.matches.length >= 1);
    assert.equal(res.body.matches[0].name, "file_read");
  });

  it("POST /computer/skills/find validates description", async () => {
    const res = await fetch("/computer/skills/find", {
      method: "POST",
      body: {},
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes("description"));
  });

  // ═══════════════════════════════════════════════════════════
  // Workflow Templates
  // ═══════════════════════════════════════════════════════════

  it("GET /computer/workflows returns empty list initially", async () => {
    const res = await fetch("/computer/workflows");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.templates));
  });

  it("POST /computer/workflows saves a template from steps", async () => {
    const res = await fetch("/computer/workflows", {
      method: "POST",
      body: {
        name: "test-workflow",
        description: "A test workflow",
        steps: [
          { id: "s1", description: "Do {{task}}", agentType: "coder", args: { target: "{{file}}" }, dependsOn: [] },
          { id: "s2", description: "Verify {{task}}", agentType: "tester", args: {}, dependsOn: ["s1"] },
        ],
        goal: "Run {{task}} on {{file}}",
        category: "testing",
      },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.template);
    assert.equal(res.body.template.name, "test-workflow");
  });

  it("POST /computer/workflows validates name", async () => {
    const res = await fetch("/computer/workflows", {
      method: "POST",
      body: { name: "", steps: [{ description: "x" }] },
    });
    assert.equal(res.status, 400);
  });

  it("GET /computer/workflows/:name returns a saved template", async () => {
    const res = await fetch("/computer/workflows/test-workflow");
    assert.equal(res.status, 200);
    assert.ok(res.body.template);
    assert.equal(res.body.template.name, "test-workflow");
    assert.equal(res.body.template.steps.length, 2);
  });

  it("GET /computer/workflows/:name returns 404 for unknown", async () => {
    const res = await fetch("/computer/workflows/nonexistent");
    assert.equal(res.status, 404);
  });

  it("POST /computer/workflows/:name/run executes a template", async () => {
    const res = await fetch("/computer/workflows/test-workflow/run", {
      method: "POST",
      body: { variables: { task: "linting", file: "src/index.js" } },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.id);
    assert.ok(res.body.steps);
  });

  it("POST /computer/workflows/:name/run returns 404 for unknown template", async () => {
    const res = await fetch("/computer/workflows/nope/run", {
      method: "POST",
      body: { variables: {} },
    });
    assert.equal(res.status, 404);
  });

  // ═══════════════════════════════════════════════════════════
  // Audit Trail
  // ═══════════════════════════════════════════════════════════

  it("GET /computer/audit returns audit entries", async () => {
    const res = await fetch("/computer/audit");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.entries));
    assert.ok(res.body.entries.length >= 1); // At least the run from earlier
  });

  it("GET /computer/audit?action=computer-run filters by action", async () => {
    const res = await fetch("/computer/audit?action=computer-run");
    assert.equal(res.status, 200);
    assert.ok(res.body.entries.every((e) => e.action === "computer-run"));
  });

  it("GET /computer/audit?limit=1 limits results", async () => {
    const res = await fetch("/computer/audit?limit=1");
    assert.equal(res.status, 200);
    assert.ok(res.body.entries.length <= 1);
  });
});
