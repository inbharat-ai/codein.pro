/**
 * CodIn Multi-Agent Swarm — Types & Data Models
 *
 * All enums, factories, and validators for the MAS subsystem.
 * Follows the same fail-closed, schema-validated pattern as compute/job-model.js.
 */
"use strict";

const crypto = require("node:crypto");

// ═══════════════════════════════════════════════════════════════
// 1. ENUMS
// ═══════════════════════════════════════════════════════════════

const TOPOLOGY = Object.freeze({
  MESH: "mesh",
  HIERARCHICAL: "hierarchical",
  RING: "ring",
  STAR: "star",
});

const STRATEGY = Object.freeze({
  BALANCED: "balanced",
  SPECIALIZED: "specialized",
  ADAPTIVE: "adaptive",
});

const EXECUTION_STRATEGY = Object.freeze({
  PARALLEL: "parallel",
  SEQUENTIAL: "sequential",
  ADAPTIVE: "adaptive",
});

const AGENT_TYPE = Object.freeze({
  PLANNER: "planner",
  CODER: "coder",
  TEST: "test",
  DEBUG: "debug",
  I18N: "i18n",
  VIBE_BUILDER: "vibe_builder",
  INFRA: "infra",
  SECURITY: "security",
  DOCS: "docs",
  REVIEWER: "reviewer",
});

const AGENT_STATUS = Object.freeze({
  IDLE: "idle",
  BUSY: "busy",
  BLOCKED: "blocked",
  ERROR: "error",
  SHUTDOWN: "shutdown",
});

const NODE_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  BLOCKED: "blocked",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
  RETRYING: "retrying",
});

const EVENT_TYPE = Object.freeze({
  SWARM_INIT: "swarm_init",
  SWARM_SHUTDOWN: "swarm_shutdown",
  AGENT_SPAWN: "agent_spawn",
  AGENT_REMOVE: "agent_remove",
  NODE_QUEUED: "node_queued",
  NODE_START: "node_start",
  NODE_END: "node_end",
  NODE_BLOCKED: "node_blocked",
  NODE_RETRY: "node_retry",
  NODE_CANCEL: "node_cancel",
  PERMISSION_REQUEST: "permission_request",
  PERMISSION_GRANTED: "permission_granted",
  PERMISSION_DENIED: "permission_denied",
  PATCH_APPLIED: "patch_applied",
  PATCH_ROLLBACK: "patch_rollback",
  COMMAND_RUN: "command_run",
  MEMORY_SAVED: "memory_saved",
  MEMORY_PRUNED: "memory_pruned",
  TASK_CREATED: "task_created",
  TASK_COMPLETE: "task_complete",
  TASK_FAILED: "task_failed",
  TASK_CANCELLED: "task_cancelled",
  BATCH_PLANNED: "batch_planned",
  BATCH_EXECUTED: "batch_executed",
  COST_WARNING: "cost_warning",
  COST_HARD_STOP: "cost_hard_stop",
});

const PERMISSION_TYPE = Object.freeze({
  FILE_READ: "file_read",
  FILE_WRITE: "file_write",
  COMMAND_RUN: "command_run",
  GIT_OP: "git_op",
  NETWORK: "network",
  MCP_TOOL_CALL: "mcp_tool_call",
  REMOTE_GPU_SPEND: "remote_gpu_spend",
});

const PERMISSION_DECISION = Object.freeze({
  ALLOWED: "allowed",
  BLOCKED: "blocked",
  NEEDS_APPROVAL: "needs_approval",
  APPROVED: "approved",
  DENIED: "denied",
});

const PERMISSION_RESPONSE = Object.freeze({
  APPROVE_ONCE: "approve_once",
  APPROVE_ALWAYS: "approve_always",
  DENY: "deny",
});

const MEMORY_SCOPE = Object.freeze({
  SHORT_TERM: "short_term",
  WORKING: "working",
  LONG_TERM: "long_term",
});

