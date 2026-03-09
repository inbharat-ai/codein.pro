/**
 * CodIn MAS — HTTP Routes
 *
 * REST API endpoints for the Multi-Agent Swarm system.
 *
 * Endpoints:
 *   POST   /swarm/init                — Initialize swarm
 *   POST   /swarm/shutdown            — Shutdown swarm
 *   GET    /swarm/status              — Swarm status
 *   POST   /swarm/agents              — Spawn an agent
 *   GET    /swarm/agents              — List agents
 *   GET    /swarm/agents/metrics      — Agent metrics
 *   POST   /swarm/tasks               — Orchestrate a task
 *   GET    /swarm/tasks/:taskId       — Task status
 *   GET    /swarm/tasks/:taskId/results — Task results
 *   POST   /swarm/tasks/:taskId/cancel — Cancel a task
 *   GET    /swarm/memory              — Memory usage
 *   GET    /swarm/permissions         — Pending permissions
 *   POST   /swarm/permissions/:requestId — Respond to permission
 *   GET    /swarm/events              — SSE event stream
 *   GET    /swarm/events/log          — Event log (JSON)
 */
"use strict";

const {
  readBody,
  parseJsonBody,
  jsonResponse,
} = require("../utils/http-helpers");
const { SwarmManager } = require("../mas/swarm-manager");

function sendJson(res, status, body) {
  jsonResponse(res, status, body);
}

async function ensureSwarmPermission(req, res, deps, operation, context = {}) {
  if (typeof deps.requirePermission !== "function") {
    return true;
  }
  const decision = await deps.requirePermission(
    "swarmOperation",
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

function ensureTaskOwnership(req, res, taskOwnerById, taskId) {
  const requester = req.user?.userId;
  if (!requester) {
    sendJson(res, 401, { error: "Authentication required" });
    return false;
  }
  const owner = taskOwnerById.get(taskId);
  if (owner && owner !== requester) {
    sendJson(res, 403, { error: "Forbidden: task access denied" });
    return false;
  }
  return true;
}

function registerSwarmRoutes(router, deps) {
  const { logger } = deps;
  const taskOwnerById = new Map();

  // Initialize SwarmManager once, store in deps for MCP tools
  const swarmManager = new SwarmManager({
    runLLM: deps.runLLM || (async () => "{}"),
    mcpClientManager: deps.mcpClientManager,
  });
  deps.swarmManager = swarmManager;

  // ─── GET /api/health ───────────────────────────────────────
  // Health check endpoint for extension client
  router.get("/api/health", (_req, res) => {
    try {
      sendJson(res, 200, {
        status: "ok",
        service: "CodingAgent",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /swarm/init ──────────────────────────────────────
  router.post("/swarm/init", async (req, res) => {
    try {
      if (!(await ensureSwarmPermission(req, res, deps, "init"))) return;
      const raw = await readBody(req, 256 * 1024);
      const parsed = parseJsonBody(raw);
      const config = parsed.ok ? parsed.value : {};
      const result = swarmManager.swarmInit(config);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });

  // ─── POST /swarm/shutdown ──────────────────────────────────
  router.post("/swarm/shutdown", (_req, res) => {
    try {
      const result = swarmManager.swarmShutdown();
      taskOwnerById.clear();
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /swarm/status ─────────────────────────────────────
  router.get("/swarm/status", (_req, res) => {
    try {
      const status = swarmManager.swarmStatus();
      sendJson(res, 200, status);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /swarm/agents ────────────────────────────────────
  router.post("/swarm/agents", async (req, res) => {
    try {
      if (!(await ensureSwarmPermission(req, res, deps, "agent-spawn"))) {
        return;
      }
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { type } = parsed.value;
      if (!type || typeof type !== "string" || type.length > 50)
        return sendJson(res, 400, {
          error: "'type' is required and must be a string (max 50 chars)",
        });

      const descriptor = swarmManager.agentSpawn(type);
      sendJson(res, 201, descriptor);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });

  // ─── GET /swarm/agents ─────────────────────────────────────
  router.get("/swarm/agents", (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const filter = {};
      if (url.searchParams.get("type")) {
        filter.type = url.searchParams.get("type");
      }
      if (url.searchParams.get("status")) {
        filter.status = url.searchParams.get("status");
      }
      const agents = swarmManager.agentList(filter);
      sendJson(res, 200, { agents });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /swarm/agents/metrics ─────────────────────────────
  router.get("/swarm/agents/metrics", (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const agentId = url.searchParams.get("agentId") || undefined;
      const metrics = swarmManager.agentMetrics(agentId);
      sendJson(res, 200, { metrics });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /swarm/tasks ─────────────────────────────────────
  router.post("/swarm/tasks", async (req, res) => {
    try {
      if (!(await ensureSwarmPermission(req, res, deps, "task-orchestrate"))) {
        return;
      }
      const raw = await readBody(req, 1024 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { goal, mode, topology, strategy, acceptanceCriteria, context } =
        parsed.value;
      if (!goal || typeof goal !== "string" || goal.length > 50000) {
        return sendJson(res, 400, {
          error: "'goal' is required and must be a string (max 50000 chars)",
        });
      }

      const result = await swarmManager.taskOrchestrate({
        goal,
        mode,
        topology,
        strategy,
        acceptanceCriteria,
        context: context || {},
      });

      if (result?.taskId && req.user?.userId) {
        taskOwnerById.set(result.taskId, req.user.userId);
      }

      sendJson(res, 201, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /swarm/tasks/:taskId ──────────────────────────────
  router.get("/swarm/tasks/:taskId", (req, res, ctx) => {
    try {
      if (!ensureTaskOwnership(req, res, taskOwnerById, ctx.taskId)) return;
      const status = swarmManager.taskStatus(ctx.taskId);
      if (!status) return sendJson(res, 404, { error: "Task not found" });
      sendJson(res, 200, status);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /swarm/tasks/:taskId/results ──────────────────────
  router.get("/swarm/tasks/:taskId/results", (req, res, ctx) => {
    try {
      if (!ensureTaskOwnership(req, res, taskOwnerById, ctx.taskId)) return;
      const results = swarmManager.taskResults(ctx.taskId);
      if (!results) return sendJson(res, 404, { error: "Task not found" });
      sendJson(res, 200, results);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /swarm/tasks/:taskId/cancel ──────────────────────
  router.post("/swarm/tasks/:taskId/cancel", (req, res, ctx) => {
    try {
      if (!ensureTaskOwnership(req, res, taskOwnerById, ctx.taskId)) return;
      const result = swarmManager.taskCancel(ctx.taskId);
      sendJson(res, result.success ? 200 : 404, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /swarm/memory ─────────────────────────────────────
  router.get("/swarm/memory", (_req, res) => {
    try {
      const usage = swarmManager.memoryUsage();
      sendJson(res, 200, usage || { error: "Swarm not active" });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /swarm/permissions ────────────────────────────────
  router.get("/swarm/permissions", (_req, res) => {
    try {
      const pending = swarmManager.getPendingPermissions();
      sendJson(res, 200, { pending });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /swarm/permissions/:requestId ────────────────────
  router.post("/swarm/permissions/:requestId", async (req, res, ctx) => {
    try {
      if (
        !(await ensureSwarmPermission(req, res, deps, "permission-respond", {
          requestId: ctx.requestId,
        }))
      ) {
        return;
      }
      const raw = await readBody(req, 64 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { response } = parsed.value;
      if (!response) {
        return sendJson(res, 400, {
          error: "'response' is required (approve_once|approve_always|deny)",
        });
      }

      const result = swarmManager.respondToPermission(ctx.requestId, response);
      sendJson(res, result.success ? 200 : 400, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /swarm/events — SSE Stream ────────────────────────
  router.get("/swarm/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(":ok\n\n");

    swarmManager.subscribe(res);

    req.on("close", () => {
      swarmManager.unsubscribe(res);
    });
  });

  // ─── GET /swarm/events/log — Recent events as JSON ─────────
  router.get("/swarm/events/log", (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const limit = parseInt(url.searchParams.get("limit") || "100", 10);
      const events = swarmManager.getEventLog(limit);
      sendJson(res, 200, { events });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerSwarmRoutes };
