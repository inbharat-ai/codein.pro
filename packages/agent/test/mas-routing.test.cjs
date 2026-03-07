/**
 * MAS — Agent Router & Topology Tests
 *
 * Covers AgentRouter pool management and topology schedulers.
 */
const assert = require("node:assert/strict");
const test = require("node:test");

const { AgentRouter } = require("../src/mas/agent-router");
const {
  TOPOLOGY_MAP,
  createTopologyScheduler,
} = require("../src/mas/topologies/index");
const {
  TOPOLOGY,
  AGENT_TYPE,
  AGENT_STATUS,
  NODE_STATUS,
  createTaskNode,
  createTaskGraph,
} = require("../src/mas/types");
const { MemoryManager } = require("../src/mas/memory");
const { PermissionGate } = require("../src/mas/permissions");

// ── Topology Registry ──

test("TOPOLOGY_MAP is frozen with 4 topologies", () => {
  assert.ok(Object.isFrozen(TOPOLOGY_MAP));
  assert.equal(Object.keys(TOPOLOGY_MAP).length, 4);
  assert.ok(TOPOLOGY_MAP[TOPOLOGY.MESH]);
  assert.ok(TOPOLOGY_MAP[TOPOLOGY.HIERARCHICAL]);
  assert.ok(TOPOLOGY_MAP[TOPOLOGY.RING]);
  assert.ok(TOPOLOGY_MAP[TOPOLOGY.STAR]);
});

test("createTopologyScheduler returns instances", () => {
  for (const t of Object.values(TOPOLOGY)) {
    const scheduler = createTopologyScheduler(t);
    assert.ok(scheduler);
    assert.ok(typeof scheduler.buildGraph === "function");
    assert.ok(typeof scheduler.getNextNodes === "function");
    assert.ok(typeof scheduler.mergeResults === "function");
  }
});

test("createTopologyScheduler throws on unknown topology", () => {
  assert.throws(() => createTopologyScheduler("hexagonal"), /Unknown topology/);
});

// ── Mesh Scheduler ──

test("mesh topology clears all dependencies", () => {
  const scheduler = createTopologyScheduler(TOPOLOGY.MESH);
  const n1 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "a" });
  const n2 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "b" });
  n2.dependencies = [n1.id];
  const graph = createTaskGraph({ goal: "test" });
  graph.nodes = [n1, n2];

  scheduler.buildGraph(graph);
  assert.deepEqual(graph.nodes[1].dependencies, []);
});

test("mesh getNextNodes returns all queued nodes", () => {
  const scheduler = createTopologyScheduler(TOPOLOGY.MESH);
  const n1 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "a" });
  const n2 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "b" });
  // createTaskNode already sets status to QUEUED
  const graph = createTaskGraph({ goal: "test" });
  graph.nodes = [n1, n2];
  scheduler.buildGraph(graph);

  const ready = scheduler.getNextNodes(graph);
  assert.equal(ready.length, 2);
});

// ── Ring Scheduler ──

test("ring topology creates sequential chain", () => {
  const scheduler = createTopologyScheduler(TOPOLOGY.RING);
  const n1 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "a" });
  const n2 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "b" });
  const n3 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "c" });
  const graph = createTaskGraph({ goal: "test" });
  graph.nodes = [n1, n2, n3];

  scheduler.buildGraph(graph);
  // n2 depends on n1, n3 depends on n2
  assert.deepEqual(graph.nodes[1].dependencies, [n1.id]);
  assert.deepEqual(graph.nodes[2].dependencies, [n2.id]);
});

test("ring getNextNodes returns one at a time", () => {
  const scheduler = createTopologyScheduler(TOPOLOGY.RING);
  const n1 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "a" });
  const n2 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "b" });
  const graph = createTaskGraph({ goal: "test" });
  graph.nodes = [n1, n2];
  scheduler.buildGraph(graph);

  const ready = scheduler.getNextNodes(graph);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, n1.id);
});

// ── Star Scheduler ──

test("star topology makes all parallel", () => {
  const scheduler = createTopologyScheduler(TOPOLOGY.STAR);
  const n1 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "a" });
  const n2 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "b" });
  n2.dependencies = [n1.id];
  const graph = createTaskGraph({ goal: "test" });
  graph.nodes = [n1, n2];

  scheduler.buildGraph(graph);
  assert.deepEqual(graph.nodes[1].dependencies, []);
});

// ── Hierarchical Scheduler ──

test("hierarchical puts planner first", () => {
  const scheduler = createTopologyScheduler(TOPOLOGY.HIERARCHICAL);
  const n1 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "code" });
  const n2 = createTaskNode({ agentType: AGENT_TYPE.PLANNER, goal: "plan" });
  const graph = createTaskGraph({ goal: "test" });
  graph.nodes = [n1, n2];

  scheduler.buildGraph(graph);
  // After buildGraph, planner should be first and others depend on it
  const plannerNode = graph.nodes.find(
    (n) => n.agentType === AGENT_TYPE.PLANNER,
  );
  const coderNode = graph.nodes.find((n) => n.agentType === AGENT_TYPE.CODER);
  assert.ok(coderNode.dependencies.includes(plannerNode.id));
});

// ── AgentRouter ──

test("AgentRouter routes and returns agent", () => {
  const mm = new MemoryManager({ workspaceHash: "router-test" });
  const gate = new PermissionGate({ memory: mm });
  const deps = {
    permissionGate: gate,
    memory: mm,
    emitEvent: () => {},
    runLLM: async () => "mock",
  };
  const router = new AgentRouter({ maxAgents: 5 }, deps);

  const agent = router.route(AGENT_TYPE.CODER);
  assert.ok(agent);
  assert.equal(agent.type, AGENT_TYPE.CODER);
  assert.equal(agent.status, AGENT_STATUS.BUSY); // activate() sets BUSY

  router.shutdown();
  mm.destroy();
});

test("AgentRouter reuses idle agents of same type", () => {
  const mm = new MemoryManager({ workspaceHash: "router-test2" });
  const gate = new PermissionGate({ memory: mm });
  const deps = {
    permissionGate: gate,
    memory: mm,
    emitEvent: () => {},
    runLLM: async () => "mock",
  };
  const router = new AgentRouter({ maxAgents: 5 }, deps);

  const a1 = router.route(AGENT_TYPE.CODER);
  const id1 = a1.id;
  router.release(id1);

  const a2 = router.route(AGENT_TYPE.CODER);
  assert.equal(a2.id, id1); // Same agent reused

  router.shutdown();
  mm.destroy();
});

test("AgentRouter list filters by type", () => {
  const mm = new MemoryManager({ workspaceHash: "router-test3" });
  const gate = new PermissionGate({ memory: mm });
  const deps = {
    permissionGate: gate,
    memory: mm,
    emitEvent: () => {},
    runLLM: async () => "mock",
  };
  const router = new AgentRouter({ maxAgents: 10 }, deps);

  router.route(AGENT_TYPE.CODER);
  router.route(AGENT_TYPE.CODER);
  router.route(AGENT_TYPE.PLANNER);

  const coders = router.list({ type: AGENT_TYPE.CODER });
  assert.equal(coders.length, 2);

  const planners = router.list({ type: AGENT_TYPE.PLANNER });
  assert.equal(planners.length, 1);

  router.shutdown();
  mm.destroy();
});
