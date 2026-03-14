"use strict";

/**
 * CodeIn AI Hub — HTTP Routes
 *
 * REST API endpoints for multi-provider AI API management.
 *
 * Endpoints:
 *   GET    /ai-hub/providers             — List all providers with status
 *   GET    /ai-hub/providers/:id         — Get single provider status
 *   POST   /ai-hub/providers/:id/key     — Set API key
 *   DELETE /ai-hub/providers/:id/key     — Remove API key
 *   POST   /ai-hub/providers/:id/test    — Test provider connection
 *   GET    /ai-hub/providers/:id/models  — Fetch models for provider
 *   POST   /ai-hub/providers/:id/enable  — Enable provider
 *   POST   /ai-hub/providers/:id/disable — Disable provider
 *   GET    /ai-hub/models               — All models across enabled providers
 */

const {
  readBody,
  parseJsonBody,
  jsonResponse,
} = require("../utils/http-helpers");
const { AIHubManager } = require("../ai-hub/hub-manager");
const { PROVIDERS } = require("../ai-hub/provider-registry");

// Environment-based dev bypass — never from runtime deps object
const DEV_BYPASS = process.env.CODIN_DEV_BYPASS === "true";
if (DEV_BYPASS) {
  console.warn(
    "[SECURITY] Permission bypass enabled via CODIN_DEV_BYPASS — do NOT use in production",
  );
}

function sendJson(res, status, body) {
  res.setHeader("X-AIHub-API-Version", "1");
  jsonResponse(res, status, body);
}

/**
 * Fail-closed permission check — mirrors swarm.js ensureSwarmPermission.
 */
async function ensureHubPermission(req, res, deps, operation, context = {}) {
  if (DEV_BYPASS) {
    return true;
  }
  if (typeof deps.requirePermission !== "function") {
    sendJson(res, 503, {
      error: "Permission system unavailable",
      reason:
        "requirePermission is not configured \u2014 all mutating operations are denied",
    });
    return false;
  }
  const decision = await deps.requirePermission(
    "aiHubOperation",
    { user: req.user, operation, ...context },
    deps.permissionManager,
  );
  if (!decision?.allowed) {
    sendJson(res, 403, {
      error: `Permission denied for ${operation}`,
      reason: decision?.reason || "Unauthorized",
    });
    return false;
  }
  return true;
}

/**
 * Validate that a provider ID is known.
 */
function validateProviderId(id, res) {
  if (!PROVIDERS[id]) {
    sendJson(res, 404, {
      error: `Unknown provider: ${id}`,
      knownProviders: Object.keys(PROVIDERS),
    });
    return false;
  }
  return true;
}

