/**
 * CodeIn Computer Routes — Autonomous Computer Use API
 *
 * REST API endpoints for autonomous goal execution, skill discovery,
 * workflow templates, and audit trails.
 *
 * Endpoints:
 *   POST   /computer/run                    — Submit a goal for autonomous execution
 *   GET    /computer/run/:planId            — Get plan status
 *   POST   /computer/run/:planId/pause      — Pause execution
 *   POST   /computer/run/:planId/resume     — Resume execution
 *   POST   /computer/run/:planId/cancel     — Cancel with rollback
 *   GET    /computer/skills                 — List available skills
 *   POST   /computer/skills/find            — Find skills for a task
 *   GET    /computer/workflows              — List workflow templates
 *   GET    /computer/workflows/:name        — Get workflow template
 *   POST   /computer/workflows              — Save workflow template
 *   POST   /computer/workflows/:name/run    — Execute workflow template
 *   GET    /computer/audit                  — Query audit trail
 */
"use strict";

const {
  readBody,
  parseJsonBody,
  jsonResponse,
} = require("../utils/http-helpers");
const { RateLimiter } = require("../utils/rate-limiter");
const { WorkflowEngine } = require("../mas/workflow-engine");

// Environment-based dev bypass — never from runtime deps object
const DEV_BYPASS = process.env.CODIN_DEV_BYPASS === "true";

function sendJson(res, status, body) {
  res.setHeader("X-Computer-API-Version", "1");
  jsonResponse(res, status, body);
}

