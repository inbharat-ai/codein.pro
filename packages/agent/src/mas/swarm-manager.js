/**
 * CodIn MAS — SwarmManager
 *
 * Top-level orchestrator for the Multi-Agent Swarm system.
 * Implements the 11 core API methods:
 *   swarmInit, agentSpawn, agentList, swarmStatus, agentMetrics,
 *   taskOrchestrate, taskStatus, taskResults, taskCancel, memoryUsage, swarmShutdown
 *
 * Coordinates: topology → planner → agent routing → execution → merge.
 * Streams events via SSE.
 */
"use strict";

const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");

const {
  TOPOLOGY,
  NODE_STATUS,
  EVENT_TYPE,
  AGENT_TYPE,
  createSwarmConfig,
  createSwarmEvent,
  createTaskNode,
  createTaskGraph,
  validateSwarmConfig,
  validateTaskGraph,
} = require("./types");

const { MemoryManager } = require("./memory");
const { PermissionGate } = require("./permissions");
const { AgentRouter } = require("./agent-router");
const { createTopologyScheduler } = require("./topologies");
const { BatchPlanner, BatchExecutor } = require("./batch");
const { JsonPatchEngine } = require("./json-patch");

// ─── Swarm States ────────────────────────────────────────────
const SWARM_STATE = Object.freeze({
  IDLE: "idle",
  ACTIVE: "active",
  SHUTTING_DOWN: "shutting_down",
  SHUTDOWN: "shutdown",
});

class SwarmManager extends EventEmitter {
  /**
   * @param {object} deps
   * @param {function} deps.runLLM — (systemPrompt, userPrompt, opts) => Promise<string>
   * @param {object} [deps.mcpClientManager]
   */
  constructor(deps = {}) {
    super();
    this._deps = deps;
    this._state = SWARM_STATE.IDLE;
    this._config = null;
    this._workspaceHash = null;

    // Subsystems (initialized on swarmInit)
    this._memory = null;
    this._permissionGate = null;
    this._agentRouter = null;
    this._batchPlanner = new BatchPlanner();
    this._patchEngine = null;

    // Active task graphs
    /** @type {Map<string, object>} taskId → TaskGraph */
    this._tasks = new Map();

    // Event log for SSE streaming
    this._events = [];
    this._maxEvents = 2000;

    // SSE subscribers
    this._subscribers = new Set();
  }

  // ════════════════════════════════════════════════════════════
  // 1. swarmInit(config) — Initialize swarm
  // ════════════════════════════════════════════════════════════

  swarmInit(config = {}) {
    if (this._state === SWARM_STATE.ACTIVE) {
      throw new Error("Swarm already active. Call swarmShutdown() first.");
    }

    this._config = createSwarmConfig(config);
    const validation = validateSwarmConfig(this._config);
    if (!validation.valid) {
      throw new Error(`Invalid swarm config: ${validation.errors.join(", ")}`);
    }

    // Workspace hash for file persistence
    this._workspaceHash =
      config.workspaceHash ||
      crypto.createHash("md5").update(process.cwd()).digest("hex").slice(0, 12);

    // Initialize subsystems
    this._memory = new MemoryManager({
      workspaceHash: this._workspaceHash,
      longTermEnabled: config.longTermMemory || false,
      emitEvent: (e) => this._broadcast(e),
    });

    this._permissionGate = new PermissionGate({
      memory: this._memory,
      emitEvent: (e) => this._broadcast(e),
      gpuConfig: this._config.gpuGuardrails || {},
    });

    this._agentRouter = new AgentRouter(
      { maxAgents: this._config.maxAgents },
      {
        permissionGate: this._permissionGate,
        memory: this._memory,
        emitEvent: (e) => this._broadcast(e),
        runLLM: this._deps.runLLM,
      },
    );

    this._patchEngine = new JsonPatchEngine({
      workspaceHash: this._workspaceHash,
    });

    this._state = SWARM_STATE.ACTIVE;
    this._memory.onSwarmInit(this._config);
    this._broadcast(
      createSwarmEvent({
        type: EVENT_TYPE.SWARM_INIT,
        data: { config: this._config },
      }),
    );

    return { status: "active", config: this._config };
  }

  // ════════════════════════════════════════════════════════════
  // 2. agentSpawn(type, config) — Create specialist agent
  // ════════════════════════════════════════════════════════════

  agentSpawn(type) {
    this._requireActive();
    const agent = this._agentRouter.route(type);
    return agent.descriptor;
  }

  // ════════════════════════════════════════════════════════════
  // 3. agentList(filter?) — List all active agents
  // ════════════════════════════════════════════════════════════

  agentList(filter) {
    this._requireActive();
    return this._agentRouter.list(filter);
  }

  // ════════════════════════════════════════════════════════════
  // 4. swarmStatus() — Overall swarm state
  // ════════════════════════════════════════════════════════════

  swarmStatus() {
    return {
      state: this._state,
      config: this._config,
      agents: this._agentRouter ? this._agentRouter.list() : [],
      activeTasks: this._tasks.size,
      tasks: [...this._tasks.keys()],
      memory: this._memory ? this._memory.usage() : null,
      gpu: this._permissionGate ? this._permissionGate.getGpuStatus() : null,
      pendingPermissions: this._permissionGate
        ? this._permissionGate.getPendingCount()
        : 0,
      eventCount: this._events.length,
    };
  }

  // ════════════════════════════════════════════════════════════
  // 5. agentMetrics(agentId?) — Agent performance metrics
  // ════════════════════════════════════════════════════════════

  agentMetrics(agentId) {
    this._requireActive();
    return this._agentRouter.metrics(agentId);
  }

  // ════════════════════════════════════════════════════════════
  // 6. taskOrchestrate(goal, mode, strategy, acceptance)
  // ════════════════════════════════════════════════════════════

  async taskOrchestrate({
    goal,
    mode = "single",
    topology,
    strategy,
    acceptanceCriteria,
    context = {},
  }) {
    this._requireActive();

    const selectedTopology = topology || this._config.topology;
    const scheduler = createTopologyScheduler(selectedTopology);

    this._broadcast(
      createSwarmEvent({
        type: EVENT_TYPE.TASK_SUBMITTED,
        data: { goal, mode, topology: selectedTopology },
      }),
    );

    // Step 1: Use planner agent to decompose the goal
    const plannerAgent = this._agentRouter.route(AGENT_TYPE.PLANNER);
    try {
      const planResult = await plannerAgent.execute(
        createTaskNode({
          goal: `Plan: ${goal}`,
          agentType: AGENT_TYPE.PLANNER,
        }),
        {
          goal,
          mode,
          topology: selectedTopology,
          acceptanceCriteria: acceptanceCriteria || "",
          workspaceSummary: context.workspaceSummary || "",
        },
      );
      this._agentRouter.release(plannerAgent.id);

      if (!planResult.taskGraph) {
        throw new Error("Planner did not produce a task graph");
      }

      const taskGraph = planResult.taskGraph;

      // Step 2: Apply topology to the graph
      scheduler.buildGraph(taskGraph);

      // Validate
      const validation = validateTaskGraph(taskGraph);
      if (!validation.valid) {
        throw new Error(`Invalid task graph: ${validation.errors.join(", ")}`);
      }

      // Register the task
      this._tasks.set(taskGraph.id, taskGraph);
      this._memory.onTaskStart(taskGraph);

      this._broadcast(
        createSwarmEvent({
          type: EVENT_TYPE.TASK_DECOMPOSED,
          data: {
            taskId: taskGraph.id,
            nodes: taskGraph.nodes.length,
            edges: taskGraph.edges.length,
            topology: selectedTopology,
          },
        }),
      );

      // Step 3: Execute the graph
      await this._executeGraph(taskGraph, scheduler, context);

      return {
        taskId: taskGraph.id,
        status: taskGraph.status,
        nodes: taskGraph.nodes.length,
      };
    } catch (err) {
      this._agentRouter.release(plannerAgent.id);
      throw err;
    }
  }

  // ════════════════════════════════════════════════════════════
  // 7. taskStatus(taskId)
  // ════════════════════════════════════════════════════════════

  taskStatus(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) return null;
    return {
      id: task.id,
      goal: task.goal,
      status: task.status,
      topology: task.topology,
      nodes: task.nodes.map((n) => ({
        id: n.id,
        goal: n.goal,
        status: n.status,
        agentType: n.agentType,
        retryCount: n.retryCount,
      })),
      metadata: task.metadata,
    };
  }

  // ════════════════════════════════════════════════════════════
  // 8. taskResults(taskId)
  // ════════════════════════════════════════════════════════════

  taskResults(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) return null;
    return {
      id: task.id,
      goal: task.goal,
      status: task.status,
      results: task.nodes
        .filter((n) => n.status === NODE_STATUS.SUCCEEDED)
        .map((n) => ({
          nodeId: n.id,
          goal: n.goal,
          result: n.result,
          agentType: n.agentType,
        })),
      failed: task.nodes
        .filter((n) => n.status === NODE_STATUS.FAILED)
        .map((n) => ({
          nodeId: n.id,
          goal: n.goal,
          error: n.error,
          agentType: n.agentType,
        })),
      metadata: task.metadata,
    };
  }

  // ════════════════════════════════════════════════════════════
  // 9. taskCancel(taskId)
  // ════════════════════════════════════════════════════════════

  taskCancel(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) return { success: false, error: "Task not found" };

    // Cancel all queued/running/blocked nodes
    for (const node of task.nodes) {
      if (
        [NODE_STATUS.QUEUED, NODE_STATUS.RUNNING, NODE_STATUS.BLOCKED].includes(
          node.status,
        )
      ) {
        node.status = NODE_STATUS.CANCELLED;
      }
    }
    task.status = "cancelled";
    task.completedAt = new Date().toISOString();

    this._broadcast(
      createSwarmEvent({ type: EVENT_TYPE.TASK_CANCELLED, data: { taskId } }),
    );
    return { success: true };
  }

  // ════════════════════════════════════════════════════════════
  // 10. memoryUsage()
  // ════════════════════════════════════════════════════════════

  memoryUsage() {
    if (!this._memory) return null;
    return this._memory.usage();
  }

  // ════════════════════════════════════════════════════════════
  // 11. swarmShutdown()
  // ════════════════════════════════════════════════════════════

  swarmShutdown() {
    if (this._state === SWARM_STATE.SHUTDOWN)
      return { status: "already_shutdown" };

    this._state = SWARM_STATE.SHUTTING_DOWN;
    this._broadcast(
      createSwarmEvent({ type: EVENT_TYPE.SWARM_SHUTDOWN, data: {} }),
    );

    // Cancel pending tasks
    for (const [taskId] of this._tasks) {
      this.taskCancel(taskId);
    }

    // Shutdown subsystems
    if (this._permissionGate) this._permissionGate.destroy();
    if (this._agentRouter) this._agentRouter.shutdown();
    if (this._memory) this._memory.destroy();

    // Close SSE subscribers
    for (const sub of this._subscribers) {
      try {
        sub.end();
      } catch {
        /* ignore */
      }
    }
    this._subscribers.clear();

    this._state = SWARM_STATE.SHUTDOWN;
    return { status: "shutdown" };
  }

  // ════════════════════════════════════════════════════════════
  // Permission API (proxied for HTTP routes)
  // ════════════════════════════════════════════════════════════

  getPendingPermissions() {
    return this._permissionGate
      ? this._permissionGate.getPendingRequests()
      : [];
  }

  respondToPermission(requestId, response) {
    if (!this._permissionGate)
      return { success: false, error: "Swarm not active" };
    return this._permissionGate.respondToRequest(requestId, response);
  }

  // ════════════════════════════════════════════════════════════
  // SSE Event Streaming
  // ════════════════════════════════════════════════════════════

  /**
   * Subscribe a response object to the SSE stream.
   * @param {object} res — HTTP response (must support .write() and .end())
   */
  subscribe(res) {
    this._subscribers.add(res);
    // Send recent events as replay
    const recent = this._events.slice(-50);
    for (const event of recent) {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        /* subscriber disconnected */
      }
    }
  }

  unsubscribe(res) {
    this._subscribers.delete(res);
  }

  getEventLog(limit = 100) {
    return this._events.slice(-limit);
  }

  // ════════════════════════════════════════════════════════════
  // Internal: Graph Execution
  // ════════════════════════════════════════════════════════════

  async _executeGraph(taskGraph, scheduler, context) {
    taskGraph.status = "running";
    taskGraph.startedAt = new Date().toISOString();
    const concurrency = this._config?.concurrency || 4;

    const executeNode = async (node) => {
      node.status = NODE_STATUS.RUNNING;
      node.startedAt = new Date().toISOString();
      this._memory.onNodeStart(node);
      this._broadcast(
        createSwarmEvent({
          type: EVENT_TYPE.NODE_STARTED,
          data: { nodeId: node.id, goal: node.goal },
        }),
      );

      let agent;
      try {
        agent = this._agentRouter.route(node.agentType);

        // Gather context from previous nodes
        const nodeContext = {
          ...context,
          plan: taskGraph,
          previousResults: this._gatherPreviousResults(taskGraph, node),
        };

        const result = await agent.execute(node, nodeContext);
        node.result = result;
        node.status = NODE_STATUS.SUCCEEDED;
        node.completedAt = new Date().toISOString();
        taskGraph.metadata.nodesCompleted++;

        this._memory.onNodeEnd(node);
        this._broadcast(
          createSwarmEvent({
            type: EVENT_TYPE.NODE_COMPLETED,
            data: { nodeId: node.id, status: "succeeded" },
          }),
        );
      } catch (err) {
        // Retry logic
        if (node.retryCount < node.maxRetries) {
          node.retryCount++;
          node.status = NODE_STATUS.RETRYING;
          this._broadcast(
            createSwarmEvent({
              type: EVENT_TYPE.NODE_RETRIED,
              data: { nodeId: node.id, retry: node.retryCount },
            }),
          );
          node.status = NODE_STATUS.QUEUED; // Re-queue for next round
        } else {
          node.status = NODE_STATUS.FAILED;
          node.error = err.message || String(err);
          node.completedAt = new Date().toISOString();
          taskGraph.metadata.nodesFailed++;
          this._memory.onNodeEnd(node);
          this._broadcast(
            createSwarmEvent({
              type: EVENT_TYPE.NODE_FAILED,
              data: { nodeId: node.id, error: node.error },
            }),
          );
        }
      } finally {
        if (agent) this._agentRouter.release(agent.id);
      }
    };

    // Main execution loop: keep getting next nodes from scheduler until all done
    let maxRounds = 100; // safety valve
    while (maxRounds-- > 0) {
      const readyNodes = scheduler.getNextNodes(taskGraph);
      if (readyNodes.length === 0) {
        // Check if there are still queued/running/blocked nodes
        const pending = taskGraph.nodes.filter((n) =>
          [
            NODE_STATUS.QUEUED,
            NODE_STATUS.RUNNING,
            NODE_STATUS.BLOCKED,
            NODE_STATUS.RETRYING,
          ].includes(n.status),
        );
        if (pending.length === 0) break; // All done
        // Deadlock detection: nodes pending but none ready
        break;
      }

      // Execute ready nodes (up to concurrency limit)
      const batch = readyNodes.slice(0, concurrency);
      await Promise.allSettled(batch.map(executeNode));
    }

    // Handle ring topology iteration
    if (scheduler.checkIteration) {
      const iterCheck = scheduler.checkIteration(taskGraph);
      if (iterCheck.shouldIterate) {
        scheduler.resetForIteration(taskGraph);
        return this._executeGraph(taskGraph, scheduler, context);
      }
    }

    // Determine final status
    const allSucceeded = taskGraph.nodes.every(
      (n) => n.status === NODE_STATUS.SUCCEEDED,
    );
    const anyFailed = taskGraph.nodes.some(
      (n) => n.status === NODE_STATUS.FAILED,
    );

    taskGraph.status = allSucceeded
      ? "completed"
      : anyFailed
        ? "partial"
        : "completed";
    taskGraph.completedAt = new Date().toISOString();

    this._memory.onTaskComplete(taskGraph);
    this._broadcast(
      createSwarmEvent({
        type: EVENT_TYPE.TASK_COMPLETED,
        data: {
          taskId: taskGraph.id,
          status: taskGraph.status,
          nodesCompleted: taskGraph.metadata.nodesCompleted,
        },
      }),
    );
  }

  _gatherPreviousResults(taskGraph, currentNode) {
    // Collect results from dependency nodes
    const results = [];
    for (const depId of currentNode.dependencies) {
      const depNode = taskGraph.nodes.find((n) => n.id === depId);
      if (depNode && depNode.result) {
        results.push(
          `[${depNode.agentType}] ${depNode.goal}: ${JSON.stringify(depNode.result).slice(0, 500)}`,
        );
      }
    }
    return results.length > 0 ? results.join("\n") : "";
  }

  _broadcast(event) {
    this._events.push(event);
    if (this._events.length > this._maxEvents) {
      this._events = this._events.slice(-this._maxEvents);
    }

    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const sub of this._subscribers) {
      try {
        sub.write(data);
      } catch {
        this._subscribers.delete(sub);
      }
    }

    this.emit("swarm:event", event);
  }

  _requireActive() {
    if (this._state !== SWARM_STATE.ACTIVE) {
      throw new Error(`Swarm is ${this._state}. Call swarmInit() first.`);
    }
  }
}

module.exports = { SwarmManager, SWARM_STATE };