const TASK_MODE = Object.freeze({
  ASK: "ask",
  PLAN: "plan",
  IMPLEMENT: "implement",
  AGENT: "agent",
});

// ═══════════════════════════════════════════════════════════════
// 2. ID GENERATORS
// ═══════════════════════════════════════════════════════════════

function swarmId() {
  return `swarm_${crypto.randomBytes(8).toString("hex")}`;
}
function agentId() {
  return `agent_${crypto.randomBytes(8).toString("hex")}`;
}
function nodeId() {
  return `node_${crypto.randomBytes(8).toString("hex")}`;
}
function taskId() {
  return `task_${crypto.randomBytes(8).toString("hex")}`;
}
function eventId() {
  return `evt_${crypto.randomBytes(6).toString("hex")}`;
}

// ═══════════════════════════════════════════════════════════════
// 3. FACTORIES
// ═══════════════════════════════════════════════════════════════

/**
 * Create a SwarmConfig.
 * @param {object} [opts]
 * @returns {object}
 */
function createSwarmConfig(opts = {}) {
  const topology = opts.topology || TOPOLOGY.MESH;
  const strategy = opts.strategy || STRATEGY.BALANCED;
  const maxAgents =
    typeof opts.maxAgents === "number"
      ? Math.max(1, Math.min(opts.maxAgents, 20))
      : 5;
  const concurrency =
    typeof opts.concurrency === "number"
      ? Math.max(1, Math.min(opts.concurrency, maxAgents))
      : Math.min(maxAgents, 4);

  if (!Object.values(TOPOLOGY).includes(topology)) {
    throw new Error(`Invalid topology: ${topology}`);
  }
  if (!Object.values(STRATEGY).includes(strategy)) {
    throw new Error(`Invalid strategy: ${strategy}`);
  }

  return {
    topology,
    strategy,
    maxAgents,
    concurrency,
    gpuBudgetUSD:
      typeof opts.gpuBudgetUSD === "number"
        ? Math.max(0, Math.min(opts.gpuBudgetUSD, 100))
        : 2.0,
    gpuTTLMs:
      typeof opts.gpuTTLMs === "number"
        ? Math.max(60000, opts.gpuTTLMs)
        : 1800000, // 30 min
    gpuIdleMs:
      typeof opts.gpuIdleMs === "number"
        ? Math.max(60000, opts.gpuIdleMs)
        : 600000, // 10 min
  };
}

/**
 * Create an AgentDescriptor.
 * @param {object} params
 * @returns {object}
 */
