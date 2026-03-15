/**
 * CodeIn MAS — Swarm Execution Module
 *
 * Handles task orchestration, topology execution (pipeline, fan-out,
 * round-robin, hierarchical), agent coordination, and SSE streaming.
 *
 * Extracted from swarm-manager.js as part of the decomposition.
 */
"use strict";

const crypto = require("node:crypto");

const {
  NODE_STATUS,
  EVENT_TYPE,
  AGENT_TYPE,
  createSwarmEvent,
  createTaskNode,
  validateTaskGraph,
} = require("./types");

const { createTopologyScheduler } = require("./topologies");
const { createLogger } = require("./logger");

// Optional modules — loaded lazily
let HOOK_EVENT;
try {
  ({ HOOK_EVENT } = require("./plugin-hooks"));
} catch {
  HOOK_EVENT = null;
}

const log = createLogger("SwarmManager");

/**
 * Attach execution methods to SwarmManager.prototype.
 * @param {Function} SwarmManager — the SwarmManager class
 */
function applyExecutionMethods(SwarmManager) {
  const proto = SwarmManager.prototype;

  // ════════════════════════════════════════════════════════════
  // 6. taskOrchestrate(goal, mode, strategy, acceptance)
  // ════════════════════════════════════════════════════════════

  proto.taskOrchestrate = async function taskOrchestrate({
    goal,
    mode = "single",
    topology,
    strategy: _strategy,
    acceptanceCriteria,
    context = {},
    onTaskCreated,
  }) {
    this._requireActive();

    const selectedTopology = topology || this._config.topology;
    const scheduler = createTopologyScheduler(selectedTopology);

    // Create a persistence session for cost tracking
    let sessionId = null;
    if (this._persistence) {
      sessionId = crypto.randomUUID();
      this._persistence.createSession(
        sessionId,
        goal,
        mode,
        {
          topology: selectedTopology,
          workspaceRoot: context.workspaceRoot || process.cwd(),
        },
        0, // nodeCount — updated after planning
      );
      log.info("Session created", { sessionId, goal: goal.slice(0, 80) });
    }

    // Populate workspace summary if indexer available and not already provided
    if (this._workspaceIndexer && !context.workspaceSummary) {
      try {
        const wsRoot = context.workspaceRoot || process.cwd();
        context.workspaceSummary =
          await this._workspaceIndexer.getContextSummary(wsRoot);
        log.debug("Workspace summary populated", { root: wsRoot });
      } catch (err) {
        log.warn("Failed to index workspace", { error: err.message });
      }
    }

    // Detect Indian language and enhance prompt
    if (this._langProcessor) {
      const langDetection = this._langProcessor.detectLanguage(goal);
      if (langDetection.isIndic || langDetection.isMixed) {
        const enhanced = this._langProcessor.enhancePrompt(goal, langDetection);
        context.language = langDetection.language;
        context.languageEnhancement = enhanced.systemAddendum;
        log.info("Indian language detected", {
          language: langDetection.language,
          confidence: langDetection.confidence,
        });
      }
    }

    // Inject workspace memory (learned conventions, patterns)
    if (this._workspaceMemory && !context.conventions) {
      try {
        context.conventions = this._workspaceMemory.getContextForAgent("coder");
      } catch {
        /* Non-fatal */
      }
    }

    // Create streaming channel for real-time UI updates
    const streamId = sessionId || crypto.randomUUID();
    const taskStream = this._streamEngine.createStream(streamId);
    context._taskStream = taskStream;

    this._broadcast(
      createSwarmEvent({
        type: EVENT_TYPE.TASK_SUBMITTED,
        data: { goal, mode, topology: selectedTopology, sessionId },
      }),
    );

    // Emit plugin hook: task:start
    if (this._pluginHooks && HOOK_EVENT) {
      this._pluginHooks
        .emit(HOOK_EVENT.TASK_START, {
          goal,
          mode,
          topology: selectedTopology,
          sessionId,
        })
        .catch(() => {});
    }

    // Step 1: Use planner agent to decompose the goal
    const plannerAgent = this._agentRouter.route(AGENT_TYPE.PLANNER);
    if (sessionId) plannerAgent.setSessionId(sessionId);
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

      // Persist task to SQLite queue for durability
      if (this._sqliteTaskQueue) {
        try {
          this._sqliteTaskQueue.enqueue({
            id: taskGraph.id,
            goal,
            priority: "normal",
            mode: mode || "single",
          });
          this._sqliteTaskQueue.updateStatus(taskGraph.id, "running");
          log.debug("Task persisted to SQLite queue", {
            taskId: taskGraph.id,
          });
        } catch (persistErr) {
          log.warn("Failed to persist task to SQLite queue", {
            taskId: taskGraph.id,
            error: persistErr.message,
          });
        }
      }

      this._memory.onTaskStart(taskGraph);
      if (typeof onTaskCreated === "function") {
        try {
          onTaskCreated(taskGraph.id, taskGraph);
        } catch {
          // Non-fatal callback error.
        }
      }

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
      await this._executeGraph(taskGraph, scheduler, context, sessionId);

      // Complete session with final costs
      if (sessionId && this._persistence) {
        this._persistence.completeSession(
          sessionId,
          taskGraph.status,
          { nodesCompleted: taskGraph.metadata.nodesCompleted },
          null, // no error
          {
            totalCostUSD: 0, // populated by cost ledger entries
            totalTokens: 0,
            nodesCompleted: taskGraph.metadata.nodesCompleted,
            nodesFailed: taskGraph.metadata.nodesFailed,
          },
        );
        log.info("Session completed", {
          sessionId,
          status: taskGraph.status,
        });
      }

      // Update SQLite task queue with completion
      if (this._sqliteTaskQueue) {
        try {
          const mergedResult = taskGraph.nodes
            .filter((n) => n.status === NODE_STATUS.SUCCEEDED)
            .map((n) => ({
              nodeId: n.id,
              goal: n.goal,
              agentType: n.agentType,
            }));
          this._sqliteTaskQueue.complete(taskGraph.id, mergedResult);
          log.debug("Task completion persisted to SQLite queue", {
            taskId: taskGraph.id,
          });
        } catch (persistErr) {
          log.warn("Failed to update completed task in SQLite queue", {
            taskId: taskGraph.id,
            error: persistErr.message,
          });
        }
      }

      // Persist task summary to SQLite memory store for cross-session recall
      if (this._sqliteMemoryStore) {
        try {
          this._sqliteMemoryStore.set(
            `task:${taskGraph.id}`,
            {
              goal,
              status: taskGraph.status,
              nodesCompleted: taskGraph.metadata.nodesCompleted,
              nodesFailed: taskGraph.metadata.nodesFailed,
              completedAt: taskGraph.completedAt,
            },
            { scope: "long_term", tags: ["task_result"] },
          );
          log.debug("Task summary persisted to SQLite memory store", {
            taskId: taskGraph.id,
          });
        } catch (persistErr) {
          log.warn("Failed to persist task summary to SQLite memory store", {
            taskId: taskGraph.id,
            error: persistErr.message,
          });
        }
      }

      // Emit plugin hook: task:finish
      if (this._pluginHooks && HOOK_EVENT) {
        this._pluginHooks
          .emit(HOOK_EVENT.TASK_FINISH, {
            taskId: taskGraph.id,
            status: taskGraph.status,
            nodesCompleted: taskGraph.metadata.nodesCompleted,
            sessionId,
          })
          .catch(() => {});
      }

      return {
        taskId: taskGraph.id,
        status: taskGraph.status,
        nodes: taskGraph.nodes.length,
        sessionId,
      };
    } catch (err) {
      // Complete session as failed
      if (sessionId && this._persistence) {
        this._persistence.completeSession(
          sessionId,
          "failed",
          null,
          err.message,
          {},
        );
      }

      // Update SQLite task queue with failure
      if (this._sqliteTaskQueue) {
        try {
          // taskGraph may not exist if planning failed — use sessionId as fallback key
          const failedId =
            (typeof taskGraph !== "undefined" && taskGraph?.id) || sessionId;
          if (failedId) {
            this._sqliteTaskQueue.fail(failedId, err.message || String(err));
            log.debug("Task failure persisted to SQLite queue", {
              taskId: failedId,
            });
          }
        } catch (persistErr) {
          log.warn("Failed to update failed task in SQLite queue", {
            error: persistErr.message,
          });
        }
      }

      try {
        this._agentRouter.release(plannerAgent.id);
      } catch {
        /* already released */
      }
      throw err;
    }
  };

  // ════════════════════════════════════════════════════════════
  // 7. taskStatus(taskId)
  // ════════════════════════════════════════════════════════════

  proto.taskStatus = function taskStatus(taskId) {
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
  };

  // ════════════════════════════════════════════════════════════
  // 8. taskResults(taskId)
  // ════════════════════════════════════════════════════════════

  proto.taskResults = function taskResults(taskId) {
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
  };

  // ════════════════════════════════════════════════════════════
  // 9. taskCancel(taskId)
  // ════════════════════════════════════════════════════════════

  proto.taskCancel = function taskCancel(taskId) {
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
      createSwarmEvent({
        type: EVENT_TYPE.TASK_CANCELLED,
        data: { taskId },
      }),
    );
    return { success: true };
  };

  // ════════════════════════════════════════════════════════════
  // Streaming API
  // ════════════════════════════════════════════════════════════

  /** Get the SSE handler for a specific task's stream. */
  proto.getTaskStreamHandler = function getTaskStreamHandler(taskId) {
    return this._streamEngine.createSSEHandler(taskId);
  };

  // ════════════════════════════════════════════════════════════
  // Workspace Summary API
  // ════════════════════════════════════════════════════════════

  /**
   * Get workspace summary for a given root path.
   * @param {string} [workspaceRoot]
   * @returns {Promise<string|null>}
   */
  proto.getWorkspaceSummary = async function getWorkspaceSummary(
    workspaceRoot,
  ) {
    if (!this._workspaceIndexer) return null;
    return this._workspaceIndexer.getContextSummary(
      workspaceRoot || process.cwd(),
    );
  };

  // ════════════════════════════════════════════════════════════
  // Internal: Graph Execution
  // ════════════════════════════════════════════════════════════

  proto._executeGraph = async function _executeGraph(
    taskGraph,
    scheduler,
    context,
    sessionId,
  ) {
    taskGraph.status = "running";
    taskGraph.startedAt = new Date().toISOString();
    const concurrency = this._config?.concurrency || 4;

    const NODE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes per node

    const executeNode = async (node) => {
      if (
        taskGraph.status === "cancelled" ||
        node.status === NODE_STATUS.CANCELLED
      ) {
        return;
      }

      node.status = NODE_STATUS.RUNNING;
      node.startedAt = new Date().toISOString();
      this._memory.onNodeStart(node);

      // Emit to task stream for real-time UI
      if (context._taskStream && context._taskStream.emitNodeStart) {
        try {
          context._taskStream.emitNodeStart({
            nodeId: node.id,
            goal: node.goal,
            agentType: node.agentType,
          });
        } catch {
          /* non-fatal */
        }
      }

      this._broadcast(
        createSwarmEvent({
          type: EVENT_TYPE.NODE_STARTED,
          data: { nodeId: node.id, goal: node.goal },
        }),
      );

      let agent;
      try {
        agent = this._agentRouter.route(node.agentType);
        if (sessionId && agent.setSessionId) agent.setSessionId(sessionId);
        if (context._taskStream && agent.setTaskStream)
          agent.setTaskStream(context._taskStream);

        // Gather context from previous nodes
        const nodeContext = {
          ...context,
          plan: taskGraph,
          previousResults: this._gatherPreviousResults(taskGraph, node),
          blackboard: this._memory.blackboard,
        };

        const nodePromise = agent.execute(node, nodeContext);
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error("Node execution timeout (3 min)")),
            NODE_TIMEOUT_MS,
          );
        });
        let result;
        try {
          result = await Promise.race([nodePromise, timeoutPromise]);
        } finally {
          clearTimeout(timeoutHandle);
        }
        if (
          taskGraph.status === "cancelled" ||
          node.status === NODE_STATUS.CANCELLED
        ) {
          node.status = NODE_STATUS.CANCELLED;
          node.completedAt = new Date().toISOString();
          return;
        }
        node.result = result;
        node.status = NODE_STATUS.SUCCEEDED;
        node.completedAt = new Date().toISOString();
        taskGraph.metadata.nodesCompleted++;

        // Emit node complete to task stream
        if (context._taskStream && context._taskStream.emitNodeComplete) {
          try {
            context._taskStream.emitNodeComplete({
              nodeId: node.id,
              agentType: node.agentType,
              resultPreview: JSON.stringify(result).slice(0, 300),
            });
          } catch {
            /* non-fatal */
          }
        }

        // Learn from successful task execution (workspace memory)
        if (this._workspaceMemory && result) {
          try {
            // Learn from tool calls (file patterns, commands used)
            if (result.toolLog && Array.isArray(result.toolLog)) {
              for (const entry of result.toolLog) {
                if (entry.tool === "run_bash" && entry.args?.command) {
                  this._workspaceMemory.recordCommand(entry.args.command, {
                    exitCode: 0,
                  });
                }
                if (entry.tool === "write_file" && entry.args?.path) {
                  this._workspaceMemory.learnPattern(
                    "file_edit",
                    entry.args.path,
                  );
                }
              }
            }
          } catch {
            /* non-fatal workspace memory learning */
          }
        }

        this._memory.onNodeEnd(node);
        this._broadcast(
          createSwarmEvent({
            type: EVENT_TYPE.NODE_COMPLETED,
            data: { nodeId: node.id, status: "succeeded" },
          }),
        );
      } catch (err) {
        if (
          taskGraph.status === "cancelled" ||
          node.status === NODE_STATUS.CANCELLED
        ) {
          node.status = NODE_STATUS.CANCELLED;
          node.error = node.error || "Cancelled";
          node.completedAt = new Date().toISOString();
          return;
        }
        // Retry logic — actually re-execute the node
        if (node.retryCount < node.maxRetries) {
          node.retryCount++;
          this._broadcast(
            createSwarmEvent({
              type: EVENT_TYPE.NODE_RETRIED,
              data: {
                nodeId: node.id,
                retry: node.retryCount,
                error: err.message,
              },
            }),
          );
          // Release the failed agent before retrying
          if (agent && agent.status === "busy") {
            this._agentRouter.release(agent.id);
            agent = null; // Prevent double-release in finally
          }
          // Re-execute with a fresh agent
          return executeNode(node);
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
        // Release agent back to pool (agent may be null if already released during retry)
        if (agent) {
          try {
            this._agentRouter.release(agent.id);
          } catch {
            // Already released — safe to ignore
          }
        }
      }
    };

    // Main execution loop: keep getting next nodes from scheduler until all done
    let maxRounds = 100; // safety valve
    const TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minute hard limit per task
    const taskStart = Date.now();
    while (maxRounds-- > 0) {
      if (taskGraph.status === "cancelled") {
        break;
      }

      if (Date.now() - taskStart > TASK_TIMEOUT_MS) {
        // Forcibly cancel remaining nodes
        for (const node of taskGraph.nodes) {
          if (
            [
              NODE_STATUS.QUEUED,
              NODE_STATUS.RUNNING,
              NODE_STATUS.BLOCKED,
              NODE_STATUS.RETRYING,
            ].includes(node.status)
          ) {
            node.status = NODE_STATUS.CANCELLED;
            node.error = "Task execution timeout exceeded (10 min)";
            node.completedAt = new Date().toISOString();
            taskGraph.metadata.nodesFailed++;
          }
        }
        break;
      }

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

    // Cancel nodes left QUEUED due to failed dependencies
    const failedIds = new Set(
      taskGraph.nodes
        .filter((n) => n.status === NODE_STATUS.FAILED)
        .map((n) => n.id),
    );
    for (const node of taskGraph.nodes) {
      if (node.status !== NODE_STATUS.QUEUED) continue;
      const hasFailedDep = node.dependencies.some((depId) =>
        failedIds.has(depId),
      );
      if (hasFailedDep) {
        node.status = NODE_STATUS.CANCELLED;
        node.error = "Cancelled: upstream dependency failed";
        node.completedAt = new Date().toISOString();
        taskGraph.metadata.nodesFailed++;
        this._broadcast(
          createSwarmEvent({
            type: EVENT_TYPE.NODE_FAILED,
            data: { nodeId: node.id, error: node.error },
          }),
        );
      }
    }

    // Handle ring topology iteration
    if (scheduler.checkIteration) {
      const iterCheck = scheduler.checkIteration(taskGraph);
      if (iterCheck.shouldIterate) {
        scheduler.resetForIteration(taskGraph);
        return this._executeGraph(taskGraph, scheduler, context, sessionId);
      }
    }

    // Determine final status
    if (taskGraph.status !== "cancelled") {
      const allSucceeded = taskGraph.nodes.every(
        (n) => n.status === NODE_STATUS.SUCCEEDED,
      );
      const anyFailed = taskGraph.nodes.some(
        (n) =>
          n.status === NODE_STATUS.FAILED || n.status === NODE_STATUS.CANCELLED,
      );

      taskGraph.status = allSucceeded
        ? "completed"
        : anyFailed
          ? "partial"
          : "completed";
    }
    taskGraph.completedAt = new Date().toISOString();

    this._memory.onTaskComplete(taskGraph);
    this._broadcast(
      createSwarmEvent({
        type:
          taskGraph.status === "cancelled"
            ? EVENT_TYPE.TASK_CANCELLED
            : EVENT_TYPE.TASK_COMPLETED,
        data: {
          taskId: taskGraph.id,
          status: taskGraph.status,
          nodesCompleted: taskGraph.metadata.nodesCompleted,
        },
      }),
    );
  };

  proto._gatherPreviousResults = function _gatherPreviousResults(
    taskGraph,
    currentNode,
  ) {
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
  };
}

module.exports = { applyExecutionMethods };
