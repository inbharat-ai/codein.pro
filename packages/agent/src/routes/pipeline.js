/**
 * Autonomous Coding Pipeline HTTP Routes
 *
 * REST API endpoints for autonomous software creation
 *
 * Endpoints:
 *   POST /pipeline/create       — Start autonomous coding pipeline
 *   GET  /pipeline/:id          — Get pipeline status
 *   GET  /pipeline/:id/artifacts — Get pipeline artifacts
 *   GET  /pipeline              — List all pipelines
 *   DELETE /pipeline/:id        — Cancel pipeline
 */
"use strict";

const { AutonomousCodingPipeline } = require("../pipeline/autonomous-coding");
const {
  readBody,
  parseJsonBody,
  jsonResponse,
} = require("../utils/http-helpers");

function sendJson(res, status, body) {
  jsonResponse(res, status, body);
}

async function ensurePipelinePermission(
  req,
  res,
  deps,
  operation,
  context = {},
) {
  if (typeof deps.requirePermission !== "function") {
    return true;
  }
  const decision = await deps.requirePermission(
    "pipelineOperation",
    {
      user: req.user,
      operation,
      ...context,
    },
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

function ensurePipelineOwnership(req, res, pipeline, pipelineId) {
  if (!pipeline) {
    sendJson(res, 404, { error: "Pipeline not found" });
    return false;
  }
  const requester = req.user?.userId || "local";
  if (requester === "local") {
    return true;
  }
  if (pipeline.ownerUserId && pipeline.ownerUserId !== requester) {
    sendJson(res, 403, {
      error: `Forbidden: pipeline ${pipelineId} belongs to another user`,
    });
    return false;
  }
  return true;
}

function registerPipelineRoutes(router, deps) {
  // Initialize autonomous coding pipeline with repo intelligence (if available)
  const pipeline = new AutonomousCodingPipeline({
    swarmManager: deps.swarmManager,
    computeSelector: deps.computeSelector,
    sessionManager: deps.sessionManager,
    i18nOrchestrator: deps.i18nOrchestrator,
    repoIndex: deps.repoIndex || null,
    validationPipeline: deps.validationPipeline || null,
    refactorPlanner: deps.refactorPlanner || null,
    refactorExecutor: deps.refactorExecutor || null,
  });

  deps.autonomousPipeline = pipeline;

  // ─── POST /pipeline/create ─────────────────────────────────
  router.post("/pipeline/create", async (req, res) => {
    try {
      if (!(await ensurePipelinePermission(req, res, deps, "create"))) return;
      const raw = await readBody(req, 1024 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) {
        return sendJson(res, 400, { error: parsed.error });
      }

      const { goal, language, framework, constraints, sessionId } =
        parsed.value;

      if (!goal || typeof goal !== "string") {
        return sendJson(res, 400, {
          error: "Field 'goal' is required and must be a string",
        });
      }

      const pipelineId = pipeline.createPipelineId();

      // Execute pipeline asynchronously
      const pipelinePromise = pipeline.execute({
        pipelineId,
        goal,
        language,
        framework,
        constraints,
        sessionId,
        ownerUserId: req.user?.userId || "local",
      });

      sendJson(res, 202, {
        message: "Pipeline started",
        pipelineId,
        status: "running",
      });

      // Let pipeline run in background
      pipelinePromise.catch((err) => {
        (deps.logger || console).error("Pipeline failed:", err);
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /pipeline/:pipelineId ─────────────────────────────
  router.get("/pipeline/:pipelineId", (req, res, ctx) => {
    try {
      const status = pipeline.getStatus(ctx.pipelineId);
      if (!ensurePipelineOwnership(req, res, status, ctx.pipelineId)) return;

      sendJson(res, 200, { pipeline: status });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /pipeline/:pipelineId/artifacts ───────────────────
  router.get("/pipeline/:pipelineId/artifacts", (req, res, ctx) => {
    try {
      const status = pipeline.getStatus(ctx.pipelineId);
      if (!ensurePipelineOwnership(req, res, status, ctx.pipelineId)) return;

      sendJson(res, 200, { artifacts: status.artifacts || {} });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /pipeline ─────────────────────────────────────────
  router.get("/pipeline", (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const status = url.searchParams.get("status");
      const sessionId = url.searchParams.get("sessionId");
      const requester = req.user?.userId || "local";

      const pipelines = pipeline
        .listPipelines({ status, sessionId })
        .filter(
          (p) =>
            !p.ownerUserId ||
            p.ownerUserId === requester ||
            requester === "local",
        );

      sendJson(res, 200, {
        pipelines,
        count: pipelines.length,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── DELETE /pipeline/:pipelineId ──────────────────────────
  router.del("/pipeline/:pipelineId", (req, res, ctx) => {
    try {
      const status = pipeline.getStatus(ctx.pipelineId);
      if (!ensurePipelineOwnership(req, res, status, ctx.pipelineId)) return;

      const result = pipeline.cancelPipeline(
        ctx.pipelineId,
        "Cancelled via API",
      );
      if (!result.success) {
        return sendJson(res, 404, {
          error: result.error || "Pipeline not found",
        });
      }

      sendJson(res, 200, {
        message: "Pipeline cancellation requested",
        cancelledTaskIds: result.cancelledTaskIds || [],
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerPipelineRoutes };
