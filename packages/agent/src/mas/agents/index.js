/**
 * CodIn MAS — Agent Registry
 *
 * Re-exports all agent classes and provides a factory.
 */
"use strict";

const { AGENT_TYPE } = require("../types");
const { BaseAgent } = require("./base-agent");
const { PlannerAgent } = require("./planner-agent");
const { CoderAgent } = require("./coder-agent");
const { DebuggerAgent } = require("./debugger-agent");
const { TesterAgent } = require("./tester-agent");
const { RefactorerAgent } = require("./refactorer-agent");
const { ArchitectAgent } = require("./architect-agent");
const { DevOpsAgent } = require("./devops-agent");
const { SecurityAgent } = require("./security-agent");
const { DocsAgent } = require("./docs-agent");
const { ReviewerAgent } = require("./reviewer-agent");

const AGENT_CLASS_MAP = Object.freeze({
  [AGENT_TYPE.PLANNER]: PlannerAgent,
  [AGENT_TYPE.CODER]: CoderAgent,
  [AGENT_TYPE.DEBUGGER]: DebuggerAgent,
  [AGENT_TYPE.TESTER]: TesterAgent,
  [AGENT_TYPE.REFACTORER]: RefactorerAgent,
  [AGENT_TYPE.ARCHITECT]: ArchitectAgent,
  [AGENT_TYPE.DEVOPS]: DevOpsAgent,
  [AGENT_TYPE.SECURITY]: SecurityAgent,
  [AGENT_TYPE.DOCS]: DocsAgent,
  [AGENT_TYPE.REVIEWER]: ReviewerAgent,
});

/**
 * Create an agent instance by type.
 * @param {string} type — AGENT_TYPE value
 * @param {object} deps — { permissionGate, memory, emitEvent, runLLM }
 * @returns {BaseAgent}
 */
function createAgent(type, deps) {
  const AgentClass = AGENT_CLASS_MAP[type];
  if (!AgentClass) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return new AgentClass(deps);
}

module.exports = {
  BaseAgent,
  PlannerAgent,
  CoderAgent,
  DebuggerAgent,
  TesterAgent,
  RefactorerAgent,
  ArchitectAgent,
  DevOpsAgent,
  SecurityAgent,
  DocsAgent,
  ReviewerAgent,
  AGENT_CLASS_MAP,
  createAgent,
};
