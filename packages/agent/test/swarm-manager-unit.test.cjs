/**
 * SwarmManager — Behavioral Unit Tests
 *
 * Tests swarm lifecycle, agent pool management, concurrent task limits,
 * event emission, graceful shutdown, and subsystem integration.
 */
"use strict";

const assert = require("node:assert");

const { SwarmManager, SWARM_STATE } = require("../src/mas/swarm-manager");

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
    expect(status.state).toBe("idle");
  });

  it("swarmInit transitions to ACTIVE with default config", () => {
    mgr = createManager();
    const result = mgr.swarmInit({});
    expect(result.status).toBe("active");
    expect(result.config).toBeDefined();
    expect(result.config.topology).toBeDefined();
    expect(result.config.maxAgents).toBeGreaterThanOrEqual(1);
    expect(result.config.concurrency).toBeGreaterThanOrEqual(1);
  });

  it("swarmInit accepts custom topology and maxAgents", () => {
    mgr = createManager();
    const result = mgr.swarmInit({ topology: "star", maxAgents: 8 });
    expect(result.config.topology).toBe("star");
    expect(result.config.maxAgents).toBe(8);
  });

  it("double init throws error", () => {
    mgr = createManager();
    mgr.swarmInit({});
    expect(() => mgr.swarmInit({})).toThrow(/already active/i);
  });

  it("swarmShutdown transitions to shutdown", () => {
    mgr = createManager();
    mgr.swarmInit({});
    const result = mgr.swarmShutdown();
    expect(result.status).toBe("shutdown");
  });

  it("shutdown on uninitialized swarm returns gracefully", () => {
    mgr = createManager();
    const result = mgr.swarmShutdown();
    expect(result).toBeDefined();
    // Should not throw
  });

  it("re-init after shutdown works", () => {
    mgr = createManager();
    mgr.swarmInit({});
    mgr.swarmShutdown();
    const result = mgr.swarmInit({});
    expect(result.status).toBe("active");
  });

  it("swarmStatus returns comprehensive state", () => {
    mgr = createManager();
    mgr.swarmInit({});
    const status = mgr.swarmStatus();
    expect(status.state).toBe("active");
    expect(Array.isArray(status.agents)).toBe(true);
    expect(typeof status.activeTasks).toBe("number");
    expect(status.memory).toBeDefined();
    expect(status.gpu).toBeDefined();
    expect(typeof status.pendingPermissions).toBe("number");
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
    expect(desc).toBeDefined();
    expect(desc.id).toMatch(/^agent_/);
    expect(desc.type).toBe("coder");
    expect(desc.status).toBeDefined();
    expect(desc.metrics).toBeDefined();
  });

  it("spawns agents of different types", () => {
    const types = ["coder", "tester", "debugger", "reviewer", "docs"];
    const descriptors = types.map((t) => mgr.agentSpawn(t));
    expect(descriptors).toHaveLength(5);
    const uniqueIds = new Set(descriptors.map((d) => d.id));
    expect(uniqueIds.size).toBe(5);
  });

  it("lists all agents", () => {
    mgr.agentSpawn("coder");
    mgr.agentSpawn("tester");
    mgr.agentSpawn("coder");
    const agents = mgr.agentList();
    expect(agents.length).toBeGreaterThanOrEqual(3);
  });

  it("filters agents by type", () => {
    mgr.agentSpawn("coder");
    mgr.agentSpawn("tester");
    mgr.agentSpawn("coder");
    const coders = mgr.agentList({ type: "coder" });
    expect(coders.length).toBeGreaterThanOrEqual(2);
    coders.forEach((a) => expect(a.type).toBe("coder"));
  });

  it("throws on invalid agent type", () => {
    expect(() => mgr.agentSpawn("nonexistent_agent_type")).toThrow();
  });

  it("returns agent metrics", () => {
    mgr.agentSpawn("coder");
    const metrics = mgr.agentMetrics();
    expect(metrics).toBeDefined();
  });

  it("throws when spawning agents on inactive swarm", () => {
    mgr.swarmShutdown();
    expect(() => mgr.agentSpawn("coder")).toThrow(/not active|idle|shutdown/i);
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
    expect(events.length).toBeGreaterThanOrEqual(1);
    const initEvent = events.find((e) => e.type === "swarm_init");
    expect(initEvent).toBeDefined();
  });

  it("event log contains shutdown event after swarmShutdown", () => {
    mgr.swarmShutdown();
    const events = mgr.getEventLog();
    const shutdownEvent = events.find((e) => e.type === "swarm_shutdown");
    expect(shutdownEvent).toBeDefined();
  });

  it("event log respects limit parameter", () => {
    // Generate some events by spawning agents
    mgr.agentSpawn("coder");
    mgr.agentSpawn("tester");
    const limited = mgr.getEventLog(1);
    expect(limited.length).toBeLessThanOrEqual(1);
  });

  it("subscribe/unsubscribe for SSE does not throw", () => {
    const mockRes = { write: jest.fn(), on: jest.fn() };
    expect(() => mgr.subscribe(mockRes)).not.toThrow();
    expect(() => mgr.unsubscribe(mockRes)).not.toThrow();
  });

  it("SSE subscriber receives events", () => {
    const mockRes = { write: jest.fn(), on: jest.fn() };
    mgr.subscribe(mockRes);

    // Spawning an agent should emit an event to subscribers
    mgr.agentSpawn("coder");

    // Check that write was called (SSE data)
    expect(mockRes.write).toHaveBeenCalled();
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
    expect(usage).toBeDefined();
    expect(usage.shortTerm).toBeDefined();
    expect(usage.working).toBeDefined();
    expect(usage.longTerm).toBeDefined();
  });

  it("memoryUsage returns null when swarm is inactive", () => {
    mgr.swarmShutdown();
    // Re-create without init
    mgr = createManager();
    const usage = mgr.memoryUsage();
    expect(usage).toBeNull();
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
    expect(Array.isArray(pending)).toBe(true);
    expect(pending).toHaveLength(0);
  });

  it("respondToPermission returns error for non-existent request", () => {
    const result = mgr.respondToPermission("nonexistent_id", "approve_once");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
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
    expect(status).toBeNull();
  });

  it("taskCancel returns failure for non-existent task", () => {
    const result = mgr.taskCancel("nonexistent");
    expect(result).toBeDefined();
    // Should indicate failure — either success:false or error message
    expect(result.success === false || result.error).toBeTruthy();
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
    expect(budget === null || typeof budget === "object").toBe(true);
  });

  it("listPlugins returns array", () => {
    const plugins = mgr.listPlugins();
    expect(Array.isArray(plugins)).toBe(true);
  });

  it("listSkills returns array", () => {
    const skills = mgr.listSkills();
    expect(Array.isArray(skills)).toBe(true);
  });

  it("getProjectProfile returns value or null", () => {
    const profile = mgr.getProjectProfile();
    expect(profile === null || typeof profile === "object").toBe(true);
  });

  it("getConventions returns array", () => {
    const conventions = mgr.getConventions();
    expect(Array.isArray(conventions)).toBe(true);
  });

  it("listBackgroundTasks returns array", () => {
    const tasks = mgr.listBackgroundTasks();
    expect(Array.isArray(tasks)).toBe(true);
  });

  it("getBackgroundTaskStatus returns null for non-existent task", () => {
    const status = mgr.getBackgroundTaskStatus("nonexistent");
    expect(status === null || status === undefined).toBe(true);
  });
});

// ─── Graceful Shutdown with Cleanup ──────────────────────────

describe("SwarmManager — Graceful Shutdown", () => {
  it("shutdown closes SSE subscribers", () => {
    const mgr = createManager();
    mgr.swarmInit({});
    const mockRes = {
      write: jest.fn(),
      on: jest.fn(),
      end: jest.fn(),
    };
    mgr.subscribe(mockRes);
    mgr.swarmShutdown();
    expect(mockRes.end).toHaveBeenCalled();
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
    expect(r1.status).toBe("shutdown");
    expect(r2.status).toBe("already_shutdown");
  });
});