function createAgentDescriptor({ type, modelHint = null, constraints = {} }) {
  if (!type || !Object.values(AGENT_TYPE).includes(type)) {
    throw new Error(`Invalid agent type: ${type}`);
  }

  return {
    id: agentId(),
    type,
    status: AGENT_STATUS.IDLE,
    modelHint,
    constraints: {
      allowNetwork: constraints.allowNetwork === true,
      allowWrite: constraints.allowWrite === true,
      allowCommands: constraints.allowCommands === true,
      allowGit: constraints.allowGit === true,
      allowMcp: constraints.allowMcp !== false, // default true
      maxCostUSD:
        typeof constraints.maxCostUSD === "number"
          ? constraints.maxCostUSD
          : 1.0,
    },
    metrics: {
      tasksCompleted: 0,
      tasksFailed: 0,
      toolCalls: 0,
      tokensUsed: 0,
      costUSD: 0,
      totalTimeMs: 0,
      approvalsRequested: 0,
    },
    spawnedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
}

/**
 * Create a TaskNode in the TaskGraph.
 * @param {object} params
 * @returns {object}
 */
function createTaskNode({
  goal,
  requiredPermissions = [],
  dependencies = [],
  agentType = null,
  metadata = {},
}) {
  if (!goal || typeof goal !== "string" || goal.trim().length === 0) {
    throw new Error("TaskNode goal is required");
  }
  if (goal.length > 10000) {
    throw new Error("TaskNode goal exceeds 10000 characters");
  }

  for (const p of requiredPermissions) {
    if (!Object.values(PERMISSION_TYPE).includes(p)) {
      throw new Error(`Invalid permission type: ${p}`);
    }
  }

  return {
    id: nodeId(),
    goal: goal.trim(),
    status: NODE_STATUS.QUEUED,
    owner: null, // agentId assigned during scheduling
    agentType, // preferred agent type, null = auto-route
    dependencies, // nodeId[] — must succeed before this runs
    requiredPermissions,
    result: null, // set on completion
    patches: [], // JSON patches produced
    artifacts: [], // { id, type, name, path }
    error: null,
    retries: 0,
    maxRetries: 2,
    metadata,
    costUSD: 0,
    tokensUsed: 0,
    model: null,
    startedAt: null,
    endedAt: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a TaskGraph — the execution plan for an orchestrated task.
 * @param {object} params
 * @returns {object}
 */
function createTaskGraph({
  goal,
  mode = TASK_MODE.IMPLEMENT,
  executionStrategy = EXECUTION_STRATEGY.ADAPTIVE,
  topology = TOPOLOGY.MESH,
  acceptanceCriteria = null,
}) {
  if (!goal || typeof goal !== "string" || goal.trim().length === 0) {
    throw new Error("TaskGraph goal is required");
  }

  return {
    id: taskId(),
    goal: goal.trim(),
    mode,
    executionStrategy,
    topology,
    acceptanceCriteria,
    nodes: [], // TaskNode[]
    edges: [], // { from: nodeId, to: nodeId }
    status: NODE_STATUS.QUEUED,
    iteration: 0, // for ring topology
    maxIterations: 5, // ring topology cap
    mergeStrategy: null, // set by topology scheduler
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    metadata: {
      totalCostUSD: 0,
      totalTokens: 0,
      modelsUsed: [],
      nodesCompleted: 0,
      nodesFailed: 0,
      nodesCancelled: 0,
    },
  };
}

/**
 * Create a SwarmEvent for the timeline.
 * @param {object} params
 * @returns {object}
 */
function createSwarmEvent({
  type,
  agentId = null,
  nodeId = null,
  taskId = null,
  data = {},
}) {
  if (!type || !Object.values(EVENT_TYPE).includes(type)) {
    throw new Error(`Invalid event type: ${type}`);
  }

  return {
    id: eventId(),
    type,
    agentId,
    nodeId,
    taskId,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a MemoryEntry.
 * @param {object} params
 * @returns {object}
 */
function createMemoryEntry({
  scope = MEMORY_SCOPE.WORKING,
  key,
  value,
  ttlMs = null,
}) {
  if (!key || typeof key !== "string") {
    throw new Error("Memory key is required");
  }
  if (!Object.values(MEMORY_SCOPE).includes(scope)) {
    throw new Error(`Invalid memory scope: ${scope}`);
  }

  return {
    scope,
    key,
    value,
    ttlMs,
    createdAt: Date.now(),
    expiresAt: ttlMs ? Date.now() + ttlMs : null,
    accessedAt: Date.now(),
    accessCount: 0,
  };
}

/**
 * Create a BatchGroup for the batch engine.
 * @param {object} params
 * @returns {object}
 */
function createBatchGroup({ type, operations = [], parallel = true }) {
  return {
    id: `batch_${crypto.randomBytes(6).toString("hex")}`,
    type, // "file_read" | "search" | "memory" | "mcp_call" | "write" | "destructive"
    operations,
    parallel,
    status: "pending", // pending | running | completed | failed
    results: [],
    startedAt: null,
    endedAt: null,
  };
}

/**
 * Create a PermissionRequest for blocked nodes.
 * @param {object} params
 * @returns {object}
 */
function createPermissionRequest({
  nodeId,
  agentId,
  taskId,
  permissionType,
  action,
  costEstimateUSD = null,
}) {
  if (!Object.values(PERMISSION_TYPE).includes(permissionType)) {
    throw new Error(`Invalid permission type: ${permissionType}`);
  }

  return {
    id: `perm_${crypto.randomBytes(6).toString("hex")}`,
    nodeId,
    agentId,
    taskId,
    permissionType,
    action, // human-readable description of what will happen
    costEstimateUSD,
    response: null, // set when user responds
    respondedAt: null,
    createdAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// 4. VALIDATORS
// ═══════════════════════════════════════════════════════════════

function validateSwarmConfig(config) {
  const errors = [];
  if (!config) return { valid: false, errors: ["Config is required"] };
  if (!Object.values(TOPOLOGY).includes(config.topology)) {
    errors.push(`Invalid topology: ${config.topology}`);
  }
  if (!Object.values(STRATEGY).includes(config.strategy)) {
    errors.push(`Invalid strategy: ${config.strategy}`);
  }
  if (
    typeof config.maxAgents !== "number" ||
    config.maxAgents < 1 ||
    config.maxAgents > 20
  ) {
    errors.push("maxAgents must be 1-20");
  }
  if (typeof config.concurrency !== "number" || config.concurrency < 1) {
    errors.push("concurrency must be >= 1");
  }
  if (config.concurrency > config.maxAgents) {
    errors.push("concurrency cannot exceed maxAgents");
  }
  if (typeof config.gpuBudgetUSD !== "number" || config.gpuBudgetUSD < 0) {
    errors.push("gpuBudgetUSD must be >= 0");
  }
  return { valid: errors.length === 0, errors };
}

function validateTaskNode(node) {
  const errors = [];
  if (!node) return { valid: false, errors: ["Node is required"] };
  if (!node.id || !node.id.startsWith("node_")) {
    errors.push("Invalid node ID");
  }
  if (!node.goal || typeof node.goal !== "string") {
    errors.push("Node goal required");
  }
  if (!Object.values(NODE_STATUS).includes(node.status)) {
    errors.push(`Invalid status: ${node.status}`);
  }
  return { valid: errors.length === 0, errors };
}

function validateTaskGraph(graph) {
  const errors = [];
  if (!graph) return { valid: false, errors: ["Graph is required"] };
  if (!graph.id || !graph.id.startsWith("task_")) {
    errors.push("Invalid task ID");
  }
  if (!graph.goal || typeof graph.goal !== "string") {
    errors.push("Goal required");
  }
  if (!Array.isArray(graph.nodes)) errors.push("nodes must be array");
  if (!Array.isArray(graph.edges)) errors.push("edges must be array");

  // Validate edges reference valid nodes
  if (Array.isArray(graph.nodes) && Array.isArray(graph.edges)) {
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.from)) {
        errors.push(`Edge references unknown node: ${edge.from}`);
      }
      if (!nodeIds.has(edge.to)) {
        errors.push(`Edge references unknown node: ${edge.to}`);
      }
    }

    // Check for cycles
    const visited = new Set();
    const visiting = new Set();
    const adjList = new Map();
    for (const n of graph.nodes) adjList.set(n.id, []);
    for (const e of graph.edges) {
      if (adjList.has(e.from)) adjList.get(e.from).push(e.to);
    }

    function hasCycle(nid) {
      if (visiting.has(nid)) return true;
      if (visited.has(nid)) return false;
      visiting.add(nid);
      for (const dep of adjList.get(nid) || []) {
        if (hasCycle(dep)) return true;
      }
      visiting.delete(nid);
      visited.add(nid);
      return false;
    }

    for (const n of graph.nodes) {
      if (hasCycle(n.id)) {
        errors.push("TaskGraph contains a dependency cycle");
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════
// 5. EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Enums
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

  // ID generators
  swarmId,
  agentId,
  nodeId,
  taskId,
  eventId,

  // Factories
  createSwarmConfig,
  createAgentDescriptor,
  createTaskNode,
  createTaskGraph,
  createSwarmEvent,
  createMemoryEntry,
  createBatchGroup,
  createPermissionRequest,

  // Validators
  validateSwarmConfig,
  validateTaskNode,
  validateTaskGraph,
};
