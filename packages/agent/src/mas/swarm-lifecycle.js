/**
 * CodeIn MAS — Swarm Lifecycle Module
 *
 * Handles initialization, shutdown, status, configuration, health checks,
 * and subsystem bootstrapping for the SwarmManager.
 *
 * Extracted from swarm-manager.js as part of the decomposition.
 */
"use strict";

const crypto = require("node:crypto");

const {
  EVENT_TYPE,
  AGENT_TYPE,
  createSwarmConfig,
  createSwarmEvent,
  validateSwarmConfig,
} = require("./types");

const { MemoryManager } = require("./memory");
const { PermissionGate } = require("./permissions");
const { AgentRouter } = require("./agent-router");
const { BatchPlanner } = require("./batch");
const { JsonPatchEngine } = require("./json-patch");
const { getAgentModelTier } = require("./mode-config");
const { openDatabase } = require("./persistence");
const { WorkspaceIndexer } = require("./workspace-indexer");
const { StreamEngine } = require("./stream-engine");
const { IndianLanguageProcessor } = require("./indian-lang");
const { CostRouter } = require("./cost-router");
const { createLogger } = require("./logger");

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

// Autonomous computer subsystem modules (optional)
let AuditTrail,
  EnhancedSkillRegistry,
  ExecutionEngine,
  ContextualMemory,
  WorkflowEngine;
try {
  ({ AuditTrail } = require("./audit-trail"));
} catch {
  AuditTrail = null;
}
try {
  ({ EnhancedSkillRegistry } = require("./skill-registry"));
} catch {
  EnhancedSkillRegistry = null;
}
try {
  ({ ExecutionEngine } = require("./execution-engine"));
} catch {
  ExecutionEngine = null;
}
try {
  ({ ContextualMemory } = require("./contextual-memory"));
} catch {
  ContextualMemory = null;
}
try {
  ({ WorkflowEngine } = require("./workflow-engine"));
} catch {
  WorkflowEngine = null;
}

const log = createLogger("SwarmManager");

// ─── Swarm States ────────────────────────────────────────────
const SWARM_STATE = Object.freeze({
  IDLE: "idle",
  ACTIVE: "active",
  SHUTTING_DOWN: "shutting_down",
  SHUTDOWN: "shutdown",
});

/**
 * Initialize default instance fields on a SwarmManager instance.
 * Called from the constructor.
 * @param {object} mgr — the SwarmManager instance (this)
 * @param {object} deps — constructor deps
 */
function initFields(mgr, deps) {
  mgr._deps = deps;
  mgr._state = SWARM_STATE.IDLE;
  mgr._config = null;
  mgr._workspaceHash = null;

  // Subsystems (initialized on swarmInit)
  mgr._memory = null;
  mgr._permissionGate = null;
  mgr._agentRouter = null;
  mgr._batchPlanner = new BatchPlanner();
  mgr._patchEngine = null;
  mgr._persistence = null;
  mgr._workspaceIndexer = null;
  mgr._streamEngine = new StreamEngine();
  mgr._langProcessor = new IndianLanguageProcessor();
  mgr._costRouter = null;
  mgr._workspaceMemory = null;
  mgr._backgroundTasks = null;
  mgr._pluginManager = null;
  mgr._skillRegistry = null;
  mgr._docGenerator = null;
  mgr._terminalManager = null;
  mgr._gitWorkflow = null;
  mgr._autonomousPlanner = null;
  mgr._dockerSandbox = null;
  mgr._sqliteMemoryStore = null;
  mgr._sqliteTaskQueue = null;
  mgr._pluginHooks = null;
  mgr._smartApply = null;

  // Autonomous computer subsystems (optional)
  mgr._auditTrail = null;
  mgr._enhancedSkillRegistry = null;
  mgr._executionEngine = null;
  mgr._contextualMemory = null;
  mgr._workflowEngine = null;

  // Active task graphs
  /** @type {Map<string, object>} taskId → TaskGraph */
  mgr._tasks = new Map();

  // Event log for SSE streaming
  mgr._eventLog = [];
  mgr._maxEvents = 2000;

  // SSE subscribers
  mgr._subscribers = new Set();

  // Periodic task pruning — remove completed/partial/cancelled tasks older than 1 hour
  mgr._taskPruneInterval = setInterval(
    () => mgr._pruneCompletedTasks(),
    5 * 60 * 1000,
  );
  mgr._taskPruneInterval.unref();
}

/**
 * Attach lifecycle methods to SwarmManager.prototype.
 * @param {Function} SwarmManager — the SwarmManager class
 */
