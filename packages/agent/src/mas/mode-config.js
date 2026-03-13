/**
 * CodIn MAS — Mode Configuration
 *
 * Maps each swarm mode to its agent set, topology, and model tier.
 * The SwarmManager reads this to configure task execution per mode.
 */
"use strict";

const { AGENT_TYPE, TOPOLOGY, PERMISSION_TYPE } = require("./types");

const MODE_CONFIGS = Object.freeze({
  ask: {
    mode: "ask",
    label: "Quick Assist",
    icon: "💬",
    description: "Single model, fast responses for quick questions",
    agents: [],
    topology: null,
    useSwarm: false,
    defaultModelTier: "fast",
    maxConcurrency: 1,
    maxBudgetUSD: 0.5,
    autoApprovePermissions: [PERMISSION_TYPE.FILE_READ],
  },

  build: {
    mode: "build",
    label: "Build",
    icon: "🏗️",
    description: "Multi-file feature generation with code, tests, and docs",
    agents: [
      AGENT_TYPE.PLANNER,
      AGENT_TYPE.CODER,
      AGENT_TYPE.TESTER,
      AGENT_TYPE.DOCS,
    ],
    topology: TOPOLOGY.HIERARCHICAL,
    useSwarm: true,
    defaultModelTier: "balanced",
    maxConcurrency: 4,
    maxBudgetUSD: 3.0,
    autoApprovePermissions: [
      PERMISSION_TYPE.FILE_READ,
      PERMISSION_TYPE.FILE_WRITE,
    ],
  },

  debug: {
    mode: "debug",
    label: "Debug",
    icon: "🔍",
    description: "Root cause analysis and targeted bug fixes",
    agents: [AGENT_TYPE.PLANNER, AGENT_TYPE.DEBUGGER, AGENT_TYPE.TESTER],
    topology: TOPOLOGY.STAR,
    useSwarm: true,
    defaultModelTier: "balanced",
    maxConcurrency: 3,
    maxBudgetUSD: 2.0,
    autoApprovePermissions: [
      PERMISSION_TYPE.FILE_READ,
      PERMISSION_TYPE.FILE_WRITE,
    ],
  },

  harden: {
    mode: "harden",
    label: "Harden",
    icon: "🛡️",
    description:
      "Security audit, performance review, and deployment validation",
    agents: [
      AGENT_TYPE.PLANNER,
      AGENT_TYPE.SECURITY,
      AGENT_TYPE.DEVOPS,
      AGENT_TYPE.REVIEWER,
    ],
    topology: TOPOLOGY.MESH,
    useSwarm: true,
    defaultModelTier: "premium",
    maxConcurrency: 4,
    maxBudgetUSD: 5.0,
    autoApprovePermissions: [
      PERMISSION_TYPE.FILE_READ,
      PERMISSION_TYPE.FILE_WRITE,
    ],
  },

  swarm: {
    mode: "swarm",
    label: "Swarm",
    icon: "🐝",
    description: "Full multi-agent collaboration — the commander decides",
    agents: [
      AGENT_TYPE.PLANNER,
      AGENT_TYPE.CODER,
      AGENT_TYPE.DEBUGGER,
      AGENT_TYPE.TESTER,
      AGENT_TYPE.REFACTORER,
      AGENT_TYPE.ARCHITECT,
      AGENT_TYPE.DEVOPS,
      AGENT_TYPE.SECURITY,
      AGENT_TYPE.DOCS,
      AGENT_TYPE.REVIEWER,
    ],
    topology: TOPOLOGY.HIERARCHICAL,
    useSwarm: true,
    defaultModelTier: "balanced",
    maxConcurrency: 6,
    maxBudgetUSD: 10.0,
    autoApprovePermissions: [
      PERMISSION_TYPE.FILE_READ,
      PERMISSION_TYPE.FILE_WRITE,
    ],
  },

  vibe: {
    mode: "vibe",
    label: "Vibe Builder",
    icon: "🎨",
    description: "Drop a screenshot or describe a UI — get working code",
    agents: [AGENT_TYPE.VIBE_BUILDER, AGENT_TYPE.CODER],
    topology: TOPOLOGY.STAR,
    useSwarm: true,
    defaultModelTier: "balanced",
    maxConcurrency: 2,
    maxBudgetUSD: 3.0,
    autoApprovePermissions: [
      PERMISSION_TYPE.FILE_READ,
      PERMISSION_TYPE.FILE_WRITE,
    ],
  },
});

/**
 * Model tier assignments per agent type.
 * Used by the model router to pick the right provider.
 *
 * - "fast": Local model (Ollama/LM Studio) — cheap, fast, offline
 * - "balanced": DeepSeek Coder / Qwen Coder — good quality/cost ratio
 * - "premium": GPT-4o / Claude — best reasoning, highest cost
 */
const AGENT_MODEL_TIERS = Object.freeze({
  [AGENT_TYPE.PLANNER]: "premium",
  [AGENT_TYPE.CODER]: "balanced",
  [AGENT_TYPE.DEBUGGER]: "balanced",
  [AGENT_TYPE.TESTER]: "balanced",
  [AGENT_TYPE.SECURITY]: "premium",
  [AGENT_TYPE.REFACTORER]: "balanced",
  [AGENT_TYPE.ARCHITECT]: "premium",
  [AGENT_TYPE.DEVOPS]: "balanced",
  [AGENT_TYPE.DOCS]: "fast",
  [AGENT_TYPE.REVIEWER]: "premium",
  [AGENT_TYPE.I18N]: "balanced",
  [AGENT_TYPE.VIBE_BUILDER]: "fast",
});

function getModeConfig(mode) {
  return MODE_CONFIGS[mode] || MODE_CONFIGS.ask;
}

function getAllModeConfigs() {
  return Object.values(MODE_CONFIGS);
}

function requiresSwarm(mode) {
  const config = getModeConfig(mode);
  return config.useSwarm;
}

function getAgentModelTier(agentType) {
  return AGENT_MODEL_TIERS[agentType] || "balanced";
}

function isModeAutoApproved(mode, permissionType) {
  if (permissionType === PERMISSION_TYPE.COMMAND_RUN) return false;
  const config = getModeConfig(mode);
  if (!config.autoApprovePermissions) return false;
  return config.autoApprovePermissions.includes(permissionType);
}

module.exports = {
  MODE_CONFIGS,
  getModeConfig,
  getAllModeConfigs,
  requiresSwarm,
  isModeAutoApproved,
  AGENT_MODEL_TIERS,
  getAgentModelTier,
};
