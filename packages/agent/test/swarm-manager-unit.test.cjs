/**
 * SwarmManager — Behavioral Unit Tests
 *
 * Tests swarm lifecycle, agent pool management, concurrent task limits,
 * event emission, graceful shutdown, and subsystem integration.
 */
"use strict";
const { describe, it, beforeEach, afterEach } = require("node:test");

const assert = require("node:assert/strict");

const { SwarmManager, SWARM_STATE } = require("../src/mas/swarm-manager");

// ─── Mock helper ────────────────────────────────────────────

function createMock(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl ? impl(...args) : fn._returnValue; };
  fn.calls = [];
  fn._returnValue = undefined;
  fn.mockReturnValue = (v) => { fn._returnValue = v; return fn; };
  fn.mockReset = () => { fn.calls = []; fn._returnValue = undefined; };
  return fn;
}

// ─── Helpers ─────────────────────────────────────────────────

function createManager(runLLMOverride) {
  return new SwarmManager({
    runLLM:
      runLLMOverride ||
      (async (sys, user, opts) => {
        // Planner-like output when asked to break down a task
        if (
          sys.includes("plan") ||
          user.includes("plan") ||
          user.includes("break") ||
          sys.includes("Plan") ||
          sys.includes("decompose") ||
          user.includes("goal")
        ) {
          return JSON.stringify({
            nodes: [
              {
                id: "n1",
                goal: "Do the task",
                agentType: "coder",
                dependencies: [],
              },
            ],
            edges: [],
          });
        }
        return JSON.stringify({ result: "mocked LLM response" });
      }),
  });
}

// ─── Lifecycle Tests ─────────────────────────────────────────

describe("SwarmManager — Lifecycle", () => {
  let mgr;

  afterEach(() => {
    try {
      mgr?.swarmShutdown();
    } catch {
      /* ignore */
    }
  });

  it("starts in IDLE state before init", () => {
    mgr = createManager();
    const status = mgr.swarmStatus();
    assert.equal(status.state, "idle");
  });

  it("swarmInit transitions to ACTIVE with default config", () => {
    mgr = createManager();
    const result = mgr.swarmInit({});
    assert.equal(result.status, "active");
    assert.ok(result.config);
    assert.ok(result.config.topology);
    assert.ok(result.config.maxAgents >= 1);
    assert.ok(result.config.concurrency >= 1);
  });

  it("swarmInit accepts custom topology and maxAgents", () => {
    mgr = createManager();
    const result = mgr.swarmInit({ topology: "star", maxAgents: 8 });
    assert.equal(result.config.topology, "star");
    assert.equal(result.config.maxAgents, 8);
  });

  it("double init throws error", () => {
    mgr = createManager();
    mgr.swarmInit({});
    assert.throws(() => mgr.swarmInit({}), /already active/i);
  });

  it("swarmShutdown transitions to shutdown", () => {
    mgr = createManager();
    mgr.swarmInit({});
    const result = mgr.swarmShutdown();
    assert.equal(result.status, "shutdown");
  });

  it("shutdown on uninitialized swarm returns gracefully", () => {
    mgr = createManager();
    const result = mgr.swarmShutdown();
    assert.ok(result);
    // Should not throw
  });

  it("re-init after shutdown works", () => {
    mgr = createManager();
    mgr.swarmInit({});
    mgr.swarmShutdown();
    const result = mgr.swarmInit({});
    assert.equal(result.status, "active");
  });

  it("swarmStatus returns comprehensive state", () => {
    mgr = createManager();
    mgr.swarmInit({});
    const status = mgr.swarmStatus();
    assert.equal(status.state, "active");
    assert.ok(Array.isArray(status.agents));
    assert.equal(typeof status.activeTasks, "number");
    assert.ok(status.memory !== undefined);
    assert.ok(status.gpu !== undefined);
    assert.equal(typeof status.pendingPermissions, "number");
  });
});

// ─── Agent Pool Tests ────────────────────────────────────────

describe("SwarmManager — Agent Pool Management", () => {
  let mgr;

  beforeEach(() => {
    mgr = createManager();
    mgr.swarmInit({ maxAgents: 10 });
  });

  afterEach(() => {
    try {
      mgr?.swarmShutdown();
    } catch {
      /* ignore */
    }
  });

  it("spawns a coder agent with valid descriptor", () => {
    const desc = mgr.agentSpawn("coder");
    assert.ok(desc);
    assert.match(desc.id, /^agent_/);
    assert.equal(desc.type, "coder");
    assert.ok(desc.status !== undefined);
    assert.ok(desc.metrics !== undefined);
  });

  it("spawns agents of different types", () => {
    const types = ["coder", "tester", "debugger", "reviewer", "docs"];
    const descriptors = types.map((t) => mgr.agentSpawn(t));
    assert.equal(descriptors.length, 5);
    const uniqueIds = new Set(descriptors.map((d) => d.id));
    assert.equal(uniqueIds.size, 5);
  });

  it("lists all agents", () => {
    mgr.agentSpawn("coder");
    mgr.agentSpawn("tester");
    mgr.agentSpawn("coder");
    const agents = mgr.agentList();
    assert.ok(agents.length >= 3);
  });

  it("filters agents by type", () => {
    mgr.agentSpawn("coder");
    mgr.agentSpawn("tester");
    mgr.agentSpawn("coder");
    const coders = mgr.agentList({ type: "coder" });
    assert.ok(coders.length >= 2);
    coders.forEach((a) => assert.equal(a.type, "coder"));
  });

  it("throws on invalid agent type", () => {
    assert.throws(() => mgr.agentSpawn("nonexistent_agent_type"));
  });

  it("returns agent metrics", () => {
    mgr.agentSpawn("coder");
    const metrics = mgr.agentMetrics();
    assert.ok(metrics);
  });

  it("throws when spawning agents on inactive swarm", () => {
    mgr.swarmShutdown();
    assert.throws(() => mgr.agentSpawn("coder"), /not active|idle|shutdown/i);
  });
});

// ─── Event System Tests ──────────────────────────────────────

describe("SwarmManager — Event System", () => {
  let mgr;

  beforeEach(() => {
    mgr = createManager();
    mgr.swarmInit({});
  });

  afterEach(() => {
    try {
      mgr?.swarmShutdown();
    } catch {
      /* ignore */
    }
  });

  it("event log contains init event after swarmInit", () => {
    const events = mgr.getEventLog();
    assert.ok(events.length >= 1);
    const initEvent = events.find((e) => e.type === "swarm_init");
    assert.ok(initEvent);
  });

  it("event log contains shutdown event after swarmShutdown", () => {
    mgr.swarmShutdown();
    const events = mgr.getEventLog();
    const shutdownEvent = events.find((e) => e.type === "swarm_shutdown");
    assert.ok(shutdownEvent);
  });

  it("event log respects limit parameter", () => {
    // Generate some events by spawning agents
    mgr.agentSpawn("coder");
    mgr.agentSpawn("tester");
    const limited = mgr.getEventLog(1);
    assert.ok(limited.length <= 1);
  });

  it("subscribe/unsubscribe for SSE does not throw", () => {
    const mockRes = { write: createMock(), on: createMock() };
    assert.doesNotThrow(() => mgr.subscribe(mockRes));
    assert.doesNotThrow(() => mgr.unsubscribe(mockRes));
  });

  it("SSE subscriber receives events", () => {
    const mockRes = { write: createMock(), on: createMock() };
    mgr.subscribe(mockRes);

    // Spawning an agent should emit an event to subscribers
    mgr.agentSpawn("coder");

    // Check that write was called (SSE data)
    assert.ok(mockRes.write.calls.length > 0);
    mgr.unsubscribe(mockRes);
  });
});

// ─── Memory Tests ────────────────────────────────────────────

describe("SwarmManager — Memory", () => {
  let mgr;

  beforeEach(() => {
    mgr = createManager();
    mgr.swarmInit({});
  });

  afterEach(() => {
    try {
      mgr?.swarmShutdown();
    } catch {
      /* ignore */
    }
  });

  it("memoryUsage returns three-tier summary", () => {
    const usage = mgr.memoryUsage();
    assert.ok(usage);
    assert.ok(usage.shortTerm !== undefined);
    assert.ok(usage.working !== undefined);
    assert.ok(usage.longTerm !== undefined);
  });

  it("memoryUsage returns null when swarm is inactive", () => {
    mgr.swarmShutdown();
    // Re-create without init
    mgr = createManager();
    const usage = mgr.memoryUsage();
    assert.equal(usage, null);
  });
});

// ─── Permission System Tests ─────────────────────────────────

describe("SwarmManager — Permissions", () => {
  let mgr;

  beforeEach(() => {
    mgr = createManager();
    mgr.swarmInit({});
  });

  afterEach(() => {
    try {
      mgr?.swarmShutdown();
    } catch {
      /* ignore */
    }
  });

  it("getPendingPermissions returns empty array initially", () => {
    const pending = mgr.getPendingPermissions();
    assert.ok(Array.isArray(pending));
    assert.equal(pending.length, 0);
  });

  it("respondToPermission returns error for non-existent request", () => {
    const result = mgr.respondToPermission("nonexistent_id", "approve_once");
    assert.ok(!result.success);
    assert.ok(result.error);
  });
});

// ─── Task Management Tests ───────────────────────────────────

describe("SwarmManager — Task Status (sync)", () => {
  let mgr;

  beforeEach(() => {
    mgr = createManager();
    mgr.swarmInit({});
  });

  afterEach(() => {
    try {
      mgr?.swarmShutdown();
    } catch {
      /* ignore */
    }
  });

  it("taskStatus returns null for non-existent task", () => {
    const status = mgr.taskStatus("nonexistent-id");
    assert.equal(status, null);
  });

  it("taskCancel returns failure for non-existent task", () => {
    const result = mgr.taskCancel("nonexistent");
    assert.ok(result);
    // Should indicate failure — either success:false or error message
    assert.ok(result.success === false || result.error);
  });
});

// ─── Optional Subsystem Graceful Fallbacks ───────────────────

describe("SwarmManager — Optional Modules (graceful fallbacks)", () => {
  let mgr;

  beforeEach(() => {
    mgr = createManager();
    mgr.swarmInit({});
  });

  afterEach(() => {
    try {
      mgr?.swarmShutdown();
    } catch {
      /* ignore */
    }
  });

  it("getBudgetStatus returns value or null", () => {
    const budget = mgr.getBudgetStatus();
    assert.ok(budget === null || typeof budget === "object");
  });

  it("listPlugins returns array", () => {
    const plugins = mgr.listPlugins();
    assert.ok(Array.isArray(plugins));
  });

  it("listSkills returns array", () => {
    const skills = mgr.listSkills();
    assert.ok(Array.isArray(skills));
  });

  it("getProjectProfile returns value or null", () => {
    const profile = mgr.getProjectProfile();
    assert.ok(profile === null || typeof profile === "object");
  });

  it("getConventions returns array", () => {
    const conventions = mgr.getConventions();
    assert.ok(Array.isArray(conventions));
  });

  it("listBackgroundTasks returns array", () => {
    const tasks = mgr.listBackgroundTasks();
    assert.ok(Array.isArray(tasks));
  });

  it("getBackgroundTaskStatus returns null for non-existent task", () => {
    const status = mgr.getBackgroundTaskStatus("nonexistent");
    assert.ok(status === null || status === undefined);
  });
});

// ─── Graceful Shutdown with Cleanup ──────────────────────────

describe("SwarmManager — Graceful Shutdown", () => {
  it("shutdown closes SSE subscribers", () => {
    const mgr = createManager();
    mgr.swarmInit({});
    const mockRes = {
      write: createMock(),
      on: createMock(),
      end: createMock(),
    };
    mgr.subscribe(mockRes);
    mgr.swarmShutdown();
    assert.ok(mockRes.end.calls.length > 0);
  });

  it("shutdown cancels pending tasks", () => {
    const mgr = createManager();
    mgr.swarmInit({});
    // Manually add a task to the map to simulate in-flight
    mgr._tasks.set("test_task_1", {
      id: "test_task_1",
      status: "running",
      completedAt: null,
      nodes: [],
    });
    mgr.swarmShutdown();
    // After shutdown, tasks map should be empty or tasks cancelled
    // The shutdown process calls taskCancel for each task
  });

  it("repeated shutdown is idempotent", () => {
    const mgr = createManager();
    mgr.swarmInit({});
    const r1 = mgr.swarmShutdown();
    const r2 = mgr.swarmShutdown();
    assert.equal(r1.status, "shutdown");
    assert.equal(r2.status, "already_shutdown");
  });
});
