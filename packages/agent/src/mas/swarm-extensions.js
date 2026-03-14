/**
 * CodIn MAS — SwarmManager Extension Methods
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
}

module.exports = { applyExtensionMethods };
