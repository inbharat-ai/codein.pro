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
  NODE_STATUS,
  EVENT_TYPE,
  AGENT_TYPE,
  createSwarmConfig,
  createSwarmEvent,
  createTaskNode,
  validateSwarmConfig,
  validateTaskGraph,
} = require("./types");

const { MemoryManager } = require("./memory");
const { PermissionGate } = require("./permissions");
const { AgentRouter } = require("./agent-router");
const { createTopologyScheduler } = require("./topologies");
const { BatchPlanner } = require("./batch");
const { JsonPatchEngine } = require("./json-patch");
const { getAgentModelTier } = require("./mode-config");
const { openDatabase } = require("./persistence");
const { WorkspaceIndexer } = require("./workspace-indexer");
const { StreamEngine } = require("./stream-engine");
const { IndianLanguageProcessor } = require("./indian-lang");
const { CostRouter } = require("./cost-router");
const { createLogger } = require("./logger");
const { applyExtensionMethods } = require("./swarm-extensions");

// Optional modules — loaded lazily to avoid startup errors if files don't exist yet
let WorkspaceMemory,
  BackgroundTaskManager,
  TaskRecovery,
  PluginManager,
  SkillRegistry,
  DocGenerator,
  TerminalManager,
  GitWorkflow,
  AutonomousPlanner,
  DockerSandbox,
  SqliteMemoryStore,
  SqliteTaskQueue,
  PluginHookManager,
  HOOK_EVENT,
  SmartApply;
try {
  ({ WorkspaceMemory } = require("./workspace-memory"));
} catch {
  WorkspaceMemory = null;
}
try {
  ({ BackgroundTaskManager, TaskRecovery } = require("./background-tasks"));
} catch {
  BackgroundTaskManager = null;
  TaskRecovery = null;
}
try {
  ({ PluginManager, SkillRegistry } = require("./plugin-system"));
} catch {
  PluginManager = null;
  SkillRegistry = null;
}
try {
  ({ DocGenerator } = require("./doc-generator"));
} catch {
  DocGenerator = null;
}
try {
  ({ TerminalManager } = require("./terminal-manager"));
} catch {
  TerminalManager = null;
}
try {
  ({ GitWorkflow } = require("./git-workflow"));
} catch {
  GitWorkflow = null;
}
try {
  ({ AutonomousPlanner } = require("./autonomous-planner"));
} catch {
  AutonomousPlanner = null;
}
try {
  ({ DockerSandbox } = require("./docker-sandbox"));
} catch {
  DockerSandbox = null;
}
try {
  ({ SqliteMemoryStore, SqliteTaskQueue } = require("./sqlite-store"));
} catch {
  SqliteMemoryStore = null;
  SqliteTaskQueue = null;
}
try {
  ({ PluginHookManager, HOOK_EVENT } = require("./plugin-hooks"));
} catch {
  PluginHookManager = null;
  HOOK_EVENT = null;
}
try {
  ({ SmartApply } = require("./smart-apply"));
} catch {
  SmartApply = null;
}

const log = createLogger("SwarmManager");

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
    this._persistence = null;
    this._workspaceIndexer = null;
    this._streamEngine = new StreamEngine();
    this._langProcessor = new IndianLanguageProcessor();
    this._costRouter = null;
    this._workspaceMemory = null;
    this._backgroundTasks = null;
    this._pluginManager = null;
    this._skillRegistry = null;
    this._docGenerator = null;
    this._terminalManager = null;
    this._gitWorkflow = null;
    this._autonomousPlanner = null;
    this._dockerSandbox = null;
    this._sqliteMemoryStore = null;
    this._sqliteTaskQueue = null;
    this._pluginHooks = null;
    this._smartApply = null;

    // Active task graphs
    /** @type {Map<string, object>} taskId → TaskGraph */
    this._tasks = new Map();

    // Event log for SSE streaming
    this._eventLog = [];
    this._maxEvents = 2000;

    // SSE subscribers
    this._subscribers = new Set();

    // Periodic task pruning — remove completed/partial/cancelled tasks older than 1 hour
    this._taskPruneInterval = setInterval(
      () => this._pruneCompletedTasks(),
      5 * 60 * 1000,
    );
    this._taskPruneInterval.unref();
  }

  /**
   * Remove completed tasks older than maxAgeMs from _tasks Map to prevent unbounded memory growth.
   * @param {number} [maxAgeMs=3600000] — default 1 hour
   * @returns {number} count of pruned tasks
   */
  _pruneCompletedTasks(maxAgeMs = 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [taskId, task] of this._tasks) {
      if (task.completedAt && new Date(task.completedAt).getTime() < cutoff) {
        this._tasks.delete(taskId);
        pruned++;
      }
    }
    return pruned;
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
      crypto
        .createHash("sha256")
        .update(process.cwd())
        .digest("hex")
        .slice(0, 12);

    // Initialize subsystems
    this._memory = new MemoryManager({
      workspaceHash: this._workspaceHash,
      longTermEnabled: config.longTermMemory || false,
      emitEvent: (e) => this._broadcast(e),
    });

    // Initialize SQLite persistence FIRST (other subsystems depend on it)
    this._persistence = openDatabase();
    if (this._persistence) {
      log.info("Persistence layer initialized", {
        type: this._persistence._inMemory ? "in-memory" : "sqlite",
      });
    }

    // Initialize workspace indexer (uses persistence for caching)
    this._workspaceIndexer = new WorkspaceIndexer(this._persistence);

    const os = require("node:os");
    const path = require("node:path");
    this._permissionGate = new PermissionGate({
      memory: this._memory,
      emitEvent: (e) => this._broadcast(e),
      gpuConfig: this._config.gpuGuardrails || {},
      persistPath: path.join(
        os.homedir(),
        ".codein",
        "swarm",
        this._workspaceHash,
        "permissions.json",
      ),
    });

    this._agentRouter = new AgentRouter(
      { maxAgents: this._config.maxAgents },
      {
        permissionGate: this._permissionGate,
        memory: this._memory,
        persistence: this._persistence,
        emitEvent: (e) => this._broadcast(e),
        runLLM: this._createTierAwareRunLLM(),
      },
    );

    this._patchEngine = new JsonPatchEngine({
      workspaceHash: this._workspaceHash,
    });

    // Initialize cost router with budget from config
    this._costRouter = new CostRouter({
      budgetUSD: this._config.gpuGuardrails?.maxBudgetUSD || 10,
      warningThresholdPercent: 80,
    });

    // Initialize workspace memory (learns project patterns)
    if (WorkspaceMemory) {
      try {
        this._workspaceMemory = new WorkspaceMemory({
          persistence: this._persistence,
          workspaceRoot: process.cwd(),
        });
        log.info("Workspace memory initialized");
      } catch (err) {
        log.warn("Workspace memory init failed", { error: err.message });
      }
    }

    // Initialize background task manager
    // Note: BackgroundTaskManager uses its own InMemoryPersistence (save/get/query/update API),
    // which is separate from the main SQLite persistence (different API surface).
    if (BackgroundTaskManager) {
      try {
        this._backgroundTasks = new BackgroundTaskManager({
          persistence: null, // Uses internal InMemoryPersistence — SQLite persistence has incompatible API
          maxConcurrent: this._config.concurrency || 3,
        });
        // Recover interrupted tasks from previous session
        if (TaskRecovery && this._backgroundTasks._persistence) {
          try {
            const recovery = TaskRecovery.recoverTasks(
              this._backgroundTasks._persistence,
            );
            if (recovery.recovered > 0) {
              log.info("Recovered interrupted tasks", recovery);
            }
          } catch (recoveryErr) {
            log.warn("Task recovery failed", { error: recoveryErr.message });
          }
        }
      } catch (err) {
        log.warn("Background task manager init failed", { error: err.message });
      }
    }

    // Initialize plugin system
    if (PluginManager) {
      try {
        this._pluginManager = new PluginManager({
          persistence: this._persistence,
        });
        // loadPlugins() is async — fire and forget, log results when done
        this._pluginManager
          .loadPlugins()
          .then((loaded) => {
            if (loaded.loaded.length > 0) {
              log.info("Plugins loaded", { plugins: loaded.loaded });
            }
            if (loaded.errors.length > 0) {
              log.warn("Plugin load errors", { errors: loaded.errors });
            }
          })
          .catch((err) => {
            log.warn("Plugin loading failed", { error: err.message });
          });
      } catch (err) {
        log.warn("Plugin manager init failed", { error: err.message });
      }
    }

    // Initialize skill registry
    if (SkillRegistry) {
      try {
        this._skillRegistry = new SkillRegistry();
        log.info("Skill registry initialized");
      } catch (err) {
        log.warn("Skill registry init failed", { error: err.message });
      }
    }

    // Initialize doc generator
    if (DocGenerator) {
      this._docGenerator = new DocGenerator({ runLLM: this._deps.runLLM });
    }

    // Initialize terminal manager
    if (TerminalManager) {
      try {
        this._terminalManager = new TerminalManager();
        log.info("Terminal manager initialized");
      } catch (err) {
        log.warn("Terminal manager init failed", { error: err.message });
      }
    }

    // Initialize git workflow
    if (GitWorkflow) {
      try {
        this._gitWorkflow = new GitWorkflow({ runLLM: this._deps.runLLM });
        log.info("Git workflow initialized");
      } catch (err) {
        log.warn("Git workflow init failed", { error: err.message });
      }
    }

    // Initialize autonomous planner
    if (AutonomousPlanner) {
      try {
        this._autonomousPlanner = new AutonomousPlanner({
          runLLM: this._deps.runLLM,
          executeStep: (step, ctx) => this._executeAutonomousStep(step, ctx),
          runTests: null, // optional — can be configured later
        });
        // Forward planner events to the main event stream
        this._autonomousPlanner.on("event", (event) => {
          this._broadcast(
            createSwarmEvent({
              type: EVENT_TYPE.NODE_COMPLETED, // reuse existing event type for planner events
              data: {
                plannerEvent: event.type,
                planId: event.planId,
                ...event.data,
              },
            }),
          );
        });
        log.info("Autonomous planner initialized");
      } catch (err) {
        log.warn("Autonomous planner init failed", { error: err.message });
      }
    }

    // Initialize Docker sandbox
    if (DockerSandbox) {
      try {
        this._dockerSandbox = new DockerSandbox();
        log.info("Docker sandbox initialized");
      } catch (err) {
        log.warn("Docker sandbox init failed", { error: err.message });
      }
    }

    // Initialize SQLite memory store (additional persistence layer for memory)
    if (SqliteMemoryStore) {
      try {
        this._sqliteMemoryStore = new SqliteMemoryStore({
          workspaceHash: this._workspaceHash,
          enabled: true,
        });
        log.info("SQLite memory store initialized", {
          usingSqlite: this._sqliteMemoryStore.usingSqlite,
        });

        // Wire SQLite memory store as write-through persistence for the blackboard
        if (this._memory && this._memory.blackboard) {
          this._memory.blackboard._persistence = this._sqliteMemoryStore;
          log.debug("Blackboard persistence wired to SQLite memory store");
        }
      } catch (err) {
        log.warn("SQLite memory store init failed", { error: err.message });
      }
    }

    // Initialize SQLite task queue (durable task storage)
    if (SqliteTaskQueue) {
      try {
        this._sqliteTaskQueue = new SqliteTaskQueue({
          workspaceHash: this._workspaceHash,
        });
        log.info("SQLite task queue initialized", {
          usingSqlite: this._sqliteTaskQueue.usingSqlite,
        });
      } catch (err) {
        log.warn("SQLite task queue init failed", { error: err.message });
      }
    }

    // Initialize plugin hooks
    if (PluginHookManager) {
      try {
        this._pluginHooks = new PluginHookManager({ logger: log });
        log.info("Plugin hook manager initialized");
      } catch (err) {
        log.warn("Plugin hook manager init failed", { error: err.message });
      }
    }

    // Connect loaded plugins to hook system
    if (this._pluginManager && this._pluginHooks) {
      try {
        const plugins = this._pluginManager.listPlugins();
        let hookCount = 0;
        for (const plugin of plugins) {
          // Plugin manifests declare hooks as { hookName: handlerPath } in plugin-system.js.
          // Bridge the two systems: for each plugin hook declared in the manifest,
          // register a proxy handler with PluginHookManager that delegates to PluginManager.runHook().
          const entry = this._pluginManager._plugins.get(plugin.name);
          if (
            entry &&
            entry.manifest &&
            typeof entry.manifest.hooks === "object"
          ) {
            for (const [hookName] of Object.entries(entry.manifest.hooks)) {
              const pluginName = plugin.name;
              const pm = this._pluginManager;
              this._pluginHooks.register(hookName, pluginName, async (ctx) => {
                await pm.runHook(hookName, ctx);
              });
              hookCount++;
            }
          }
        }
        if (plugins.length > 0) {
          log.info("Plugin hooks connected", {
            pluginCount: plugins.length,
            hookCount,
          });
        }
      } catch (err) {
        log.warn("Plugin hook connection failed", { error: err.message });
      }
    }

    // Initialize smart apply
    if (SmartApply) {
      try {
        this._smartApply = new SmartApply({ workspaceRoot: process.cwd() });
        log.info("Smart apply initialized");
      } catch (err) {
        log.warn("Smart apply init failed", { error: err.message });
      }
    }

    this._state = SWARM_STATE.ACTIVE;
    this._memory.onSwarmInit(this._config);

    // Emit plugin hook: swarm:init
    if (this._pluginHooks && HOOK_EVENT) {
      this._pluginHooks
        .emit(HOOK_EVENT.SWARM_INIT, { config: this._config })
        .catch(() => {});
    }

    // Validate cloud model availability
    const cloudWarnings = this._validateCloudModels();

    this._broadcast(
      createSwarmEvent({
        type: EVENT_TYPE.SWARM_INIT,
        data: { config: this._config, warnings: cloudWarnings },
      }),
    );

    return { status: "active", config: this._config, warnings: cloudWarnings };
  }

  // ════════════════════════════════════════════════════════════
  // 2. agentSpawn(type, config) — Create specialist agent
  // ════════════════════════════════════════════════════════════

  agentSpawn(type) {
    this._requireActive();
    const agent = this._agentRouter.route(type);

    // Emit plugin hook: agent:spawn
    if (this._pluginHooks && HOOK_EVENT) {
      this._pluginHooks
        .emit(HOOK_EVENT.AGENT_SPAWN, {
          agentId: agent.id,
          type,
          descriptor: agent.descriptor,
        })
        .catch(() => {});
    }

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
      eventCount: this._eventLog.length,
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
          log.debug("Task persisted to SQLite queue", { taskId: taskGraph.id });
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
        log.info("Session completed", { sessionId, status: taskGraph.status });
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
    if (this._state === SWARM_STATE.SHUTDOWN) {
      return { status: "already_shutdown" };
    }

    this._state = SWARM_STATE.SHUTTING_DOWN;
    this._broadcast(
      createSwarmEvent({ type: EVENT_TYPE.SWARM_SHUTDOWN, data: {} }),
    );

    // Cancel pending tasks
    for (const [taskId] of this._tasks) {
      this.taskCancel(taskId);
    }

    // Emit plugin hook: swarm:shutdown
    if (this._pluginHooks && HOOK_EVENT) {
      this._pluginHooks.emit(HOOK_EVENT.SWARM_SHUTDOWN, {}).catch(() => {});
    }

    // Shutdown subsystems
    if (this._taskPruneInterval) clearInterval(this._taskPruneInterval);
    if (this._permissionGate) this._permissionGate.destroy();
    if (this._agentRouter) this._agentRouter.shutdown();
    if (this._memory) this._memory.destroy();
    if (this._persistence && this._persistence.close) {
      try {
        this._persistence.close();
        log.info("Persistence layer closed");
      } catch {
        // Non-fatal
      }
    }
    if (this._terminalManager) {
      try {
        this._terminalManager.shutdown();
      } catch {
        /* non-fatal */
      }
    }
    if (this._dockerSandbox) {
      this._dockerSandbox.shutdown().catch(() => {});
    }
    if (this._sqliteMemoryStore) {
      try {
        this._sqliteMemoryStore.close();
      } catch {
        /* non-fatal */
      }
    }
    if (this._sqliteTaskQueue) {
      try {
        this._sqliteTaskQueue.close();
      } catch {
        /* non-fatal */
      }
    }
    if (this._pluginHooks) {
      try {
        this._pluginHooks.clear();
      } catch {
        /* non-fatal */
      }
    }
    this._persistence = null;
    this._workspaceIndexer = null;
    this._costRouter = null;
    this._workspaceMemory = null;
    this._backgroundTasks = null;
    this._pluginManager = null;
    this._skillRegistry = null;
    this._docGenerator = null;
    this._terminalManager = null;
    this._gitWorkflow = null;
    this._autonomousPlanner = null;
    this._dockerSandbox = null;
    this._sqliteMemoryStore = null;
    this._sqliteTaskQueue = null;
    this._pluginHooks = null;
    this._smartApply = null;

    // Close SSE subscribers
    for (const sub of this._subscribers) {
      try {
        sub.end();
      } catch {
        /* ignore */
      }
    }
    this._subscribers.clear();

    // Remove all EventEmitter listeners so Node doesn't stay alive
    this.removeAllListeners();

    this._state = SWARM_STATE.SHUTDOWN;
    return { status: "shutdown" };
  }

  // ════════════════════════════════════════════════════════════
  // Analytics & Workspace API
  // ════════════════════════════════════════════════════════════

  /**
   * Get cost analytics from persistence layer.
   * @param {string} [sessionId] — Optional session filter
   * @returns {object|null}
   */
  getAnalytics(sessionId) {
    if (!this._persistence) return null;
    return this._persistence.getAnalytics(sessionId);
  }

  /**
   * Get workspace summary for a given root path.
   * @param {string} [workspaceRoot]
   * @returns {Promise<string|null>}
   */
  async getWorkspaceSummary(workspaceRoot) {
    if (!this._workspaceIndexer) return null;
    return this._workspaceIndexer.getContextSummary(
      workspaceRoot || process.cwd(),
    );
  }

  // ════════════════════════════════════════════════════════════
  // Cost Router API
  // ════════════════════════════════════════════════════════════

  /** Get current budget status. */
  getBudgetStatus() {
    return this._costRouter ? this._costRouter.getBudgetStatus() : null;
  }

  /** Get cost optimization suggestions. */
  getCostSuggestions() {
    if (!this._costRouter || !this._persistence) return [];
    return this._costRouter.suggestCostOptimization(
      this._persistence.getAnalytics(),
    );
  }

  // ════════════════════════════════════════════════════════════
  // Streaming API
  // ════════════════════════════════════════════════════════════

  /** Get the SSE handler for a specific task's stream. */
  getTaskStreamHandler(taskId) {
    return this._streamEngine.createSSEHandler(taskId);
  }

  // ════════════════════════════════════════════════════════════
  // Background Tasks API
  // ════════════════════════════════════════════════════════════

  /** Submit a task for background execution — auto-starts if capacity available. */
  submitBackgroundTask(taskSpec) {
    if (!this._backgroundTasks)
      return { error: "Background tasks not available" };
    const submission = this._backgroundTasks.submit(taskSpec);

    // Auto-drain: start the task if we have capacity
    this._drainBackgroundQueue();

    return submission;
  }

  /**
   * Drain the background task queue — start queued tasks up to concurrency limit.
   * @private
   */
  _drainBackgroundQueue() {
    if (!this._backgroundTasks) return;

    const queue = this._backgroundTasks._queue;
    if (!queue || queue.size === 0) return;

    // Peek at next task and try to start it
    const next = queue.peek();
    if (!next) return;

    const handle = this._backgroundTasks.start(next.id, async (spec) => {
      // Execute via taskOrchestrate
      return this.taskOrchestrate({
        goal: spec.goal,
        mode: spec.mode || "single",
        topology: spec.topology,
        context: spec.context || {},
      });
    });

    // If started successfully, schedule next drain after completion
    if (handle) {
      // Listen for completion to drain next
      this._backgroundTasks.once("task:completed", () =>
        this._drainBackgroundQueue(),
      );
      this._backgroundTasks.once("task:failed", () =>
        this._drainBackgroundQueue(),
      );
    }
  }

  /** Get background task status. */
  getBackgroundTaskStatus(taskId) {
    if (!this._backgroundTasks) return null;
    return this._backgroundTasks.getStatus(taskId);
  }

  /** List all background tasks. */
  listBackgroundTasks(filter) {
    if (!this._backgroundTasks) return [];
    return this._backgroundTasks.listTasks(filter);
  }

  // ════════════════════════════════════════════════════════════
  // Plugin & Skill API
  // ════════════════════════════════════════════════════════════

  /** List loaded plugins. */
  listPlugins() {
    return this._pluginManager ? this._pluginManager.listPlugins() : [];
  }

  /** List available skills. */
  listSkills(category) {
    return this._skillRegistry ? this._skillRegistry.listSkills(category) : [];
  }

  /** Execute a built-in skill. */
  async executeSkill(name, context) {
    if (!this._skillRegistry) return { error: "Skill registry not available" };
    return this._skillRegistry.executeSkill(name, context);
  }

  // ════════════════════════════════════════════════════════════
  // Document Generation API
  // ════════════════════════════════════════════════════════════

  /** Generate a commit message from a diff. */
  async generateCommitMessage(diff, opts) {
    if (!this._docGenerator) return { error: "Doc generator not available" };
    return this._docGenerator.generateCommitMessage(diff, opts);
  }

  /** Generate a PR description. */
  async generatePRDescription(opts) {
    if (!this._docGenerator) return { error: "Doc generator not available" };
    return this._docGenerator.generatePRDescription(opts);
  }

  /** Generate a changelog. */
  generateChangelog(opts) {
    if (!this._docGenerator) return { error: "Doc generator not available" };
    return this._docGenerator.generateChangelog(opts);
  }

  // ════════════════════════════════════════════════════════════
  // Workspace Memory API
  // ════════════════════════════════════════════════════════════

  /** Get project profile from learned patterns. */
  getProjectProfile() {
    return this._workspaceMemory
      ? this._workspaceMemory.getProjectProfile()
      : null;
  }

  /** Get detected conventions. */
  getConventions() {
    return this._workspaceMemory ? this._workspaceMemory.getConventions() : [];
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
    if (!this._permissionGate) {
      return { success: false, error: "Swarm not active" };
    }
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
    const recent = this._eventLog.slice(-50);
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
    return this._eventLog.slice(-limit);
  }

  // ════════════════════════════════════════════════════════════
  // Internal: Graph Execution
  // ════════════════════════════════════════════════════════════

  async _executeGraph(taskGraph, scheduler, context, sessionId) {
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
    this._eventLog.push(event);
    if (this._eventLog.length > this._maxEvents) {
      this._eventLog = this._eventLog.slice(-this._maxEvents);
    }

    // Persist event to SQLite
    if (this._persistence && this._persistence.recordEvent) {
      try {
        this._persistence.recordEvent(event);
      } catch {
        // Non-fatal — don't let persistence errors break event flow
      }
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

  /**
   * Check that at least one cloud model API key is configured.
   * Returns an array of warning strings (empty if all good).
   */
  _validateCloudModels() {
    const warnings = [];
    const keyEnvVars = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_API_KEY",
      "DEEPSEEK_API_KEY",
    ];
    const hasAnyKey = keyEnvVars.some((k) => !!process.env[k]);
    if (!hasAnyKey) {
      warnings.push(
        "No cloud model API key found. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, " +
          "GOOGLE_API_KEY, or DEEPSEEK_API_KEY for full swarm capabilities. " +
          "Falling back to local/offline models only.",
      );
    }
    // Check if premium tier agents can actually use a cloud model
    if (!hasAnyKey && this._config?.maxAgents > 1) {
      warnings.push(
        "Multi-agent orchestration works best with cloud models. " +
          "Consider configuring at least one API key for production use.",
      );
    }
    return warnings;
  }

  /**
   * Wrap deps.runLLM so each call injects the model tier hint from mode-config.
   * BaseAgent.callLLM honours opts.model || descriptor.modelHint, so agents
   * created via createAgent already carry a modelHint.  The wrapper here
   * ensures that even direct runLLM calls honour the tier preference.
   */
  _createTierAwareRunLLM() {
    const baseRunLLM = this._deps.runLLM;
    if (typeof baseRunLLM !== "function") return baseRunLLM;

    return async (systemPrompt, userPrompt, opts = {}) => {
      // If the caller already specified a model, respect it
      if (opts.model) {
        const result = await baseRunLLM(systemPrompt, userPrompt, opts);
        this._trackCostRouterSpend(result, opts);
        return result;
      }

      // Use CostRouter for intelligent model selection if available
      const agentType = opts.agentType || opts._agentType;
      if (this._costRouter && agentType) {
        try {
          const selection = this._costRouter.selectModel({
            agentType,
            goal: opts.goal || "",
            contextSize: (systemPrompt + userPrompt).length,
          });
          if (selection && selection.model) {
            const result = await baseRunLLM(systemPrompt, userPrompt, {
              ...opts,
              model: selection.model,
              modelTier: selection.tier,
            });
            this._trackCostRouterSpend(result, opts);
            return result;
          }
        } catch {
          // Fall through to mode-config fallback
        }
      }

      // Fallback: derive tier from agentType via mode-config
      if (agentType) {
        const tier = getAgentModelTier(agentType);
        if (tier) {
          const result = await baseRunLLM(systemPrompt, userPrompt, {
            ...opts,
            modelTier: tier,
          });
          this._trackCostRouterSpend(result, opts);
          return result;
        }
      }
      const result = await baseRunLLM(systemPrompt, userPrompt, opts);
      this._trackCostRouterSpend(result, opts);
      return result;
    };
  }

  /**
   * Track LLM spend in the CostRouter for budget enforcement.
   * @private
   */
  _trackCostRouterSpend(result, opts) {
    if (!this._costRouter || !result) return;
    try {
      if (typeof result === "object" && result.usage) {
        const inputTokens =
          result.usage.input_tokens || result.usage.prompt_tokens || 0;
        const outputTokens =
          result.usage.output_tokens || result.usage.completion_tokens || 0;
        const model = result.model || opts.model || "unknown";
        this._costRouter.trackSpend({
          model,
          inputTokens,
          outputTokens,
          agentType: opts.agentType || opts._agentType || "unknown",
        });
      }
    } catch {
      /* non-fatal */
    }
  }

  _requireActive() {
    if (this._state !== SWARM_STATE.ACTIVE) {
      throw new Error(`Swarm is ${this._state}. Call swarmInit() first.`);
    }
  }
}

// Attach delegation APIs (terminal, git, planner, docker, sqlite, plugins, smart-apply)
applyExtensionMethods(SwarmManager);

module.exports = { SwarmManager, SWARM_STATE };
