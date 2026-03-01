/**
 * Intelligence Routes
 *
 * Exposes the Hybrid Intelligence pipeline via HTTP API.
 * Endpoints for process, stats, decisions, budget, and diagnostics.
 */
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  handleRoute,
} = require("../utils/http-helpers");

function registerIntelligenceRoutes(router, deps) {
  const { intelligence, logger } = deps;

  // ── Process a prompt through hybrid intelligence pipeline ─────────────
  router.post("/intelligence/process", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const { prompt, messages, context, preference, stream } = parsed.value;

        if (!prompt && (!messages || messages.length === 0)) {
          jsonResponse(res, 400, { error: "prompt or messages required" });
          return;
        }

        if (!intelligence) {
          jsonResponse(res, 503, {
            error: "Intelligence pipeline not initialized",
          });
          return;
        }

        const result = await intelligence.process({
          prompt: prompt || messages[messages.length - 1]?.content || "",
          messages,
          context: context || {},
          preference: preference || "auto",
          stream: !!stream,
        });

        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  // ── Classify prompt complexity (lightweight, no generation) ───────────
  router.post("/intelligence/classify", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const classification = intelligence?.classifier?.classify(
          parsed.value.prompt || "",
          parsed.value.context || {},
        );
        jsonResponse(
          res,
          200,
          classification || { error: "Classifier not available" },
        );
      },
      logger,
    );
  });

  // ── Verify code output ────────────────────────────────────────────────
  router.post("/intelligence/verify", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const result = await intelligence?.verifier?.verify(
          parsed.value.code || parsed.value.response || "",
          parsed.value.context || {},
        );
        jsonResponse(res, 200, result || { error: "Verifier not available" });
      },
      logger,
    );
  });

  // ── Get pipeline stats ────────────────────────────────────────────────
  router.get("/intelligence/stats", (req, res) => {
    try {
      const stats = intelligence?.getStats?.() || {};
      jsonResponse(res, 200, stats);
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
  });

  // ── Get recent intelligence decisions ─────────────────────────────────
  router.get("/intelligence/decisions", (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);
      const decisions = intelligence?.getRecentDecisions?.(limit) || [];
      jsonResponse(res, 200, { decisions, count: decisions.length });
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
  });

  // ── Budget management ─────────────────────────────────────────────────
  router.get("/intelligence/budget", (req, res) => {
    try {
      const budget = intelligence?.budget?.getBudgetSummary?.() || {};
      jsonResponse(res, 200, budget);
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
  });

  router.post("/intelligence/budget/limits", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        intelligence?.setBudgetLimits?.(parsed.value);
        jsonResponse(res, 200, {
          ok: true,
          budget: intelligence?.budget?.getBudgetSummary?.(),
        });
      },
      logger,
    );
  });

  router.get("/intelligence/budget/history", (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const history = intelligence?.budget?.getSpendHistory?.(limit) || [];
      jsonResponse(res, 200, { history, count: history.length });
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerIntelligenceRoutes };
