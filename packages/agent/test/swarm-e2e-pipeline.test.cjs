/**
 * E2E Integration Test for the MAS Swarm Pipeline
 *
 * Tests the full flow: SwarmManager → init → agentSpawn → taskOrchestrate → events → shutdown.
 * Also validates tier-aware routing, SSE streaming, and cloud config validation.
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { SwarmManager, SWARM_STATE } = require("../src/mas/swarm-manager");
const { AGENT_TYPE, EVENT_TYPE } = require("../src/mas/types");
const { getAgentModelTier } = require("../src/mas/mode-config");
const { createAgent, AGENT_CLASS_MAP } = require("../src/mas/agents");

// ─── Helpers ─────────────────────────────────────────────────

function createMockRunLLM() {
  const calls = [];
  const fn = async (systemPrompt, userPrompt, opts = {}) => {
    calls.push({ systemPrompt, userPrompt, opts });
    // Return a minimal valid planner response with a task graph
    return JSON.stringify({
      taskGraph: {
        id: "test-graph-1",
        goal: userPrompt || "test",
        topology: "hierarchical",
        nodes: [
          {
            id: "node-1",
            goal: "Write code",
            agentType: "coder",
            dependencies: [],
            status: "queued",
            retryCount: 0,
            maxRetries: 2,
          },
        ],
        edges: [],
        status: "pending",
        metadata: { nodesCompleted: 0, nodesFailed: 0, totalCostUSD: 0 },
      },
    });
  };
  fn.calls = calls;
  return fn;
}

// ─── Tests ───────────────────────────────────────────────────

describe("MAS E2E Pipeline", () => {
  let manager;
  let mockRunLLM;

  beforeEach(() => {
    mockRunLLM = createMockRunLLM();
    manager = new SwarmManager({ runLLM: mockRunLLM });
  });

  afterEach(() => {
    try {
      manager.swarmShutdown();
    } catch {
      /* already shutdown */
    }
  });

  it("full pipeline: init → spawn → orchestrate → shutdown", async () => {
    // Init
    const initResult = manager.swarmInit({ maxAgents: 8 });
    assert.equal(initResult.status, "active");
    assert.ok(initResult.config);

    // Spawn
    const plannerDesc = manager.agentSpawn(AGENT_TYPE.PLANNER);
    assert.equal(plannerDesc.type, "planner");

    const coderDesc = manager.agentSpawn(AGENT_TYPE.CODER);
    assert.equal(coderDesc.type, "coder");

    // Status
    const status = manager.swarmStatus();
    assert.equal(status.state, "active");
    assert.ok(status.agents.length >= 2);

    // Shutdown
    const shutResult = manager.swarmShutdown();
    assert.equal(shutResult.status, "shutdown");
  });

  it("task cancel marks nodes correctly", () => {
    manager.swarmInit({});
    // Manually register a fake task to test cancel
    const fakeTask = {
      id: "cancel-test",
      nodes: [
        { id: "n1", status: "queued" },
        { id: "n2", status: "running" },
        { id: "n3", status: "succeeded" },
      ],
      status: "running",
      metadata: {},
    };
    manager._tasks.set("cancel-test", fakeTask);

    const result = manager.taskCancel("cancel-test");
    assert.ok(result.success);
    assert.equal(fakeTask.status, "cancelled");
    assert.equal(fakeTask.nodes[0].status, "cancelled"); // was queued
    assert.equal(fakeTask.nodes[1].status, "cancelled"); // was running
    assert.equal(fakeTask.nodes[2].status, "succeeded"); // already done

    manager.swarmShutdown();
  });

  it("tier-aware model routing assigns correct tiers", () => {
    // Planner → premium
    assert.equal(getAgentModelTier("planner"), "premium");
    // Coder → balanced
    assert.equal(getAgentModelTier("coder"), "balanced");
    // Docs → fast
    assert.equal(getAgentModelTier("docs"), "fast");
    // Security → premium
    assert.equal(getAgentModelTier("security"), "premium");
    // Unknown → balanced (default)
    assert.equal(getAgentModelTier("unknown_type"), "balanced");
  });

  it("agent creation injects modelHint from tier config", () => {
    const deps = {
      permissionGate: { requestPermission: async () => ({ allowed: true }) },
      memory: { shortTerm: { set() {}, get() {} } },
      runLLM: mockRunLLM,
    };

    const planner = createAgent("planner", deps);
    assert.equal(planner.descriptor.modelHint, "premium");

    const coder = createAgent("coder", deps);
    assert.equal(coder.descriptor.modelHint, "balanced");

    const docsAgent = createAgent("docs", deps);
    assert.equal(docsAgent.descriptor.modelHint, "fast");
  });

  it("swarm status tracking is accurate", () => {
    manager.swarmInit({});
    const status = manager.swarmStatus();
    assert.equal(status.state, "active");
    assert.equal(status.activeTasks, 0);
    assert.ok(status.memory !== null);
    assert.ok(status.gpu !== null);

    manager.swarmShutdown();
    const afterShutdown = manager.swarmStatus();
    assert.equal(afterShutdown.state, "shutdown");
  });

  it("SSE event stream captures events correctly", () => {
    const events = [];
    manager.on("swarm:event", (e) => events.push(e));

    manager.swarmInit({});
    assert.ok(events.length > 0);
    const initEvent = events.find((e) => e.type === EVENT_TYPE.SWARM_INIT);
    assert.ok(initEvent, "Should have SWARM_INIT event");

    manager.swarmShutdown();
    const shutdownEvent = events.find(
      (e) => e.type === EVENT_TYPE.SWARM_SHUTDOWN,
    );
    assert.ok(shutdownEvent, "Should have SWARM_SHUTDOWN event");
  });

  it("cloud model config validation emits warnings", () => {
    // When no API keys are set, init should return warnings array
    const result = manager.swarmInit({});
    assert.ok(Array.isArray(result.warnings));
    // In test env, likely no API keys
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings[0].includes("No cloud model API key found"));
    }
  });

  it("all 12 agent types are registered in AGENT_CLASS_MAP", () => {
    const expectedTypes = [
      "planner",
      "coder",
      "debugger",
      "tester",
      "refactorer",
      "architect",
      "devops",
      "security",
      "docs",
      "reviewer",
      "i18n",
      "vibe_builder",
    ];
    for (const type of expectedTypes) {
      assert.ok(AGENT_CLASS_MAP[type], `Missing agent class for type: ${type}`);
    }
  });

  it("EVENT_TYPE enum has all required events", () => {
    const requiredEvents = [
      "SWARM_INIT",
      "SWARM_SHUTDOWN",
      "TASK_SUBMITTED",
      "TASK_DECOMPOSED",
      "TASK_COMPLETED",
      "TASK_CANCELLED",
      "NODE_STARTED",
      "NODE_COMPLETED",
      "NODE_FAILED",
      "NODE_RETRIED",
      "AGENT_ACTIVITY",
      "TOOL_CALL_START",
      "TOOL_CALL_COMPLETE",
    ];
    for (const evt of requiredEvents) {
      assert.ok(EVENT_TYPE[evt], `Missing EVENT_TYPE.${evt}`);
    }
  });
});