function registerAIHubRoutes(router, deps) {
  const { logger } = deps;

  // Create the hub manager and auto-initialize from env vars
  const hubManager = new AIHubManager();
  hubManager.initFromEnv();

  // Store on deps so other systems can access it
  deps.aiHubManager = hubManager;

  // ─── Rate limiting for test endpoint ──────────────────────────
  // Simple in-memory counter: max 10 test requests per minute per provider
  const testRateLimit = new Map(); // providerId -> { count, resetAt }

  function checkTestRateLimit(providerId) {
    const now = Date.now();
    let entry = testRateLimit.get(providerId);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + 60000 };
      testRateLimit.set(providerId, entry);
    }

    entry.count++;
    return entry.count <= 10;
  }

  // ─── GET /ai-hub/providers ──────────────────────────────────────
  router.get("/ai-hub/providers", (_req, res) => {
    try {
      const providers = hubManager.listProviders();
      sendJson(res, 200, { providers });
    } catch (err) {
      if (logger) logger.error({ error: err.message }, "ai-hub.listProviders");
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /ai-hub/providers/:id ──────────────────────────────────
  router.get("/ai-hub/providers/:id", (req, res, ctx) => {
    try {
      if (!validateProviderId(ctx.id, res)) return;
      const provider = hubManager.getProviderStatus(ctx.id);
      if (!provider) return sendJson(res, 404, { error: "Provider not found" });
      sendJson(res, 200, { provider });
    } catch (err) {
      if (logger) logger.error({ error: err.message }, "ai-hub.getProvider");
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /ai-hub/providers/:id/key ─────────────────────────────
  router.post("/ai-hub/providers/:id/key", async (req, res, ctx) => {
    try {
      if (!(await ensureHubPermission(req, res, deps, "setKey"))) return;
      if (!validateProviderId(ctx.id, res)) return;

      const raw = await readBody(req, 64 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { key } = parsed.value;
      if (!key || typeof key !== "string" || key.trim().length === 0) {
        return sendJson(res, 400, {
          error: "'key' is required and must be a non-empty string",
        });
      }

      // Max key length sanity check
      if (key.length > 500) {
        return sendJson(res, 400, {
          error: "API key is too long (max 500 characters)",
        });
      }

      await hubManager.setProviderKey(ctx.id, key);
      sendJson(res, 200, {
        success: true,
        provider: ctx.id,
        keyHint: hubManager._registry.getKeyHint(ctx.id),
      });
    } catch (err) {
      if (logger) logger.error({ error: err.message }, "ai-hub.setKey");
      sendJson(res, 400, { error: err.message });
    }
  });

  // ─── DELETE /ai-hub/providers/:id/key ───────────────────────────
  router.del("/ai-hub/providers/:id/key", async (req, res, ctx) => {
    try {
      if (!(await ensureHubPermission(req, res, deps, "removeKey"))) return;
      if (!validateProviderId(ctx.id, res)) return;

      const result = hubManager.removeProviderKey(ctx.id);
      sendJson(res, 200, result);
    } catch (err) {
      if (logger) logger.error({ error: err.message }, "ai-hub.removeKey");
      sendJson(res, 400, { error: err.message });
    }
  });

  // ─── POST /ai-hub/providers/:id/test ────────────────────────────
  router.post("/ai-hub/providers/:id/test", async (req, res, ctx) => {
    try {
      if (!(await ensureHubPermission(req, res, deps, "testProvider"))) return;
      if (!validateProviderId(ctx.id, res)) return;

      // Rate limit
      if (!checkTestRateLimit(ctx.id)) {
        return sendJson(res, 429, {
          error: "Rate limited: max 10 test requests per minute per provider",
        });
      }

      const result = await hubManager.testProvider(ctx.id);
      sendJson(res, 200, result);
    } catch (err) {
      if (logger) logger.error({ error: err.message }, "ai-hub.testProvider");
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /ai-hub/providers/:id/models ───────────────────────────
  router.get("/ai-hub/providers/:id/models", async (req, res, ctx) => {
    try {
      if (!validateProviderId(ctx.id, res)) return;

      const result = await hubManager.fetchModels(ctx.id);

      if (result && result.error === true) {
        return sendJson(res, 502, result);
      }

      sendJson(res, 200, {
        provider: ctx.id,
        models: Array.isArray(result) ? result : [],
        count: Array.isArray(result) ? result.length : 0,
      });
    } catch (err) {
      if (logger) logger.error({ error: err.message }, "ai-hub.fetchModels");
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /ai-hub/providers/:id/enable ──────────────────────────
  router.post("/ai-hub/providers/:id/enable", async (req, res, ctx) => {
    try {
      if (!(await ensureHubPermission(req, res, deps, "enableProvider")))
        return;
      if (!validateProviderId(ctx.id, res)) return;

      const result = hubManager.enableProvider(ctx.id);
      sendJson(res, 200, result);
    } catch (err) {
      if (logger) logger.error({ error: err.message }, "ai-hub.enableProvider");
      sendJson(res, 400, { error: err.message });
    }
  });

  // ─── POST /ai-hub/providers/:id/disable ─────────────────────────
  router.post("/ai-hub/providers/:id/disable", async (req, res, ctx) => {
    try {
      if (!(await ensureHubPermission(req, res, deps, "disableProvider")))
        return;
      if (!validateProviderId(ctx.id, res)) return;

      const result = hubManager.disableProvider(ctx.id);
      sendJson(res, 200, result);
    } catch (err) {
      if (logger)
        logger.error({ error: err.message }, "ai-hub.disableProvider");
      sendJson(res, 400, { error: err.message });
    }
  });

  // ─── GET /ai-hub/models ────────────────────────────────────────
  router.get("/ai-hub/models", (_req, res) => {
    try {
      const models = hubManager.getAllModels();
      sendJson(res, 200, { models, count: models.length });
    } catch (err) {
      if (logger) logger.error({ error: err.message }, "ai-hub.getAllModels");
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerAIHubRoutes };
