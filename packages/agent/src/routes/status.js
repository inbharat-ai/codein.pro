/**
 * System Observability HTTP Routes
 *
 * REST API endpoints for system health monitoring and metrics
 *
 * Endpoints:
 *   GET /status              — Overall system status
 *   GET /status/agents       — Agent pool status
 *   GET /status/compute      — Compute resource usage
 *   GET /status/sessions     — Session statistics
 *   GET /status/gpu          — GPU resource status
 *   GET /status/pipeline     — Pipeline health metrics
 *   GET /metrics             — Prometheus-format metrics
 */
"use strict";

const { jsonResponse } = require("../utils/http-helpers");
const os = require("os");

function sendJson(res, status, body) {
  jsonResponse(res, status, body);
}

function registerStatusRoutes(router, deps) {
  // ─── GET /status ───────────────────────────────────────────
  router.get("/status", (req, res) => {
    try {
      const status = {
        service: "CodingAgent",
        version: "1.0.0",
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        system: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          loadAverage: os.loadavg(),
        },
        components: {
          modelRuntime: !!deps.modelRuntime,
          modelRouter: !!deps.modelRouter,
          swarmManager: !!deps.swarmManager,
          gpuProvider: !!deps.gpuProvider,
          intelligenceOrchestrator: !!deps.intelligence,
          sessionManager: !!deps.sessionManager,
          computeSelector: !!deps.computeSelector,
          mcpClientManager: !!deps.mcpClientManager,
        },
      };

      sendJson(res, 200, status);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /status/agents ────────────────────────────────────
  router.get("/status/agents", (req, res) => {
    try {
      if (!deps.swarmManager) {
        return sendJson(res, 404, { error: "Swarm manager not available" });
      }

      const swarmStatus = deps.swarmManager.swarmStatus();
      const agents = swarmStatus.agents || [];

      const byStatus = agents.reduce((acc, agent) => {
        acc[agent.status] = (acc[agent.status] || 0) + 1;
        return acc;
      }, {});

      const byType = agents.reduce((acc, agent) => {
        acc[agent.type] = (acc[agent.type] || 0) + 1;
        return acc;
      }, {});

      sendJson(res, 200, {
        totalAgents: agents.length,
        byStatus,
        byType,
        agents: agents.slice(0, 20), // Return first 20 for overview
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /status/compute ───────────────────────────────────
  router.get("/status/compute", (req, res) => {
    try {
      const compute = {
        selector: null,
        orchestrator: null,
        intelligence: null,
      };

      if (deps.computeSelector) {
        compute.selector = deps.computeSelector.getUsage();
      }

      if (deps.computeOrchestrator) {
        compute.orchestrator = {
          activeJobs: deps.computeOrchestrator.jobStore?.size || 0,
        };
      }

      if (deps.intelligence) {
        compute.intelligence = {
          available: true,
          classifier: !!deps.intelligence.classifier,
          verifier: !!deps.intelligence.verifier,
        };
      }

      sendJson(res, 200, { compute });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /status/sessions ──────────────────────────────────
  router.get("/status/sessions", (req, res) => {
    try {
      if (!deps.sessionManager) {
        return sendJson(res, 404, { error: "Session manager not available" });
      }

      const sessions = deps.sessionManager.listSessions();
      const byStatus = sessions.reduce((acc, session) => {
        acc[session.status] = (acc[session.status] || 0) + 1;
        return acc;
      }, {});

      sendJson(res, 200, {
        totalSessions: sessions.length,
        byStatus,
        maxSessions: deps.sessionManager.maxSessions,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /status/gpu ───────────────────────────────────────
  router.get("/status/gpu", (req, res) => {
    try {
      if (!deps.gpuProvider) {
        return sendJson(res, 404, { error: "GPU provider not available" });
      }

      const gpuStatus = {
        available: true,
        provider: "RunpodBYO",
        // Add more GPU status details if provider exposes them
      };

      sendJson(res, 200, { gpu: gpuStatus });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /status/pipeline ──────────────────────────────────
  router.get("/status/pipeline", (req, res) => {
    try {
      const pipeline = {
        stages: {
          classification: !!deps.intelligence?.classifier,
          verification: !!deps.intelligence?.verifier,
          routing: !!deps.computeSelector,
          execution: !!deps.computeOrchestrator || !!deps.swarmManager,
          streaming: true, // Always available
        },
        healthy:
          !!deps.intelligence &&
          !!deps.computeSelector &&
          (!!deps.computeOrchestrator || !!deps.swarmManager),
      };

      sendJson(res, 200, { pipeline });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /metrics ──────────────────────────────────────────
  router.get("/metrics", (req, res) => {
    try {
      // Prometheus-format metrics
      const metrics = [];

      // Memory metrics
      const memUsage = process.memoryUsage();
      metrics.push(`# HELP nodejs_memory_heap_used_bytes Node.js heap used`);
      metrics.push(`# TYPE nodejs_memory_heap_used_bytes gauge`);
      metrics.push(`nodejs_memory_heap_used_bytes ${memUsage.heapUsed}`);

      metrics.push(`# HELP nodejs_memory_heap_total_bytes Node.js heap total`);
      metrics.push(`# TYPE nodejs_memory_heap_total_bytes gauge`);
      metrics.push(`nodejs_memory_heap_total_bytes ${memUsage.heapTotal}`);

      // Process uptime
      metrics.push(`# HELP nodejs_uptime_seconds Node.js process uptime`);
      metrics.push(`# TYPE nodejs_uptime_seconds gauge`);
      metrics.push(`nodejs_uptime_seconds ${process.uptime()}`);

      // Compute usage
      if (deps.computeSelector) {
        const usage = deps.computeSelector.getUsage();
        metrics.push(
          `# HELP compute_calls_total Total compute calls by target`,
        );
        metrics.push(`# TYPE compute_calls_total counter`);
        metrics.push(
          `compute_calls_total{target="local"} ${usage.local.calls}`,
        );
        metrics.push(
          `compute_calls_total{target="swarm"} ${usage.swarm.calls}`,
        );
        metrics.push(`compute_calls_total{target="gpu"} ${usage.gpu.calls}`);

        metrics.push(`# HELP compute_cost_total Total compute cost by target`);
        metrics.push(`# TYPE compute_cost_total counter`);
        metrics.push(
          `compute_cost_total{target="local"} ${usage.local.totalCost}`,
        );
        metrics.push(
          `compute_cost_total{target="swarm"} ${usage.swarm.totalCost}`,
        );
        metrics.push(`compute_cost_total{target="gpu"} ${usage.gpu.totalCost}`);
      }

      // Sessions
      if (deps.sessionManager) {
        const sessions = deps.sessionManager.listSessions();
        metrics.push(`# HELP sessions_active Active sessions`);
        metrics.push(`# TYPE sessions_active gauge`);
        metrics.push(`sessions_active ${sessions.length}`);
      }

      // External provider health
      if (deps.externalProviders) {
        const health = deps.externalProviders.getProviderHealth();
        metrics.push(
          `# HELP provider_circuit_state Provider circuit breaker state (0=closed, 1=open, 2=half_open)`,
        );
        metrics.push(`# TYPE provider_circuit_state gauge`);
        for (const [id, h] of Object.entries(health)) {
          const stateNum =
            h.state === "closed" ? 0 : h.state === "open" ? 1 : 2;
          metrics.push(`provider_circuit_state{provider="${id}"} ${stateNum}`);
        }

        metrics.push(`# HELP provider_failures_total Provider failure count`);
        metrics.push(`# TYPE provider_failures_total counter`);
        for (const [id, h] of Object.entries(health)) {
          metrics.push(
            `provider_failures_total{provider="${id}"} ${h.failures || 0}`,
          );
        }

        metrics.push(`# HELP provider_successes_total Provider success count`);
        metrics.push(`# TYPE provider_successes_total counter`);
        for (const [id, h] of Object.entries(health)) {
          metrics.push(
            `provider_successes_total{provider="${id}"} ${h.successes || 0}`,
          );
        }
      }

      // Swarm metrics
      if (deps.swarmManager) {
        try {
          const swarmStatus = deps.swarmManager.swarmStatus();
          metrics.push(`# HELP swarm_active_tasks Active swarm tasks`);
          metrics.push(`# TYPE swarm_active_tasks gauge`);
          metrics.push(`swarm_active_tasks ${swarmStatus.activeTasks || 0}`);
        } catch {
          // swarm not initialized — skip
        }
      }

      // Concurrency limiter metrics
      if (deps.concurrencyLimiter) {
        metrics.push(`# HELP concurrency_active_requests In-flight requests`);
        metrics.push(`# TYPE concurrency_active_requests gauge`);
        metrics.push(
          `concurrency_active_requests ${deps.concurrencyLimiter.activeCount}`,
        );
        metrics.push(
          `# HELP concurrency_queued_requests Queued requests waiting`,
        );
        metrics.push(`# TYPE concurrency_queued_requests gauge`);
        metrics.push(
          `concurrency_queued_requests ${deps.concurrencyLimiter.queueLength}`,
        );
      }

      // Rate limiter metrics
      if (deps.rateLimiter) {
        metrics.push(`# HELP rate_limiter_buckets Active rate limiter buckets`);
        metrics.push(`# TYPE rate_limiter_buckets gauge`);
        metrics.push(`rate_limiter_buckets ${deps.rateLimiter.buckets.size}`);
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(metrics.join("\n"));
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerStatusRoutes };
