/**
 * CodeIn MAS — SwarmManager Extension Methods
 *
 * Delegation APIs extracted from SwarmManager to reduce class body size.
 * These methods delegate to optional subsystem instances (_terminalManager,
 * _gitWorkflow, _autonomousPlanner, _dockerSandbox, etc.).
 *
 * Usage:
 *   const { applyExtensionMethods } = require("./swarm-extensions");
 *   applyExtensionMethods(SwarmManager);
 */
"use strict";

/**
 * Attach extension (delegation) methods to SwarmManager.prototype.
 * @param {Function} SwarmManager — the SwarmManager class
 */
function applyExtensionMethods(SwarmManager) {
  const proto = SwarmManager.prototype;

  // ════════════════════════════════════════════════════════════
  // Terminal Manager API
  // ════════════════════════════════════════════════════════════

  /** Get or create a terminal session for an agent. */
  proto.getTerminalSession = function getTerminalSession(agentId) {
    if (!this._terminalManager)
      return { error: "Terminal manager not available" };
    return this._terminalManager.getAgentSession(agentId);
  };

  /** List all terminal sessions. */
  proto.listTerminalSessions = function listTerminalSessions() {
    if (!this._terminalManager) return [];
    return this._terminalManager.listSessions();
  };

  /** Close a terminal session by ID. */
  proto.closeTerminalSession = function closeTerminalSession(id) {
    if (!this._terminalManager) return false;
    return this._terminalManager.closeSession(id);
  };

  /** Create a new terminal session. */
  proto.createTerminalSession = function createTerminalSession(opts = {}) {
    if (!this._terminalManager)
      return { error: "Terminal manager not available" };
    const session = this._terminalManager.createSession(opts);
    return session.toJSON();
  };

  /** Execute a command in a terminal session. */
  proto.executeInTerminal = async function executeInTerminal(
    sessionId,
    command,
    opts = {},
  ) {
    if (!this._terminalManager)
      return { error: "Terminal manager not available" };
    const session = this._terminalManager.getSession(sessionId);
    if (!session) return { error: "Session not found" };
    return session.execute(command, opts);
  };

  // ════════════════════════════════════════════════════════════
  // Git Workflow API
  // ════════════════════════════════════════════════════════════

  /** Get git status. */
  proto.gitStatus = function gitStatus() {
    if (!this._gitWorkflow) return { error: "Git workflow not available" };
    return this._gitWorkflow.status();
  };

  /** Get git diff. */
  proto.gitDiff = function gitDiff(opts = {}) {
    if (!this._gitWorkflow) return { error: "Git workflow not available" };
    return this._gitWorkflow.diff(opts);
  };

  /** Get git log. */
  proto.gitLog = function gitLog(count = 10) {
    if (!this._gitWorkflow) return { error: "Git workflow not available" };
    return this._gitWorkflow.log(count);
  };

  /** Create a git branch (requires permission check). */
  proto.gitCreateBranch = async function gitCreateBranch(name, base) {
    if (!this._gitWorkflow) return { error: "Git workflow not available" };
    this._requireActive();
    return this._gitWorkflow.createBranch(name, base);
  };

  /** Stage git files (requires permission check). */
  proto.gitStage = async function gitStage(files) {
    if (!this._gitWorkflow) return { error: "Git workflow not available" };
    this._requireActive();
    return this._gitWorkflow.stage(files);
  };

  /** Commit staged changes (requires permission check). */
  proto.gitCommit = async function gitCommit(message) {
    if (!this._gitWorkflow) return { error: "Git workflow not available" };
    this._requireActive();
    return this._gitWorkflow.commit(message);
  };

  // ════════════════════════════════════════════════════════════
  // Autonomous Planner API
  // ════════════════════════════════════════════════════════════

  /** Start an autonomous planning loop for a goal. */
  proto.runAutonomousPlan = async function runAutonomousPlan(
    goal,
    context = {},
  ) {
    if (!this._autonomousPlanner)
      return { error: "Autonomous planner not available" };
    this._requireActive();
    return this._autonomousPlanner.run(goal, context);
  };

  /** List active autonomous plans. */
  proto.getActivePlans = function getActivePlans() {
    if (!this._autonomousPlanner) return [];
    return this._autonomousPlanner.listPlans();
  };

  /**
   * Execute a step from the autonomous planner by delegating to taskOrchestrate.
   * @private
   */
  proto._executeAutonomousStep = async function _executeAutonomousStep(
    step,
    context,
  ) {
    try {
      const result = await this.taskOrchestrate({
        goal: step.description,
        mode: "single",
        context,
      });
      return {
        success: result.status === "completed",
        result: result,
        error:
          result.status !== "completed"
            ? `Task ended with status: ${result.status}`
            : null,
      };
    } catch (err) {
      return { success: false, result: null, error: err.message };
    }
  };

  // ════════════════════════════════════════════════════════════
  // Docker Sandbox API
  // ════════════════════════════════════════════════════════════

  /** Execute code in a Docker sandbox. */
  proto.executeSandboxed = async function executeSandboxed(
    code,
    runtime,
    opts = {},
  ) {
    if (!this._dockerSandbox) return { error: "Docker sandbox not available" };
    return this._dockerSandbox.execute({ code, runtime, ...opts });
  };

  /** Check if Docker sandbox is available. */
  proto.isSandboxAvailable = async function isSandboxAvailable() {
    if (!this._dockerSandbox)
      return { available: false, reason: "Docker sandbox module not loaded" };
    if (this._dockerSandbox._dockerAvailable === null) {
      await this._dockerSandbox.initialize();
    }
    return { available: this._dockerSandbox.isAvailable() };
  };

  // ════════════════════════════════════════════════════════════
  // SQLite Store API
  // ════════════════════════════════════════════════════════════

  /** Get the SQLite memory store instance. */
  proto.getMemoryStore = function getMemoryStore() {
    return this._sqliteMemoryStore || null;
  };

  /** Get the SQLite task queue instance. */
  proto.getSqliteTaskQueue = function getSqliteTaskQueue() {
    return this._sqliteTaskQueue || null;
  };

  // ════════════════════════════════════════════════════════════
  // Plugin Hooks API
  // ════════════════════════════════════════════════════════════

  /** Get the plugin hook manager for plugins to register handlers. */
  proto.getPluginHooks = function getPluginHooks() {
    return this._pluginHooks || null;
  };

  // ════════════════════════════════════════════════════════════
  // Smart Apply API
  // ════════════════════════════════════════════════════════════

  /**
   * Apply a fuzzy/AST-aware code patch to a file.
   * SmartApply provides fuzzy matching and syntax validation
   * that the standard JsonPatchEngine does not.
   *
   * NOTE: This method is exposed for agent-internal use only (e.g., called
   * programmatically by SwarmManager during task execution). There is no
   * corresponding HTTP route — this is intentional. Agents access it via
   * their reference to the SwarmManager instance, not via the REST API.
   */
  proto.smartApply = async function smartApply(filePath, patch, opts = {}) {
    if (!this._smartApply) return { error: "Smart apply not available" };
    if (Array.isArray(patch)) {
      return this._smartApply.applyEdits(filePath, patch, opts);
    }
    return this._smartApply.applyEdit(filePath, patch, opts);
  };
  // ════════════════════════════════════════════════════════════
  // Computer API — Autonomous Computer Subsystem Delegation
  // ════════════════════════════════════════════════════════════

  /**
   * Run an autonomous computer goal: generate a skill-aware plan, enrich
   * context from contextual memory, then execute via the execution engine.
   *
   * @param {string} goal — Natural language goal
   * @param {object} [context={}] — Additional context
   * @returns {Promise<object>}
   */
  proto.runComputer = async function runComputer(goal, context = {}) {
    if (!this._autonomousPlanner) {
      return { error: "Autonomous planner not available" };
    }
    this._requireActive();

    // Enrich context from contextual memory if available
    let enrichedContext = { ...context };
    if (this._contextualMemory) {
      try {
        const assembled = this._contextualMemory.assembleContext(goal);
        enrichedContext = { ...enrichedContext, ...assembled };
      } catch {
        /* non-fatal */
      }
    }

    return this._autonomousPlanner.run(goal, enrichedContext);
  };

  /**
   * Get the status of an autonomous plan execution.
   * @param {string} planId
   * @returns {object|null}
   */
  proto.getComputerPlanStatus = function getComputerPlanStatus(planId) {
    if (!this._executionEngine) {
      return { error: "Execution engine not available" };
    }
    return this._executionEngine.getExecutionStatus(planId);
  };

  /**
   * List all available computer skills.
   * @param {object} [opts] — { category, trustLevel }
   * @returns {object[]}
   */
  proto.listComputerSkills = function listComputerSkills(opts = {}) {
    if (!this._enhancedSkillRegistry) {
      return { error: "Enhanced skill registry not available" };
    }
    return this._enhancedSkillRegistry.listSkills(opts);
  };

  /**
   * Find skills relevant to a natural-language task description.
   * @param {string} description
   * @returns {Promise<object[]>}
   */
  proto.findSkillsForTask = async function findSkillsForTask(description) {
    if (!this._enhancedSkillRegistry) {
      return { error: "Enhanced skill registry not available" };
    }
    return this._enhancedSkillRegistry.findSkillsForTask(description);
  };

  /**
   * Execute a specific computer skill by name.
   * @param {string} name — Skill name
   * @param {object} [context={}] — Input context
   * @returns {Promise<object>}
   */
  proto.executeComputerSkill = async function executeComputerSkill(
    name,
    context = {},
  ) {
    if (!this._enhancedSkillRegistry) {
      return { error: "Enhanced skill registry not available" };
    }
    this._requireActive();
    return this._enhancedSkillRegistry.executeSkill(name, context);
  };

  /**
   * Get audit trail entries.
   * @param {object} [opts] — { planId, action, limit, startMs, endMs }
   * @returns {object[]|object}
   */
  proto.getComputerAudit = function getComputerAudit(opts = {}) {
    if (!this._auditTrail) {
      return { error: "Audit trail not available" };
    }
    if (opts.planId) {
      return this._auditTrail.getByPlan(opts.planId);
    }
    if (opts.action) {
      return this._auditTrail.getByAction(opts.action, {
        limit: opts.limit || 100,
      });
    }
    if (opts.startMs && opts.endMs) {
      return this._auditTrail.getByTimeRange(opts.startMs, opts.endMs, {
        limit: opts.limit || 100,
      });
    }
    return this._auditTrail.getRecent(opts.limit || 50);
  };

  /**
   * List saved workflow templates.
   * @param {string} [category]
   * @returns {object[]|object}
   */
  proto.listWorkflows = function listWorkflows(category) {
    if (!this._workflowEngine) {
      return { error: "Workflow engine not available" };
    }
    return this._workflowEngine.listTemplates(category);
  };

  /**
   * Save a completed plan as a reusable workflow template.
   * @param {object} plan
   * @param {string} name
   * @param {string} [description]
   * @returns {object}
   */
  proto.saveWorkflow = function saveWorkflow(plan, name, description) {
    if (!this._workflowEngine) {
      return { error: "Workflow engine not available" };
    }
    return this._workflowEngine.saveAsTemplate(plan, name, description);
  };

  /**
   * Instantiate and run a workflow template.
   * @param {string} name — Template name
   * @param {object} [vars={}] — Variable substitutions
   * @param {object} [ctx={}] — Execution context
   * @returns {Promise<object>}
   */
  proto.runWorkflow = async function runWorkflow(name, vars = {}, ctx = {}) {
    if (!this._workflowEngine) {
      return { error: "Workflow engine not available" };
    }
    this._requireActive();
    return this._workflowEngine.runTemplate(name, vars, ctx);
  };

  /**
   * Pause a running computer plan execution.
   * @param {string} planId
   * @returns {object}
   */
  proto.pauseComputer = function pauseComputer(planId) {
    if (!this._executionEngine) {
      return { error: "Execution engine not available" };
    }
    return this._executionEngine.pauseExecution(planId);
  };

  /**
   * Resume a paused computer plan execution.
   * @param {string} planId
   * @returns {object}
   */
  proto.resumeComputer = function resumeComputer(planId) {
    if (!this._executionEngine) {
      return { error: "Execution engine not available" };
    }
    return this._executionEngine.resumeExecution(planId);
  };

  /**
   * Cancel a running or paused computer plan execution.
   * @param {string} planId
   * @returns {Promise<object>}
   */
  proto.cancelComputer = async function cancelComputer(planId) {
    if (!this._executionEngine) {
      return { error: "Execution engine not available" };
    }
    return this._executionEngine.cancelExecution(planId);
  };
}

module.exports = { applyExtensionMethods };
