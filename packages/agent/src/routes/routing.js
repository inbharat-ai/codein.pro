/**
 * Intelligent Routing — HTTP Routes
 *
 * REST API endpoints for the compute routing system.
 *
 * Endpoints:
 *   POST   /routing/select    — Select optimal compute target for task
 *   POST   /routing/execute   — Select and execute task
 *   GET    /routing/usage     — Get resource usage statistics
 *   POST   /routing/reset     — Reset usage counters
 */
"use strict";

const { ComputeSelector } = require("../routing/compute-selector");
const {
  readBody,
  parseJsonBody,
  jsonResponse,
} = require("../utils/http-helpers");

function sendJson(res, status, body) {
  jsonResponse(res, status, body);
}

function registerRoutingRoutes(router, deps) {
  // Initialize compute selector
  const selector = new ComputeSelector({
    complexityClassifier: deps.intelligence?.classifier,
    swarmManager: deps.swarmManager,
    gpuProvider: deps.gpuProvider,
    modelRuntime: deps.modelRuntime,
    costLimits: deps.config?.computeCostLimits,
  });

  // Store in deps for other routes
  deps.computeSelector = selector;

  // ─── POST /routing/select ──────────────────────────────────
  router.post("/routing/select", async (req, res) => {
    try {
      const raw = await readBody(req);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) {
        return sendJson(res, 400, { error: parsed.error });
      }

      const { prompt, category, context, preference } = parsed.value;

      if (!prompt || typeof prompt !== "string") {
        return sendJson(res, 400, {
          error: "Field 'prompt' is required and must be a string",
        });
      }

      const selection = selector.selectCompute({
        prompt,
        category,
        context,
        preference,
      });

      sendJson(res, 200, { selection });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /routing/execute ─────────────────────────────────
  router.post("/routing/execute", async (req, res) => {
    try {
      const raw = await readBody(req);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) {
        return sendJson(res, 400, { error: parsed.error });
      }

      const { prompt, category, context, preference } = parsed.value;

      if (!prompt || typeof prompt !== "string") {
        return sendJson(res, 400, {
          error: "Field 'prompt' is required and must be a string",
        });
      }

      // Select compute target
      const selection = selector.selectCompute({
        prompt,
        category,
        context,
        preference,
      });

      // Execute on selected target
      const result = await selector.execute(selection.target, {
        prompt,
        category,
        context,
        ...parsed.value,
      });

      sendJson(res, 200, {
        selection,
        result,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /routing/usage ────────────────────────────────────
  router.get("/routing/usage", (_req, res) => {
    try {
      const usage = selector.getUsage();
      sendJson(res, 200, { usage });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /routing/reset ───────────────────────────────────
  router.post("/routing/reset", (_req, res) => {
    try {
      selector.resetUsage();
      sendJson(res, 200, { message: "Usage statistics reset" });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerRoutingRoutes };
