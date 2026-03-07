/**
 * CodeIn Compute — HTTP Routes
 *
 * REST API endpoints for the compute module.
 * Registered via the route registry alongside existing routes.
 *
 * Endpoints:
 *   POST   /compute/jobs              — Submit a new job
 *   GET    /compute/jobs              — List jobs
 *   GET    /compute/jobs/:jobId       — Get job details
 *   DELETE /compute/jobs/:jobId       — Delete a job
 *   POST   /compute/jobs/:jobId/cancel — Cancel a job
 *   POST   /compute/jobs/:jobId/pause  — Pause a job
 *   POST   /compute/jobs/:jobId/resume — Resume a job
 *   GET    /compute/jobs/:jobId/events — SSE event stream
 *   GET    /compute/jobs/:jobId/artifacts — List artifacts
 *   GET    /compute/jobs/:jobId/artifacts/:artifactId — Read artifact
 *   GET    /compute/stats             — Compute statistics
 *   GET    /compute/languages         — Supported languages
 *   POST   /compute/workflows/:name   — Run a demo workflow
 */
"use strict";

const { ComputeOrchestrator } = require("../compute/orchestrator");
const { WORKFLOWS } = require("../compute/workflows");
const { readBody, parseJsonBody } = require("../utils/http-helpers");

function registerComputeRoutes(router, deps) {
  // Initialize orchestrator with injected dependencies
  const orchestrator = new ComputeOrchestrator({
    modelRuntime: deps.modelRuntime,
    modelRouter: deps.modelRouter,
    externalProviders: deps.externalProviders,
    i18nOrchestrator: deps.i18nOrchestrator,
    languageDetector: deps.languageDetector,
    termPreservator: deps.termPreservator,
    mcpClientManager: deps.mcpClientManager,
  });

  // Store orchestrator in deps for other routes to reference
  deps.computeOrchestrator = orchestrator;

  // ─── Submit a new job ──────────────────────────────────────
  router.post("/compute/jobs", async (req, res) => {
    try {
      const raw = await readBody(req);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) {
        return sendJson(res, 400, { error: parsed.error });
      }

      const { goal, language, audioPath, policy, context } = parsed.value;

      if (!goal || typeof goal !== "string") {
        return sendJson(res, 400, {
          error: "Field 'goal' is required and must be a string",
        });
      }

      const job = await orchestrator.submitJob({
        goal,
        userId: req.user?.userId || "local",
        language,
        audioPath,
        policy,
        context,
      });

      sendJson(res, 201, { job });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── List jobs ─────────────────────────────────────────────
  router.get("/compute/jobs", (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const filters = {};
      if (url.searchParams.get("status"))
        filters.status = url.searchParams.get("status");
      if (url.searchParams.get("limit"))
        filters.limit = parseInt(url.searchParams.get("limit"), 10);
      if (url.searchParams.get("offset"))
        filters.offset = parseInt(url.searchParams.get("offset"), 10);
      filters.userId = req.user?.userId || "local";

      const result = orchestrator.listJobs(filters);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── Get job details ───────────────────────────────────────
  router.get("/compute/jobs/:jobId", (req, res, ctx) => {
    try {
      const job = orchestrator.getJob(ctx.jobId);
      if (!job) {
        return sendJson(res, 404, { error: "Job not found" });
      }
      sendJson(res, 200, { job });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── Delete a job ──────────────────────────────────────────
  router.del("/compute/jobs/:jobId", (req, res, ctx) => {
    try {
      const deleted = orchestrator.deleteJob(ctx.jobId);
      sendJson(res, deleted ? 200 : 404, { deleted });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── Cancel a job ──────────────────────────────────────────
  router.post("/compute/jobs/:jobId/cancel", (req, res, ctx) => {
    try {
      const job = orchestrator.cancelJob(ctx.jobId);
      sendJson(res, 200, { job });
    } catch (err) {
      sendJson(res, err.message.includes("not found") ? 404 : 500, {
        error: err.message,
      });
    }
  });

  // ─── Pause a job ───────────────────────────────────────────
  router.post("/compute/jobs/:jobId/pause", (req, res, ctx) => {
    try {
      const paused = orchestrator.pauseJob(ctx.jobId);
      sendJson(res, 200, { paused });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── Resume a job ──────────────────────────────────────────
  router.post("/compute/jobs/:jobId/resume", (req, res, ctx) => {
    try {
      const resumed = orchestrator.resumeJob(ctx.jobId);
      sendJson(res, 200, { resumed });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── SSE Event Stream ─────────────────────────────────────
  router.get("/compute/jobs/:jobId/events", (req, res, ctx) => {
    try {
      const job = orchestrator.getJob(ctx.jobId);
      if (!job) {
        return sendJson(res, 404, { error: "Job not found" });
      }
      orchestrator.subscribeToEvents(ctx.jobId, res, req);
      // Don't send JSON — SSE headers are set by subscribeToEvents
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── List artifacts ────────────────────────────────────────
  router.get("/compute/jobs/:jobId/artifacts", (req, res, ctx) => {
    try {
      const job = orchestrator.getJob(ctx.jobId);
      if (!job) {
        return sendJson(res, 404, { error: "Job not found" });
      }
      const artifacts = orchestrator.getJobArtifacts(ctx.jobId);
      sendJson(res, 200, { artifacts });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── Read a specific artifact ──────────────────────────────
  router.get("/compute/jobs/:jobId/artifacts/:artifactId", (req, res, ctx) => {
    try {
      const result = orchestrator.readArtifact(ctx.jobId, ctx.artifactId);
      if (!result) {
        return sendJson(res, 404, { error: "Artifact not found" });
      }
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── Statistics ────────────────────────────────────────────
  router.get("/compute/stats", (req, res) => {
    try {
      const stats = orchestrator.getStats();
      sendJson(res, 200, { stats });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── Supported languages ──────────────────────────────────
  router.get("/compute/languages", (req, res) => {
    const languages = orchestrator.multilingual.getSupportedLanguages();
    const capabilities = orchestrator.multilingual.getCapabilities();
    sendJson(res, 200, { languages, capabilities });
  });

  // ─── Demo workflows ───────────────────────────────────────
  router.post("/compute/workflows/:name", async (req, res, ctx) => {
    try {
      const name = ctx.name;
      const workflow = WORKFLOWS[name];
      if (!workflow) {
        return sendJson(res, 404, {
          error: `Unknown workflow: ${name}`,
          available: Object.keys(WORKFLOWS),
        });
      }

      // Parse optional body overrides
      let body = {};
      try {
        const raw = await readBody(req);
        if (raw) {
          const parsed = parseJsonBody(raw);
          if (parsed.ok) body = parsed.value;
        }
      } catch {
        /* no body is fine */
      }

      const goal = body.goal || workflow.goal;
      const policy = { ...workflow.defaultPolicy, ...(body.policy || {}) };

      const job = await orchestrator.submitJob({
        goal,
        userId: req.user?.userId || "local",
        language: body.language,
        policy,
        context: {
          workflow: name,
          planTemplate: workflow.planTemplate,
          ...body.context,
        },
      });

      sendJson(res, 201, { job, workflow: name });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

// ─── Helper ──────────────────────────────────────────────────
function sendJson(res, status, body) {
  try {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch {
    /* response already sent */
  }
}

module.exports = {
  registerComputeRoutes,
};
