/**
 * CodIn MAS — Agent Router
 *
 * Deterministic routing: maps task node's agentType to an active agent instance.
 * Manages the agent pool — spawns on demand, caps at maxAgents.
 */
"use strict";

const { AGENT_STATUS } = require("./types");
const { createAgent, AGENT_CLASS_MAP } = require("./agents");
const { UnknownAgentError, AgentPoolFullError } = require("./errors");
const { createLogger } = require("./logger");

const log = createLogger("AgentRouter");

class AgentRouter {
  /**
   * @param {object} opts
   * @param {number} [opts.maxAgents] — Max concurrent agents (default 10)
   * @param {object} deps — { permissionGate, memory, emitEvent, runLLM }
   */
  constructor(opts = {}, deps) {
    this._maxAgents = opts.maxAgents || 10;
    this._deps = deps;
    /** @type {Map<string, import("./agents/base-agent").BaseAgent>} agentId → agent */
    this._pool = new Map();
  }

  /**
   * Route a task node to an agent. Returns existing idle agent of matching type,
   * or spawns a new one if under the cap.
   *
   * @param {string} agentType — AGENT_TYPE value
   * @returns {import("./agents/base-agent").BaseAgent}
   */
  route(agentType) {
    // Validate type
    if (!AGENT_CLASS_MAP[agentType]) {
      throw new UnknownAgentError(agentType);
    }

    // Try to find an idle agent of this type
    for (const agent of this._pool.values()) {
      if (agent.type === agentType && agent.status === AGENT_STATUS.IDLE) {
        agent.activate();
        return agent;
      }
    }

    // Spawn new if under cap
    if (this._pool.size >= this._maxAgents) {
      // Evict a shutdown or errored agent to make room
      for (const [id, agent] of this._pool) {
        if (
          agent.status === AGENT_STATUS.SHUTDOWN ||
          agent.status === AGENT_STATUS.ERROR
        ) {
          this._pool.delete(id);
          break;
        }
      }
    }

    if (this._pool.size >= this._maxAgents) {
      throw new AgentPoolFullError(this._maxAgents, agentType);
    }

    const agent = createAgent(agentType, this._deps);
    this._pool.set(agent.id, agent);
    agent.activate();
    log.info("Agent spawned", {
      agentId: agent.id,
      type: agentType,
      poolSize: this._pool.size,
    });
    return agent;
  }

  /**
   * Return an agent to idle state after task completion.
   * @param {string} agentId
   */
  release(agentId) {
    const agent = this._pool.get(agentId);
    if (agent && agent.status === AGENT_STATUS.BUSY) {
      agent.deactivate();
    }
  }

  /**
   * Get all agents, optionally filtered.
   * @param {object} [filter]
   * @param {string} [filter.type]
   * @param {string} [filter.status]
   * @returns {object[]} Agent descriptors
   */
  list(filter = {}) {
    const result = [];
    for (const agent of this._pool.values()) {
      if (filter.type && agent.type !== filter.type) continue;
      if (filter.status && agent.status !== filter.status) continue;
      result.push(agent.descriptor);
    }
    return result;
  }

  /**
   * Get a specific agent by ID.
   * @param {string} agentId
   * @returns {import("./agents/base-agent").BaseAgent | null}
   */
  get(agentId) {
    return this._pool.get(agentId) || null;
  }

  /**
   * Get aggregated metrics for one or all agents.
   * @param {string} [agentId]
   * @returns {object}
   */
  metrics(agentId) {
    if (agentId) {
      const agent = this._pool.get(agentId);
      return agent ? agent.metrics : null;
    }
    const totals = {
      tasksCompleted: 0,
      toolCalls: 0,
      totalTimeMs: 0,
      totalCostUSD: 0,
    };
    for (const agent of this._pool.values()) {
      totals.tasksCompleted += agent.metrics.tasksCompleted;
      totals.toolCalls += agent.metrics.toolCalls;
      totals.totalTimeMs += agent.metrics.totalTimeMs;
      totals.totalCostUSD += agent.metrics.totalCostUSD;
    }
    totals.agentCount = this._pool.size;
    return totals;
  }

  /** Terminate all agents. */
  shutdown() {
    for (const agent of this._pool.values()) {
      agent.terminate();
    }
    this._pool.clear();
  }
}

module.exports = { AgentRouter };
