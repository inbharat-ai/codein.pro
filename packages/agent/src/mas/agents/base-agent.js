/**
 * CodIn Multi-Agent Swarm — Base Agent
 *
 * Abstract base class for all specialist agents.
 * Provides: identity, lifecycle, LLM interaction,
 * permission requests, metric tracking, event emission.
 */
"use strict";

const {
  AGENT_STATUS,
  EVENT_TYPE,
  createSwarmEvent,
  createAgentDescriptor,
} = require("../types");

class BaseAgent {
  /**
   * @param {object} opts
   * @param {string} opts.type — AGENT_TYPE value
   * @param {string} [opts.modelHint] — Preferred model
   * @param {object} [opts.constraints] — network/write/commands/git/mcp
   * @param {object} deps
   * @param {import("../permissions").PermissionGate} deps.permissionGate
   * @param {import("../memory").MemoryManager} deps.memory
   * @param {function} [deps.emitEvent]
   * @param {function} deps.runLLM — (systemPrompt, userPrompt, opts) => Promise<string>
   */
  constructor(opts, deps) {
    this.descriptor = createAgentDescriptor({
      type: opts.type,
      modelHint: opts.modelHint || null,
      constraints: opts.constraints || {},
    });

    this._permissionGate = deps.permissionGate;
    this._memory = deps.memory;
    this._emitEvent = deps.emitEvent || null;
    this._runLLM = deps.runLLM;

    this.descriptor.status = AGENT_STATUS.IDLE;
  }

  get id() {
    return this.descriptor.id;
  }
  get type() {
    return this.descriptor.type;
  }
  get status() {
    return this.descriptor.status;
  }
  get metrics() {
    return this.descriptor.metrics;
  }

  // ─── Lifecycle ───────────────────────────────────────────

  activate() {
    this.descriptor.status = AGENT_STATUS.BUSY;
    this._emit(EVENT_TYPE.AGENT_SPAWN, { agentId: this.id, type: this.type });
  }

  deactivate() {
    this.descriptor.status = AGENT_STATUS.IDLE;
  }

  markFailed(reason) {
    this.descriptor.status = AGENT_STATUS.ERROR;
    this._emit(EVENT_TYPE.AGENT_REMOVE, { agentId: this.id, reason });
  }

  terminate() {
    this.descriptor.status = AGENT_STATUS.SHUTDOWN;
    this._emit(EVENT_TYPE.AGENT_REMOVE, { agentId: this.id });
  }

  // ─── LLM Interaction ────────────────────────────────────

  /**
   * Execute an LLM call with this agent's system prompt.
   * Tracks metrics (tokens, cost, time).
   *
   * @param {string} userPrompt
   * @param {object} [opts]
   * @param {string} [opts.model]
   * @param {number} [opts.maxTokens]
   * @returns {Promise<string>}
   */
  async callLLM(userPrompt, opts = {}) {
    const start = Date.now();
    try {
      const result = await this._runLLM(this.getSystemPrompt(), userPrompt, {
        model: opts.model || this.descriptor.modelHint,
        maxTokens: opts.maxTokens || 4096,
      });
      const elapsed = Date.now() - start;
      this.descriptor.metrics.tasksCompleted++;
      this.descriptor.metrics.toolCalls++;
      this.descriptor.metrics.totalTimeMs += elapsed;
      return result;
    } catch (err) {
      this.descriptor.metrics.toolCalls++;
      throw err;
    }
  }

  /**
   * Parse a JSON response from the LLM, with one retry on parse failure.
   * @param {string} userPrompt
   * @param {object} [opts]
   * @returns {Promise<object>}
   */
  async callLLMJson(userPrompt, opts = {}) {
    const raw = await this.callLLM(userPrompt, opts);
    try {
      return this._extractJson(raw);
    } catch {
      // Retry once asking for valid JSON
      const retryPrompt = `Your previous response was not valid JSON. Please respond with ONLY valid JSON.\n\nOriginal request:\n${userPrompt}`;
      const raw2 = await this.callLLM(retryPrompt, opts);
      return this._extractJson(raw2);
    }
  }

  _extractJson(text) {
    // Try direct parse
    try {
      return JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code block
      const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) {
        return JSON.parse(match[1].trim());
      }
      // Try to find first { ... } or [ ... ]
      const braceMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (braceMatch) {
        return JSON.parse(braceMatch[1]);
      }
      throw new Error("Could not extract JSON from LLM response");
    }
  }

  // ─── Permissions ─────────────────────────────────────────

  /**
   * Request permission for an action through the PermissionGate.
   * @param {string} permissionType — PERMISSION_TYPE value
   * @param {string} action — Description
   * @param {number} [costEstimate]
   * @returns {Promise<{ decision: string, reason: string }>}
   */
  async requestPermission(nodeId, permissionType, action, costEstimate = 0) {
    return this._permissionGate.requestPermission({
      nodeId,
      agentId: this.id,
      permissionType,
      action,
      costEstimate,
    });
  }

  // ─── Memory Helpers ──────────────────────────────────────

  remember(key, value) {
    this._memory.shortTerm.set(`agent:${this.id}:${key}`, value);
  }

  recall(key) {
    return this._memory.shortTerm.get(`agent:${this.id}:${key}`);
  }

  // ─── Event Emission ──────────────────────────────────────

  _emit(type, data) {
    if (this._emitEvent) {
      this._emitEvent(createSwarmEvent({ type, data }));
    }
  }

  // ─── Abstract Methods (must override) ────────────────────

  /**
   * Return the system prompt for this specialist agent.
   * @returns {string}
   */
  getSystemPrompt() {
    return "You are a CodIn specialist agent. Follow instructions precisely.";
  }

  /**
   * Execute a task node and return the result.
   * @param {object} node — TaskNode from the graph
   * @param {object} context — Shared context from working memory
   * @returns {Promise<{ result: string, artifacts?: object[], confidence?: number }>}
   */
  async execute(node, context) {
    throw new Error(`${this.constructor.name}.execute() not implemented`);
  }

  /** Return a short description of this agent's capabilities. */
  describeCapabilities() {
    return "Base agent with no specialization.";
  }
}

module.exports = { BaseAgent };
