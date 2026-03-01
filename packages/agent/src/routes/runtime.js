/**
 * Local model runtime route handlers
 */
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  handleRoute,
} = require("../utils/http-helpers");

function registerRuntimeRoutes(router, deps) {
  const {
    modelRuntime,
    modelRouter,
    requirePermission,
    auditedAction,
    permissionManager,
    logger,
  } = deps;

  router.get("/runtime/models", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const models = modelRuntime?.listModels() || {
          installed: [],
          available: [],
          defaults: {},
        };
        jsonResponse(res, 200, models);
      },
      logger,
    );
  });

  router.post("/runtime/models/download", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          modelId: {
            required: true,
            type: "string",
            minLength: 2,
            maxLength: 120,
            sanitize: true,
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { modelId } = validation.data;
        const permission = await requirePermission(
          "downloadModel",
          { workspacePath: process.cwd(), modelId },
          permissionManager,
        );
        if (!permission.allowed) {
          jsonResponse(res, 403, {
            error:
              "Permission denied: " + (permission.reason || "Unauthorized"),
          });
          return;
        }

        const result = await auditedAction(
          "runtime-model-download",
          { modelId },
          async () =>
            modelRuntime.downloadModel(modelId, (progress) => {
              logger.info(
                { modelId, progress: progress.percent },
                "model.download.progress",
              );
            }),
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/runtime/models/import", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          filePath: {
            required: true,
            type: "string",
            format: "path",
            mustExist: true,
          },
          name: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 200,
            sanitize: true,
          },
          type: {
            required: true,
            type: "string",
            minLength: 2,
            maxLength: 50,
            sanitize: true,
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { filePath, name, type } = validation.data;
        const permission = await requirePermission(
          "downloadModel",
          {
            workspacePath: process.cwd(),
            filePath,
            modelName: name,
            modelType: type,
          },
          permissionManager,
        );
        if (!permission.allowed) {
          jsonResponse(res, 403, {
            error:
              "Permission denied: " + (permission.reason || "Unauthorized"),
          });
          return;
        }

        const model = await auditedAction(
          "runtime-model-import",
          { filePath, name, type },
          async () => modelRuntime.importLocalModel(filePath, name, type),
        );
        jsonResponse(res, 200, { success: true, model });
      },
      logger,
    );
  });

  router.post("/runtime/models/set-default", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          modelId: {
            required: true,
            type: "string",
            minLength: 2,
            maxLength: 120,
            sanitize: true,
          },
          type: {
            required: true,
            type: "string",
            minLength: 2,
            maxLength: 30,
            sanitize: true,
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { modelId, type } = validation.data;
        const permission = await requirePermission(
          "downloadModel",
          { workspacePath: process.cwd(), modelId, modelType: type },
          permissionManager,
        );
        if (!permission.allowed) {
          jsonResponse(res, 403, { error: "Permission denied" });
          return;
        }

        const result = await auditedAction(
          "runtime-model-set-default",
          { modelId, type },
          async () => modelRuntime.setDefaultModel(modelId, type),
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.del("/runtime/models/:modelId", async (req, res, ctx) => {
    await handleRoute(
      res,
      async () => {
        const modelId = ctx.modelId;
        const validation = validateAndSanitizeInput(
          { modelId },
          {
            modelId: {
              required: true,
              type: "string",
              minLength: 2,
              maxLength: 120,
              sanitize: true,
            },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const permission = await requirePermission(
          "downloadModel",
          { workspacePath: process.cwd(), modelId: validation.data.modelId },
          permissionManager,
        );
        if (!permission.allowed) {
          jsonResponse(res, 403, { error: "Permission denied" });
          return;
        }

        const result = await auditedAction(
          "runtime-model-delete",
          { modelId: validation.data.modelId },
          async () => modelRuntime.deleteModel(validation.data.modelId),
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/runtime/inference/start", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          modelId: {
            required: true,
            type: "string",
            minLength: 2,
            maxLength: 120,
            sanitize: true,
          },
          options: { required: false, type: "object" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { modelId, options } = validation.data;
        const result = await modelRuntime.startInference(
          modelId,
          options || {},
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/runtime/inference/stop", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        await modelRuntime.stopInference();
        jsonResponse(res, 200, { success: true });
      },
      logger,
    );
  });

  router.get("/runtime/status", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const status = modelRuntime?.getStatus() || {
          running: false,
          model: null,
        };
        jsonResponse(res, 200, status);
      },
      logger,
    );
  });

  router.post("/runtime/router", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          prompt: {
            required: false,
            type: "string",
            maxLength: 100000,
            sanitize: true,
          },
          contextSize: {
            required: false,
            type: "number",
            min: 0,
            max: 1000000,
          },
          contextLength: {
            required: false,
            type: "number",
            min: 0,
            max: 1000000,
          },
          reasoning: { required: false, type: "boolean" },
          mode: {
            required: false,
            type: "string",
            minLength: 2,
            maxLength: 30,
            sanitize: true,
          },
          preference: {
            required: false,
            type: "string",
            minLength: 2,
            maxLength: 30,
            sanitize: true,
          },
          maxLatencyMs: {
            required: false,
            type: "number",
            min: 0,
            max: 600000,
          },
          availableModels: { required: false, type: "array" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const payload = validation.data || {};
        const contextLength = payload.contextLength ?? payload.contextSize ?? 0;
        const mode = payload.mode || (payload.reasoning ? "plan" : "ask");
        const decision = modelRouter?.route({
          prompt: payload.prompt,
          contextLength,
          mode,
          preference: payload.preference || "auto",
          maxLatencyMs: payload.maxLatencyMs ?? null,
          availableModels: payload.availableModels ?? null,
        }) || { modelType: "coder", reason: "default" };
        jsonResponse(res, 200, decision);
      },
      logger,
    );
  });

  // ── Router performance & fine-tune endpoints ───────────────────────────
  router.get("/runtime/router/stats", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const stats = modelRouter?.getPerformanceStats() || {};
        const finetune = modelRouter?.getFineTuneStats() || {};
        jsonResponse(res, 200, { performance: stats, finetune });
      },
      logger,
    );
  });

  router.post("/runtime/router/feedback", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const {
          modelId,
          success,
          latencyMs,
          taskCategory,
          userRating,
          instruction,
          response,
        } = parsed.value;
        modelRouter?.recordOutcome(modelId, {
          success,
          latencyMs,
          taskCategory,
          userRating,
          instruction,
          response,
        });
        jsonResponse(res, 200, { recorded: true });
      },
      logger,
    );
  });

  router.get("/runtime/router/finetune-export", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const format = url.searchParams.get("format") || "alpaca";
        const data = modelRouter?.exportFineTuneData(format) || [];
        jsonResponse(res, 200, { format, count: data.length, data });
      },
      logger,
    );
  });
}

module.exports = { registerRuntimeRoutes };
