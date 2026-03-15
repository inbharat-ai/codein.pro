/**
 * Optional subsystem loader — loads each subsystem inside a try/catch
 * so the server can start even if some modules are missing.
 * Extracted from index.js.
 */
"use strict";

const { logger } = require("./logger");

/**
 * Load all optional subsystems. Returns a dict of nullable references.
 * @param {object} [opts] - Options forwarded to subsystems that need them.
 * @param {object} [opts.modelRouter] - Model router instance (for intelligence orchestrator).
 * @param {object} [opts.modelRuntime] - Model runtime instance (for intelligence orchestrator).
 * @param {object} [opts.externalProviders] - External providers (for intelligence orchestrator).
 * @returns {object} Dict with nullable subsystem references.
 */
function loadSubsystems(opts = {}) {
  let modelRuntime = null;
  let modelRouter = null;
  let i18nOrchestrator = null;
  let ai4bharatProvider = null;
  let mcpClientManager = null;
  let projectDetector = null;
  let processManager = null;
  let permissionManager = null;
  let externalProviders = null;
  let intelligence = null;

  try {
    ({ modelRuntime } = require("./model-runtime/index.js"));
  } catch (err) {
    logger.warn({ error: err.message }, "Model runtime failed to load");
  }

  try {
    ({ modelRouter } = require("./model-runtime/router.js"));
  } catch (err) {
    logger.warn({ error: err.message }, "Model router failed to load");
  }

  try {
    ({ i18nOrchestrator } = require("./i18n/orchestrator.js"));
  } catch (err) {
    logger.warn({ error: err.message }, "i18n orchestrator failed to load");
  }

  try {
    ({ ai4bharatProvider } = require("./i18n/ai4bharat-provider.js"));
  } catch (err) {
    logger.warn({ error: err.message }, "AI4Bharat provider failed to load");
  }

  try {
    ({ mcpClientManager } = require("./mcp/client-manager.js"));
  } catch (err) {
    logger.warn({ error: err.message }, "MCP client manager failed to load");
  }

  try {
    ({ projectDetector } = require("./run/project-detector.js"));
  } catch (err) {
    logger.warn({ error: err.message }, "Project detector failed to load");
  }

  try {
    ({ processManager } = require("./run/process-manager.js"));
  } catch (err) {
    logger.warn({ error: err.message }, "Process manager failed to load");
  }

  // Permission manager is in shared package
  try {
    ({ permissionManager } = require("codin-shared/permissions/manager"));
  } catch (err) {
    logger.warn({ error: err.message }, "Permission manager failed to load");
  }

  // External API provider manager (GPT-4, Claude, Gemini)
  try {
    ({ externalProviders } = require("./model-runtime/external-providers.js"));
  } catch (err) {
    logger.warn({ error: err.message }, "External providers failed to load");
  }

  // Hybrid Intelligence Orchestrator (classify -> verify -> escalate -> confidence)
  try {
    const {
      HybridIntelligenceOrchestrator,
    } = require("./intelligence/hybrid-orchestrator");
    intelligence = new HybridIntelligenceOrchestrator({
      modelRouter,
      externalProviders,
      modelRuntime,
      autoEscalate: true,
    });
    logger.info("Hybrid Intelligence Orchestrator initialized");
  } catch (err) {
    logger.warn(
      { error: err.message },
      "Intelligence orchestrator failed to load",
    );
  }

  return {
    modelRuntime,
    modelRouter,
    i18nOrchestrator,
    ai4bharatProvider,
    mcpClientManager,
    projectDetector,
    processManager,
    permissionManager,
    externalProviders,
    intelligence,
  };
}

module.exports = { loadSubsystems };
