/**
 * MAS — Types & Data Models Tests
 *
 * Covers enums, ID generators, factories, and validators.
 */
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  TOPOLOGY,
  STRATEGY,
  EXECUTION_STRATEGY,
  AGENT_TYPE,
  AGENT_STATUS,
  NODE_STATUS,
  EVENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
  PERMISSION_RESPONSE,
  MEMORY_SCOPE,
  TASK_MODE,
  swarmId,
  agentId,
  nodeId,
  taskId,
  eventId,
  createSwarmConfig,
  createAgentDescriptor,
  createTaskNode,
  createTaskGraph,
  createSwarmEvent,
  createMemoryEntry,
  createBatchGroup,
  createPermissionRequest,
  validateSwarmConfig,
  validateTaskNode,
  validateTaskGraph,
} = require("../src/mas/types");

// ── Enums ──

test("TOPOLOGY enum is frozen with 4 values", () => {
  assert.ok(Object.isFrozen(TOPOLOGY));
  assert.equal(Object.keys(TOPOLOGY).length, 4);
  assert.equal(TOPOLOGY.MESH, "mesh");
  assert.equal(TOPOLOGY.HIERARCHICAL, "hierarchical");
  assert.equal(TOPOLOGY.RING, "ring");
  assert.equal(TOPOLOGY.STAR, "star");
});

test("AGENT_TYPE enum is frozen with 10 values", () => {
  assert.ok(Object.isFrozen(AGENT_TYPE));
  assert.equal(Object.keys(AGENT_TYPE).length, 10);
  assert.equal(AGENT_TYPE.PLANNER, "planner");
  assert.equal(AGENT_TYPE.CODER, "coder");
  assert.equal(AGENT_TYPE.TEST, "test");
  assert.equal(AGENT_TYPE.DEBUG, "debug");
});

test("AGENT_STATUS enum is frozen", () => {
  assert.ok(Object.isFrozen(AGENT_STATUS));
  assert.ok(AGENT_STATUS.IDLE);
  assert.ok(AGENT_STATUS.BUSY);
  assert.ok(AGENT_STATUS.SHUTDOWN);
});

test("NODE_STATUS enum is frozen", () => {
  assert.ok(Object.isFrozen(NODE_STATUS));
  assert.ok(NODE_STATUS.QUEUED);
  assert.ok(NODE_STATUS.RUNNING);
  assert.ok(NODE_STATUS.SUCCEEDED);
  assert.ok(NODE_STATUS.FAILED);
});

test("EVENT_TYPE has 26 events", () => {
  assert.ok(Object.isFrozen(EVENT_TYPE));
  assert.ok(Object.keys(EVENT_TYPE).length >= 20);
});

test("PERMISSION_TYPE enum contains expected types", () => {
  assert.ok(Object.isFrozen(PERMISSION_TYPE));
  assert.ok(PERMISSION_TYPE.FILE_READ);
  assert.ok(PERMISSION_TYPE.FILE_WRITE);
  assert.ok(PERMISSION_TYPE.COMMAND_RUN);
  assert.ok(PERMISSION_TYPE.REMOTE_GPU_SPEND);
});

// ── ID Generators ──

test("swarmId generates unique IDs with swarm_ prefix", () => {
  const id1 = swarmId();
  const id2 = swarmId();
  assert.ok(id1.startsWith("swarm_"));
  assert.ok(id2.startsWith("swarm_"));
  assert.notEqual(id1, id2);
});

test("agentId generates unique IDs with agent_ prefix", () => {
  const id = agentId();
  assert.ok(id.startsWith("agent_"));
});

test("nodeId generates unique IDs with node_ prefix", () => {
  const id = nodeId();
  assert.ok(id.startsWith("node_"));
});

test("taskId generates unique IDs with task_ prefix", () => {
  const id = taskId();
  assert.ok(id.startsWith("task_"));
});

test("eventId generates unique IDs with evt_ prefix", () => {
  const id = eventId();
  assert.ok(id.startsWith("evt_"));
});

// ── Factories ──

test("createSwarmConfig returns valid defaults", () => {
  const config = createSwarmConfig();
  assert.equal(config.topology, TOPOLOGY.MESH);
  assert.equal(config.strategy, STRATEGY.BALANCED);
  assert.equal(typeof config.maxAgents, "number");
  assert.ok(config.maxAgents >= 1);
  assert.equal(typeof config.gpuBudgetUSD, "number");
  assert.ok(config.gpuBudgetUSD > 0);
});

