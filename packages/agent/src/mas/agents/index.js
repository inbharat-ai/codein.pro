/**
 * CodIn MAS — Agent Registry
 *
 * Re-exports all agent classes and provides a factory.
 */
"use strict";

const { AGENT_TYPE } = require("../types");
const { getAgentModelTier } = require("../mode-config");
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
const { I18nAgent } = require("./i18n-agent");
const { VibeBuilderAgent } = require("./vibe-builder-agent");

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
  [AGENT_TYPE.I18N]: I18nAgent,
  [AGENT_TYPE.VIBE_BUILDER]: VibeBuilderAgent,
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
  const agent = new AgentClass(deps);
  // Inject per-agent model tier so each agent type gets appropriate model quality
  agent.descriptor.modelHint = getAgentModelTier(type);
  return agent;
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
  I18nAgent,
  VibeBuilderAgent,
  AGENT_CLASS_MAP,
  createAgent,
};
