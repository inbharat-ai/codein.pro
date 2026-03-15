/**
 * CodeIn MAS — SwarmManager
 *
 * Top-level orchestrator for the Multi-Agent Swarm system.
 * Implements the 11 core API methods:
 *   swarmInit, agentSpawn, agentList, swarmStatus, agentMetrics,
 *   taskOrchestrate, taskStatus, taskResults, taskCancel, memoryUsage, swarmShutdown
 *
 * Coordinates: topology → planner → agent routing → execution → merge.
 * Streams events via SSE.
 *
 * This file is a thin facade that composes three focused modules:
 *   - swarm-lifecycle.js  — init, shutdown, status, configuration, health checks
 *   - swarm-execution.js  — task orchestration, topology execution, agent coordination
 *   - swarm-monitoring.js — metrics, analytics, event logging, budget tracking
 */
"use strict";

const { EventEmitter } = require("node:events");

const {
  SWARM_STATE,
  initFields,
  applyLifecycleMethods,
} = require("./swarm-lifecycle");
const { applyExecutionMethods } = require("./swarm-execution");
const { applyMonitoringMethods } = require("./swarm-monitoring");
const { applyExtensionMethods } = require("./swarm-extensions");

class SwarmManager extends EventEmitter {
  /**
   * @param {object} deps
   * @param {function} deps.runLLM — (systemPrompt, userPrompt, opts) => Promise<string>
   * @param {object} [deps.mcpClientManager]
   */
  constructor(deps = {}) {
    super();
    initFields(this, deps);
  }
}

// Attach all method groups to the prototype
applyLifecycleMethods(SwarmManager);
applyExecutionMethods(SwarmManager);
applyMonitoringMethods(SwarmManager);

// Attach delegation APIs (terminal, git, planner, docker, sqlite, plugins, smart-apply)
applyExtensionMethods(SwarmManager);

module.exports = { SwarmManager, SWARM_STATE };