test("createSwarmConfig accepts overrides", () => {
  const config = createSwarmConfig({
    topology: TOPOLOGY.STAR,
    maxAgents: 3,
  });
  assert.equal(config.topology, TOPOLOGY.STAR);
  assert.equal(config.maxAgents, 3);
});

test("createAgentDescriptor returns proper shape", () => {
  const desc = createAgentDescriptor({
    type: AGENT_TYPE.CODER,
    modelHint: "gpt-4",
  });
  assert.equal(desc.type, AGENT_TYPE.CODER);
  assert.equal(desc.modelHint, "gpt-4");
  assert.ok(desc.id.startsWith("agent_"));
  assert.equal(desc.status, AGENT_STATUS.IDLE);
});

test("createTaskNode returns proper shape", () => {
  const node = createTaskNode({
    agentType: AGENT_TYPE.PLANNER,
    goal: "decompose",
  });
  assert.ok(node.id.startsWith("node_"));
  assert.equal(node.agentType, AGENT_TYPE.PLANNER);
  assert.equal(node.goal, "decompose");
  assert.equal(node.status, NODE_STATUS.QUEUED);
  assert.deepEqual(node.dependencies, []);
});

test("createTaskGraph returns proper shape", () => {
  const graph = createTaskGraph({
    goal: "build feature X",
  });
  assert.ok(graph.id.startsWith("task_"));
  assert.equal(graph.goal, "build feature X");
  assert.deepEqual(graph.nodes, []);
});

test("createSwarmEvent returns proper shape", () => {
  const ev = createSwarmEvent({
    type: EVENT_TYPE.SWARM_INIT,
    data: { topology: "mesh" },
  });
  assert.ok(ev.id.startsWith("evt_"));
  assert.equal(ev.type, EVENT_TYPE.SWARM_INIT);
  assert.ok(ev.timestamp);
});

test("createPermissionRequest returns proper shape", () => {
  const req = createPermissionRequest({
    permissionType: PERMISSION_TYPE.FILE_WRITE,
    agentId: "agent_001",
    action: "write foo.js",
  });
  assert.equal(req.permissionType, PERMISSION_TYPE.FILE_WRITE);
  assert.equal(req.agentId, "agent_001");
  assert.equal(req.action, "write foo.js");
  assert.equal(req.response, null);
});

// ── Validators ──

test("validateSwarmConfig rejects missing topology", () => {
  const result = validateSwarmConfig({});
  assert.equal(result.valid, false);
});

test("validateSwarmConfig rejects invalid topology", () => {
  const config = createSwarmConfig();
  config.topology = "butterfly";
  const result = validateSwarmConfig(config);
  assert.equal(result.valid, false);
});

test("validateSwarmConfig accepts valid config", () => {
  const config = createSwarmConfig();
  const result = validateSwarmConfig(config);
  assert.equal(result.valid, true);
});

test("validateTaskNode rejects missing node", () => {
  const result = validateTaskNode({});
  assert.equal(result.valid, false);
});

test("validateTaskNode rejects invalid ID", () => {
  const result = validateTaskNode({
    id: "bad",
    goal: "stealth",
    status: NODE_STATUS.QUEUED,
  });
  assert.equal(result.valid, false);
});

test("validateTaskNode accepts valid node", () => {
  const node = createTaskNode({
    agentType: AGENT_TYPE.CODER,
    goal: "implement",
  });
  const result = validateTaskNode(node);
  assert.equal(result.valid, true);
});

test("validateTaskGraph detects cycles via edges", () => {
  const n1 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "a" });
  const n2 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "b" });
  const graph = createTaskGraph({ goal: "cycle" });
  graph.nodes = [n1, n2];
  graph.edges = [
    { from: n1.id, to: n2.id },
    { from: n2.id, to: n1.id },
  ];
  const result = validateTaskGraph(graph);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /cycle/i.test(e)));
});

test("validateTaskGraph accepts acyclic graph", () => {
  const n1 = createTaskNode({ agentType: AGENT_TYPE.PLANNER, goal: "plan" });
  const n2 = createTaskNode({ agentType: AGENT_TYPE.CODER, goal: "code" });
  const graph = createTaskGraph({ goal: "ok" });
  graph.nodes = [n1, n2];
  graph.edges = [{ from: n1.id, to: n2.id }];
  const result = validateTaskGraph(graph);
  assert.equal(result.valid, true);
});