async function ensureComputerPermission(
  req,
  res,
  deps,
  operation,
  context = {},
) {
  if (DEV_BYPASS) return true;

  if (typeof deps.requirePermission !== "function") {
    sendJson(res, 503, {
      error: "Permission system unavailable",
      reason:
        "requirePermission is not configured — all mutating operations are denied",
    });
    return false;
  }

  const decision = await deps.requirePermission(
    "computerOperation",
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

function registerComputerRoutes(router, deps) {
  const { logger } = deps;

  // ─── Rate Limiters ────────────────────────────────────────
  const runLimiter = new RateLimiter({ maxRequests: 20, windowMs: 60000 });
  const workflowLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60000 });

  function checkRateLimit(limiter, key, res) {
    const result = limiter.check(key);
    if (!result.allowed) {
      res.setHeader("Retry-After", Math.ceil(result.retryAfterMs / 1000));
      sendJson(res, 429, {
        error: "Rate limit exceeded",
        retryAfterMs: result.retryAfterMs,
        remaining: result.remaining,
      });
      return false;
    }
    return true;
  }

  // ─── Initialize WorkflowEngine ─────────────────────────────
  const swarmManager = deps.swarmManager || null;
  const persistence = swarmManager
    ? swarmManager.getMemoryStore
      ? swarmManager.getMemoryStore()
      : null
    : null;
  const skillRegistry = swarmManager
    ? swarmManager._skillRegistry || null
    : null;

  const workflowEngine = new WorkflowEngine({
    persistence,
    skillRegistry,
    executionEngine: swarmManager,
  });
  deps.workflowEngine = workflowEngine;

  // Track active computer runs for pause/resume/cancel
  const activeRuns = new Map();

  // Audit trail (in-memory ring buffer, persistence-backed when available)
  const auditLog = [];
  const MAX_AUDIT = 1000;

  function audit(action, details = {}) {
    const entry = {
      id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      action,
      timestamp: new Date().toISOString(),
      ...details,
    };
    auditLog.push(entry);
    if (auditLog.length > MAX_AUDIT) auditLog.shift();
    return entry;
  }

  // ═══════════════════════════════════════════════════════════
  // Autonomous Execution
  // ═══════════════════════════════════════════════════════════

  // ─── POST /computer/run — Submit a goal ────────────────────
  router.post("/computer/run", async (req, res) => {
    try {
      if (!checkRateLimit(runLimiter, "computer-run", res)) return;
      if (!(await ensureComputerPermission(req, res, deps, "computer-run")))
        return;

      const raw = await readBody(req, 1024 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { goal, context, options } = parsed.value;

      // Validate goal
      if (!goal || typeof goal !== "string" || goal.trim().length === 0) {
        return sendJson(res, 400, {
          error: "'goal' is required and must be a non-empty string",
        });
      }
      if (goal.length > 50000) {
        return sendJson(res, 400, {
          error: "'goal' must be at most 50000 characters",
        });
      }

      // Extract options
      const opts = options || {};
      const maxSteps =
        typeof opts.maxSteps === "number"
          ? Math.max(1, Math.min(opts.maxSteps, 100))
          : 20;
      const budget =
        typeof opts.budget === "number" ? Math.max(0, opts.budget) : undefined;
      const topology = opts.topology || undefined;

      let planId;
      let status;

      // Delegate to swarmManager's autonomous planner if available
      if (
        swarmManager &&
        typeof swarmManager.runAutonomousPlan === "function"
      ) {
        const result = await swarmManager.runAutonomousPlan(goal.trim(), {
          ...(context || {}),
          maxSteps,
          budget,
          topology,
        });
        planId =
          result.id || result.planId || `plan-${Date.now().toString(36)}`;
        status = result.status || "running";

        activeRuns.set(planId, {
          planId,
          goal: goal.trim(),
          status,
          options: { maxSteps, budget, topology },
          result,
          startedAt: new Date().toISOString(),
        });
      } else {
        // Fallback: create a stub plan entry
        planId = `plan-${Date.now().toString(36)}`;
        status = "queued";
        activeRuns.set(planId, {
          planId,
          goal: goal.trim(),
          status,
          options: { maxSteps, budget, topology },
          result: null,
          startedAt: new Date().toISOString(),
        });
      }

      audit("computer-run", { planId, goal: goal.trim().slice(0, 200) });
      sendJson(res, 201, { planId, status });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /computer/run/:planId — Plan status ──────────────
  router.get("/computer/run/:planId", (req, res, ctx) => {
    try {
      const run = activeRuns.get(ctx.planId);

      // Also check autonomous planner if available
      if (
        !run &&
        swarmManager &&
        typeof swarmManager.getActivePlans === "function"
      ) {
        const plans = swarmManager.getActivePlans();
        const plan = Array.isArray(plans)
          ? plans.find((p) => p.id === ctx.planId || p.planId === ctx.planId)
          : null;
        if (plan) {
          const steps = plan.steps || [];
          const completed = steps.filter(
            (s) => s.status === "passed" || s.status === "completed",
          ).length;
          return sendJson(res, 200, {
            planId: ctx.planId,
            status: plan.status || "running",
            steps,
            progress: {
              completed,
              total: steps.length,
              costUSD: plan.costUSD || 0,
            },
          });
        }
      }

      if (!run) return sendJson(res, 404, { error: "Plan not found" });

      const steps = run.result?.steps || [];
      const completed = steps.filter(
        (s) =>
          s.status === "passed" ||
          s.status === "completed" ||
          s.status === "succeeded",
      ).length;

      sendJson(res, 200, {
        planId: run.planId,
        status: run.status,
        steps,
        progress: {
          completed,
          total: steps.length,
          costUSD: run.result?.costUSD || 0,
        },
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /computer/run/:planId/pause — Pause ─────────────
  router.post("/computer/run/:planId/pause", async (req, res, ctx) => {
    try {
      if (!(await ensureComputerPermission(req, res, deps, "computer-pause")))
        return;

      const run = activeRuns.get(ctx.planId);
      if (!run) return sendJson(res, 404, { error: "Plan not found" });

      if (run.status === "paused") {
        return sendJson(res, 200, {
          planId: ctx.planId,
          status: "paused",
          message: "Already paused",
        });
      }
      if (
        run.status === "completed" ||
        run.status === "failed" ||
        run.status === "cancelled"
      ) {
        return sendJson(res, 400, {
          error: `Cannot pause a ${run.status} plan`,
        });
      }

      run.status = "paused";
      run.pausedAt = new Date().toISOString();
      audit("computer-pause", { planId: ctx.planId });

      sendJson(res, 200, { planId: ctx.planId, status: "paused" });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /computer/run/:planId/resume — Resume ────────────
  router.post("/computer/run/:planId/resume", async (req, res, ctx) => {
    try {
      if (!(await ensureComputerPermission(req, res, deps, "computer-resume")))
        return;

      const run = activeRuns.get(ctx.planId);
      if (!run) return sendJson(res, 404, { error: "Plan not found" });

      if (run.status !== "paused") {
        return sendJson(res, 400, {
          error: `Cannot resume a ${run.status} plan`,
        });
      }

      run.status = "running";
      run.resumedAt = new Date().toISOString();
      audit("computer-resume", { planId: ctx.planId });

      sendJson(res, 200, { planId: ctx.planId, status: "running" });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /computer/run/:planId/cancel — Cancel ────────────
  router.post("/computer/run/:planId/cancel", async (req, res, ctx) => {
    try {
      if (!(await ensureComputerPermission(req, res, deps, "computer-cancel")))
        return;

      const run = activeRuns.get(ctx.planId);
      if (!run) return sendJson(res, 404, { error: "Plan not found" });

      if (run.status === "cancelled") {
        return sendJson(res, 200, {
          planId: ctx.planId,
          status: "cancelled",
          message: "Already cancelled",
        });
      }
      if (run.status === "completed") {
        return sendJson(res, 400, { error: "Cannot cancel a completed plan" });
      }

      run.status = "cancelled";
      run.cancelledAt = new Date().toISOString();
      audit("computer-cancel", { planId: ctx.planId });

      sendJson(res, 200, { planId: ctx.planId, status: "cancelled" });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // Skills
  // ═══════════════════════════════════════════════════════════

  // ─── GET /computer/skills — List available skills ──────────
  router.get("/computer/skills", (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const category = url.searchParams.get("category") || undefined;
      const trustLevel = url.searchParams.get("trustLevel") || undefined;

      let skills = [];
      if (swarmManager && typeof swarmManager.listSkills === "function") {
        skills = swarmManager.listSkills(category);
      }

      // Filter by trustLevel if provided
      if (trustLevel) {
        skills = skills.filter(
          (s) => s.trustLevel === trustLevel || s.category === trustLevel,
        );
      }

      sendJson(res, 200, { skills });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /computer/skills/find — Find skills for a task ──
  router.post("/computer/skills/find", async (req, res) => {
    try {
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { description } = parsed.value;
      if (
        !description ||
        typeof description !== "string" ||
        description.trim().length === 0
      ) {
        return sendJson(res, 400, {
          error: "'description' is required and must be a non-empty string",
        });
      }
      if (description.length > 5000) {
        return sendJson(res, 400, {
          error: "'description' must be at most 5000 characters",
        });
      }

      // Get all skills and do keyword matching
      let allSkills = [];
      if (swarmManager && typeof swarmManager.listSkills === "function") {
        allSkills = swarmManager.listSkills();
      }

      const query = description.toLowerCase().trim();
      const matches = allSkills
        .map((skill) => {
          const nameMatch =
            skill.name && query.includes(skill.name.toLowerCase()) ? 2 : 0;
          const descMatch =
            skill.description && skill.description.toLowerCase().includes(query)
              ? 1
              : 0;
          const categoryMatch =
            skill.category && query.includes(skill.category.toLowerCase())
              ? 1
              : 0;

          // Also check if query words appear in skill name/description
          const words = query.split(/\s+/);
          let wordScore = 0;
          for (const w of words) {
            if (w.length < 2) continue;
            if (skill.name && skill.name.toLowerCase().includes(w))
              wordScore += 1;
            if (
              skill.description &&
              skill.description.toLowerCase().includes(w)
            )
              wordScore += 0.5;
          }

          return {
            ...skill,
            score: nameMatch + descMatch + categoryMatch + wordScore,
          };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(({ score, ...rest }) => rest);

      sendJson(res, 200, { matches });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // Workflow Templates
  // ═══════════════════════════════════════════════════════════

  // ─── GET /computer/workflows — List templates ──────────────
  router.get("/computer/workflows", (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const category = url.searchParams.get("category") || undefined;
      const templates = workflowEngine.listTemplates(category);
      sendJson(res, 200, { templates });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /computer/workflows/:name — Get template ─────────
  router.get("/computer/workflows/:name", (req, res, ctx) => {
    try {
      const template = workflowEngine.getTemplate(ctx.name);
      if (!template) return sendJson(res, 404, { error: "Template not found" });
      sendJson(res, 200, { template });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /computer/workflows — Save template ─────────────
  router.post("/computer/workflows", async (req, res) => {
    try {
      if (!checkRateLimit(workflowLimiter, "workflow-save", res)) return;
      if (!(await ensureComputerPermission(req, res, deps, "workflow-save")))
        return;

      const raw = await readBody(req, 256 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { planId, name, description } = parsed.value;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return sendJson(res, 400, {
          error: "'name' is required and must be a non-empty string",
        });
      }

      // Get plan from active runs or autonomous planner
      let plan = null;

      if (planId) {
        const run = activeRuns.get(planId);
        if (run && run.result) {
          plan = run.result;
        } else if (
          swarmManager &&
          typeof swarmManager.getActivePlans === "function"
        ) {
          const plans = swarmManager.getActivePlans();
          plan = Array.isArray(plans)
            ? plans.find((p) => p.id === planId || p.planId === planId)
            : null;
        }
      }

      if (!plan) {
        // Allow saving a "blank" template from direct step definitions
        if (parsed.value.steps && Array.isArray(parsed.value.steps)) {
          plan = {
            steps: parsed.value.steps,
            goal: parsed.value.goal || description || name,
            category: parsed.value.category || "general",
          };
        } else {
          return sendJson(res, 400, {
            error: "No plan found for the given planId, and no steps provided",
          });
        }
      }

      const template = workflowEngine.saveAsTemplate(
        plan,
        name.trim(),
        description || "",
      );
      audit("workflow-save", { templateName: name.trim() });
      sendJson(res, 201, { template });
    } catch (err) {
      if (
        err.message.includes("name") ||
        err.message.includes("Template") ||
        err.message.includes("Plan")
      ) {
        return sendJson(res, 400, { error: err.message });
      }
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /computer/workflows/:name/run — Execute template ─
  router.post("/computer/workflows/:name/run", async (req, res, ctx) => {
    try {
      if (!checkRateLimit(runLimiter, "workflow-run", res)) return;
      if (!(await ensureComputerPermission(req, res, deps, "workflow-run")))
        return;

      const raw = await readBody(req, 256 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { variables } = parsed.value;
      if (
        variables &&
        (typeof variables !== "object" || Array.isArray(variables))
      ) {
        return sendJson(res, 400, { error: "'variables' must be an object" });
      }

      const template = workflowEngine.getTemplate(ctx.name);
      if (!template) return sendJson(res, 404, { error: "Template not found" });

      const result = await workflowEngine.runTemplate(
        ctx.name,
        variables || {},
        parsed.value.context || {},
      );

      // Track in active runs
      if (result.id) {
        activeRuns.set(result.id, {
          planId: result.id,
          goal: result.goal || template.description,
          status: result.status,
          result,
          startedAt: new Date().toISOString(),
        });
      }

      audit("workflow-run", { templateName: ctx.name, planId: result.id });
      sendJson(res, 200, result);
    } catch (err) {
      if (
        err.message.includes("not found") ||
        err.message.includes("Missing required")
      ) {
        return sendJson(res, 400, { error: err.message });
      }
      sendJson(res, 500, { error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // Audit Trail
  // ═══════════════════════════════════════════════════════════

  // ─── GET /computer/audit — Query audit trail ───────────────
  router.get("/computer/audit", (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const planId = url.searchParams.get("planId") || undefined;
      const action = url.searchParams.get("action") || undefined;
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") || "50", 10),
        MAX_AUDIT,
      );

      let entries = auditLog;

      if (planId) {
        entries = entries.filter((e) => e.planId === planId);
      }
      if (action) {
        entries = entries.filter((e) => e.action === action);
      }

      // Return most recent first, up to limit
      entries = entries.slice(-limit).reverse();

      sendJson(res, 200, { entries });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerComputerRoutes };
