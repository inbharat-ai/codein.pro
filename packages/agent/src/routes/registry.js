/**
 * Route registry — registers all domain route modules onto a MicroRouter.
 * Each module receives its dependencies via injection.
 */
const { MicroRouter } = require("./micro-router");
const { registerAuthRoutes } = require("./auth");
const { registerModelRoutes } = require("./models");
const { registerRuntimeRoutes } = require("./runtime");
const { registerI18nRoutes } = require("./i18n");
const { registerResearchRoutes } = require("./research");
const { registerMcpRoutes } = require("./mcp");
const { registerAgentTaskRoutes } = require("./agent-tasks");
const { registerRunRoutes } = require("./run");
const { registerPermissionRoutes } = require("./permissions");
const { registerPerformanceRoutes } = require("./performance");
const { registerExternalProviderRoutes } = require("./external-providers");
const { registerIntelligenceRoutes } = require("./intelligence");
const { registerComputeRoutes } = require("./compute");

/**
 * Creates and configures the full application router.
 *
 * @param {Object} deps - Shared dependencies to inject into route modules
 * @returns {MicroRouter}
 */
function createAppRouter(deps) {
  const router = new MicroRouter();

  // Core auth (login/refresh are public, logout requires auth)
  registerAuthRoutes(router, deps);

  // Model management (store-based GGUF management)
  registerModelRoutes(router, deps);

  // Local model runtime + inference + intelligent router
  registerRuntimeRoutes(router, deps);

  // I18N — translate, detect, STT, TTS, legacy compat endpoints
  registerI18nRoutes(router, deps);

  // Web research (Serper, docs, examples, bug solutions)
  registerResearchRoutes(router, deps);

  // MCP servers / tools
  registerMcpRoutes(router, deps);

  // Agent tasks & activity feed
  registerAgentTaskRoutes(router, deps);

  // Run / preview processes
  registerRunRoutes(router, deps);

  // Permission management
  registerPermissionRoutes(router, deps);

  // Performance monitoring (cache stats, HTTP pool, memory)
  registerPerformanceRoutes(router, deps);

  // External API providers (OpenAI, Anthropic, Gemini)
  registerExternalProviderRoutes(router, deps);

  // Hybrid Intelligence pipeline (classify, verify, escalate, budget)
  registerIntelligenceRoutes(router, deps);

  // CodeIn Compute — agentic job runner (plan → execute → artifacts)
  registerComputeRoutes(router, deps);

  return router;
}

module.exports = { createAppRouter, MicroRouter };
