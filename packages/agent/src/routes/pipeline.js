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

function registerPipelineRoutes(router, deps) {
  // Initialize autonomous coding pipeline
  const pipeline = new AutonomousCodingPipeline({
    swarmManager: deps.swarmManager,
    computeSelector: deps.computeSelector,
    sessionManager: deps.sessionManager,
  });

  deps.autonomousPipeline = pipeline;

  // ─── POST /pipeline/create ─────────────────────────────────
  router.post("/pipeline/create", async (req, res) => {
    try {
      const raw = await readBody(req);
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

      // Execute pipeline asynchronously
      const pipelinePromise = pipeline.execute({
        goal,
        language,
        framework,
        constraints,
        sessionId,
      });

      // Return immediately with pipeline ID
      const status = pipeline.listPipelines().slice(-1)[0];

      sendJson(res, 202, {
        message: "Pipeline started",
        pipelineId: status.id,
        status: status.status,
      });

      // Let pipeline run in background
      pipelinePromise.catch((err) => {
        console.error("Pipeline failed:", err);
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /pipeline/:pipelineId ─────────────────────────────
  router.get("/pipeline/:pipelineId", (req, res, ctx) => {
    try {
      const status = pipeline.getStatus(ctx.pipelineId);
      if (!status) {
        return sendJson(res, 404, { error: "Pipeline not found" });
      }

      sendJson(res, 200, { pipeline: status });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /pipeline/:pipelineId/artifacts ───────────────────
  router.get("/pipeline/:pipelineId/artifacts", (req, res, ctx) => {
    try {
      const status = pipeline.getStatus(ctx.pipelineId);
      if (!status) {
        return sendJson(res, 404, { error: "Pipeline not found" });
      }

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

      const pipelines = pipeline.listPipelines({ status, sessionId });

      sendJson(res, 200, {
        pipelines,
        count: pipelines.length,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── DELETE /pipeline/:pipelineId ──────────────────────────
  router.delete("/pipeline/:pipelineId", (req, res, ctx) => {
    try {
      const status = pipeline.getStatus(ctx.pipelineId);
      if (!status) {
        return sendJson(res, 404, { error: "Pipeline not found" });
      }

      // Mark as cancelled
      status.status = "cancelled";
      status.endTime = Date.now();

      sendJson(res, 200, { message: "Pipeline cancelled" });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerPipelineRoutes };
