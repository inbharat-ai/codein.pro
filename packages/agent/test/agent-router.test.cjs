/**
 * Tests for AgentRouter — agent pool management
 */
"use strict";

const assert = require("node:assert");

let AgentRouter;
try {
  ({ AgentRouter } = require("../src/mas/agent-router"));
} catch (err) {
  console.log("agent-router.js not loadable:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

const { AGENT_TYPE, AGENT_STATUS } = require("../src/mas/types");

// No process.exit hack needed — AgentRouter has no EventEmitter keeping process alive

// Minimal deps for constructing AgentRouter
function makeDeps() {
  return {
    permissionGate: {
      check: async () => ({ decision: "approve_once" }),
      cancelAllPending: () => {},
    },
    memory: {
      shortTerm: { set: () => {}, get: () => undefined, prune: () => 0, size: () => 0, destroy: () => {} },
      working: {
        set: () => {},
        get: () => undefined,
        setPlan: () => {},
        recordDecision: () => {},
        setPermissionGrant: () => {},
        clearPermissionGrants: () => {},
        getBudget: () => ({ spent: 0, cap: 10 }),
        getLanguage: () => "en",
        getDecisionHistory: () => [],
        size: () => 0,
        clear: () => {},
      },
      longTerm: { set: () => {}, get: () => undefined, size: () => 0, prune: () => 0, destroy: () => {} },
      blackboard: { post: () => {}, read: () => [], setShared: () => {}, getShared: () => undefined, clear: () => {} },
    },
    emitEvent: () => {},
    runLLM: async () => "{}",
  };
}

describe("AgentRouter", () => {
  let router;

  beforeEach(() => {
    router = new AgentRouter({}, makeDeps());
  });

  it("routes (spawns) an agent by type", () => {
    const agent = router.route(AGENT_TYPE.CODER);
    assert.ok(agent);
    assert.ok(agent.descriptor);
    assert.strictEqual(agent.descriptor.type, "coder");
  });

  it("routed agent is in busy state", () => {
    const agent = router.route(AGENT_TYPE.CODER);
    assert.strictEqual(agent.descriptor.status, AGENT_STATUS.BUSY);
  });

  it("releases an agent back to idle", () => {
    const agent = router.route(AGENT_TYPE.CODER);
    router.release(agent.descriptor.id);
    assert.strictEqual(agent.descriptor.status, AGENT_STATUS.IDLE);
  });

  it("double-release does not throw", () => {
    const agent = router.route(AGENT_TYPE.CODER);
    router.release(agent.descriptor.id);
    assert.doesNotThrow(() => router.release(agent.descriptor.id));
  });

  it("reuses idle agent of same type", () => {
    const a1 = router.route(AGENT_TYPE.CODER);
    router.release(a1.descriptor.id);
    const a2 = router.route(AGENT_TYPE.CODER);
    assert.strictEqual(a1.descriptor.id, a2.descriptor.id);
  });

  it("spawns new agent when all of type are busy", () => {
    const a1 = router.route(AGENT_TYPE.CODER);
    const a2 = router.route(AGENT_TYPE.CODER);
    assert.notStrictEqual(a1.descriptor.id, a2.descriptor.id);
  });

  it("lists all agents", () => {
    router.route(AGENT_TYPE.CODER);
    router.route(AGENT_TYPE.TESTER);
    const list = router.list();
    assert.ok(Array.isArray(list));
    assert.strictEqual(list.length, 2);
  });

  it("lists agents with type filter", () => {
    router.route(AGENT_TYPE.CODER);
    router.route(AGENT_TYPE.TESTER);
    router.route(AGENT_TYPE.CODER);
    const coders = router.list({ type: "coder" });
    assert.strictEqual(coders.length, 2);
  });

  it("lists agents with status filter", () => {
    const a1 = router.route(AGENT_TYPE.CODER);
    router.route(AGENT_TYPE.TESTER);
    router.release(a1.descriptor.id);
    const idle = router.list({ status: AGENT_STATUS.IDLE });
    assert.strictEqual(idle.length, 1);
    assert.strictEqual(idle[0].type, "coder");
  });

  it("gets agent by ID", () => {
    const agent = router.route(AGENT_TYPE.CODER);
    const found = router.get(agent.descriptor.id);
    assert.ok(found);
    assert.strictEqual(found.descriptor.id, agent.descriptor.id);
  });

  it("returns null for unknown agent ID", () => {
    assert.strictEqual(router.get("nonexistent"), null);
  });

  it("returns aggregate metrics", () => {
    router.route(AGENT_TYPE.CODER);
    router.route(AGENT_TYPE.TESTER);
    const metrics = router.metrics();
    assert.ok(metrics);
    assert.strictEqual(metrics.agentCount, 2);
    assert.strictEqual(typeof metrics.tasksCompleted, "number");
    assert.strictEqual(typeof metrics.toolCalls, "number");
    assert.strictEqual(typeof metrics.totalTimeMs, "number");
    assert.strictEqual(typeof metrics.totalCostUSD, "number");
  });

  it("returns individual agent metrics", () => {
    const agent = router.route(AGENT_TYPE.CODER);
    const metrics = router.metrics(agent.descriptor.id);
    assert.ok(metrics);
  });

  it("returns null metrics for unknown agent", () => {
    assert.strictEqual(router.metrics("nonexistent"), null);
  });

  it("shutdown clears all agents", () => {
    router.route(AGENT_TYPE.CODER);
    router.route(AGENT_TYPE.TESTER);
    router.shutdown();
    const list = router.list();
    assert.strictEqual(list.length, 0);
  });

  it("throws on unknown agent type", () => {
    assert.throws(() => router.route("nonexistent_agent_type"));
  });

  it("respects maxAgents cap", () => {
    const smallRouter = new AgentRouter({ maxAgents: 2 }, makeDeps());
    smallRouter.route(AGENT_TYPE.CODER);
    smallRouter.route(AGENT_TYPE.TESTER);
    assert.throws(() => smallRouter.route(AGENT_TYPE.DEBUGGER));
  });
});