function applyLifecycleMethods(SwarmManager) {
  const proto = SwarmManager.prototype;

  /**
   * Remove completed tasks older than maxAgeMs from _tasks Map to prevent unbounded memory growth.
   * @param {number} [maxAgeMs=3600000] — default 1 hour
   * @returns {number} count of pruned tasks
   */
  proto._pruneCompletedTasks = function _pruneCompletedTasks(
    maxAgeMs = 60 * 60 * 1000,
  ) {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [taskId, task] of this._tasks) {
      if (task.completedAt && new Date(task.completedAt).getTime() < cutoff) {
        this._tasks.delete(taskId);
        pruned++;
      }
    }
    return pruned;
  };

  // ════════════════════════════════════════════════════════════
  // 1. swarmInit(config) — Initialize swarm
  // ════════════════════════════════════════════════════════════

  proto.swarmInit = function swarmInit(config = {}) {
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
        log.warn("Background task manager init failed", {
          error: err.message,
        });
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

    // ── Autonomous computer subsystems (optional — fail gracefully) ──

    // Store tier-aware LLM reference for subsystem use
    this._tierAwareRunLLM = this._agentRouter
      ? this._createTierAwareRunLLM()
      : this._deps.runLLM;

    if (AuditTrail) {
      try {
        this._auditTrail = new AuditTrail({ persistence: this._persistence });
        log.info("Audit trail initialized");
      } catch (err) {
        log.warn("Audit trail init failed", { error: err.message });
      }
    }

    if (EnhancedSkillRegistry) {
      try {
        this._enhancedSkillRegistry = new EnhancedSkillRegistry({
          persistence: this._persistence,
          runLLM: this._tierAwareRunLLM || this._deps.runLLM,
          sandbox: this._dockerSandbox,
        });
        this._enhancedSkillRegistry.registerBuiltinSkills();
        log.info("Enhanced skill registry initialized");
      } catch (err) {
        log.warn("Enhanced skill registry init failed", { error: err.message });
      }
    }

    if (ExecutionEngine) {
      try {
        this._executionEngine = new ExecutionEngine({
          skillRegistry: this._enhancedSkillRegistry,
          permissionGate: this._permissionGate,
          memory: this._memory,
          auditTrail: this._auditTrail,
          runLLM: this._tierAwareRunLLM || this._deps.runLLM,
        });
        log.info("Execution engine initialized");
      } catch (err) {
        log.warn("Execution engine init failed", { error: err.message });
      }
    }

    if (ContextualMemory) {
      try {
        this._contextualMemory = new ContextualMemory({
          memoryManager: this._memory,
          persistence: this._persistence,
        });
        log.info("Contextual memory initialized");
      } catch (err) {
        log.warn("Contextual memory init failed", { error: err.message });
      }
    }

    if (WorkflowEngine) {
      try {
        this._workflowEngine = new WorkflowEngine({
          persistence: this._persistence,
          skillRegistry: this._enhancedSkillRegistry,
          executionEngine: this._executionEngine,
        });
        log.info("Workflow engine initialized");
      } catch (err) {
        log.warn("Workflow engine init failed", { error: err.message });
      }
    }

    // Wire new subsystems into the autonomous planner if both exist
    if (this._autonomousPlanner) {
      if (this._enhancedSkillRegistry) {
        this._autonomousPlanner._skillRegistry = this._enhancedSkillRegistry;
      }
      if (this._executionEngine) {
        this._autonomousPlanner._executionEngine = this._executionEngine;
      }
      if (this._contextualMemory) {
        this._autonomousPlanner._contextualMemory = this._contextualMemory;
      }
      if (this._auditTrail) {
        this._autonomousPlanner._auditTrail = this._auditTrail;
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
  };

  // ════════════════════════════════════════════════════════════
  // 2. agentSpawn(type, config) — Create specialist agent
  // ════════════════════════════════════════════════════════════

  proto.agentSpawn = function agentSpawn(type) {
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
  };

  // ════════════════════════════════════════════════════════════
  // 3. agentList(filter?) — List all active agents
  // ════════════════════════════════════════════════════════════

  proto.agentList = function agentList(filter) {
    this._requireActive();
    return this._agentRouter.list(filter);
  };

  // ════════════════════════════════════════════════════════════
  // 4. swarmStatus() — Overall swarm state
  // ════════════════════════════════════════════════════════════

  proto.swarmStatus = function swarmStatus() {
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
  };

  // ════════════════════════════════════════════════════════════
  // 5. agentMetrics(agentId?) — Agent performance metrics
  // ════════════════════════════════════════════════════════════

  proto.agentMetrics = function agentMetrics(agentId) {
    this._requireActive();
    return this._agentRouter.metrics(agentId);
  };

  // ════════════════════════════════════════════════════════════
  // 10. memoryUsage()
  // ════════════════════════════════════════════════════════════

  proto.memoryUsage = function memoryUsage() {
    if (!this._memory) return null;
    return this._memory.usage();
  };

  // ════════════════════════════════════════════════════════════
  // 11. swarmShutdown()
  // ════════════════════════════════════════════════════════════

  proto.swarmShutdown = function swarmShutdown() {
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
    // Shutdown autonomous computer subsystems
    if (this._auditTrail) {
      try {
        this._auditTrail.flush();
        this._auditTrail.destroy();
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
    this._auditTrail = null;
    this._enhancedSkillRegistry = null;
    this._executionEngine = null;
    this._contextualMemory = null;
    this._workflowEngine = null;
    this._tierAwareRunLLM = null;

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
  };

  // ════════════════════════════════════════════════════════════
  // Permission API (proxied for HTTP routes)
  // ════════════════════════════════════════════════════════════

  proto.getPendingPermissions = function getPendingPermissions() {
    return this._permissionGate
      ? this._permissionGate.getPendingRequests()
      : [];
  };

  proto.respondToPermission = function respondToPermission(
    requestId,
    response,
  ) {
    if (!this._permissionGate) {
      return { success: false, error: "Swarm not active" };
    }
    return this._permissionGate.respondToRequest(requestId, response);
  };

  // ════════════════════════════════════════════════════════════
  // Background Tasks API
  // ════════════════════════════════════════════════════════════

  /** Submit a task for background execution — auto-starts if capacity available. */
  proto.submitBackgroundTask = function submitBackgroundTask(taskSpec) {
    if (!this._backgroundTasks)
      return { error: "Background tasks not available" };
    const submission = this._backgroundTasks.submit(taskSpec);

    // Auto-drain: start the task if we have capacity
    this._drainBackgroundQueue();

    return submission;
  };

  /**
   * Drain the background task queue — start queued tasks up to concurrency limit.
   * @private
   */
  proto._drainBackgroundQueue = function _drainBackgroundQueue() {
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
  };

  /** Get background task status. */
  proto.getBackgroundTaskStatus = function getBackgroundTaskStatus(taskId) {
    if (!this._backgroundTasks) return null;
    return this._backgroundTasks.getStatus(taskId);
  };

  /** List all background tasks. */
  proto.listBackgroundTasks = function listBackgroundTasks(filter) {
    if (!this._backgroundTasks) return [];
    return this._backgroundTasks.listTasks(filter);
  };

  // ════════════════════════════════════════════════════════════
  // Plugin & Skill API
  // ════════════════════════════════════════════════════════════

  /** List loaded plugins. */
  proto.listPlugins = function listPlugins() {
    return this._pluginManager ? this._pluginManager.listPlugins() : [];
  };

  /** List available skills. */
  proto.listSkills = function listSkills(category) {
    return this._skillRegistry ? this._skillRegistry.listSkills(category) : [];
  };

  /** Execute a built-in skill. */
  proto.executeSkill = async function executeSkill(name, context) {
    if (!this._skillRegistry) return { error: "Skill registry not available" };
    return this._skillRegistry.executeSkill(name, context);
  };

  // ════════════════════════════════════════════════════════════
  // Document Generation API
  // ════════════════════════════════════════════════════════════

  /** Generate a commit message from a diff. */
  proto.generateCommitMessage = async function generateCommitMessage(
    diff,
    opts,
  ) {
    if (!this._docGenerator) return { error: "Doc generator not available" };
    return this._docGenerator.generateCommitMessage(diff, opts);
  };

  /** Generate a PR description. */
  proto.generatePRDescription = async function generatePRDescription(opts) {
    if (!this._docGenerator) return { error: "Doc generator not available" };
    return this._docGenerator.generatePRDescription(opts);
  };

  /** Generate a changelog. */
  proto.generateChangelog = function generateChangelog(opts) {
    if (!this._docGenerator) return { error: "Doc generator not available" };
    return this._docGenerator.generateChangelog(opts);
  };

  // ════════════════════════════════════════════════════════════
  // Workspace Memory API
  // ════════════════════════════════════════════════════════════

  /** Get project profile from learned patterns. */
  proto.getProjectProfile = function getProjectProfile() {
    return this._workspaceMemory
      ? this._workspaceMemory.getProjectProfile()
      : null;
  };

  /** Get detected conventions. */
  proto.getConventions = function getConventions() {
    return this._workspaceMemory ? this._workspaceMemory.getConventions() : [];
  };

  // ════════════════════════════════════════════════════════════
  // Internal helpers
  // ════════════════════════════════════════════════════════════

  /**
   * Check that at least one cloud model API key is configured.
   * Returns an array of warning strings (empty if all good).
   */
  proto._validateCloudModels = function _validateCloudModels() {
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
  };

  /**
   * Wrap deps.runLLM so each call injects the model tier hint from mode-config.
   * BaseAgent.callLLM honours opts.model || descriptor.modelHint, so agents
   * created via createAgent already carry a modelHint.  The wrapper here
   * ensures that even direct runLLM calls honour the tier preference.
   */
  proto._createTierAwareRunLLM = function _createTierAwareRunLLM() {
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
  };

  proto._requireActive = function _requireActive() {
    if (this._state !== SWARM_STATE.ACTIVE) {
      throw new Error(`Swarm is ${this._state}. Call swarmInit() first.`);
    }
  };
}

module.exports = { SWARM_STATE, initFields, applyLifecycleMethods };
