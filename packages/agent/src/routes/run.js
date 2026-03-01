/**
 * Run/Preview process route handlers
 */
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  handleRoute,
} = require("../utils/http-helpers");

function registerRunRoutes(router, deps) {
  const {
    processManager,
    projectDetector,
    validator,
    requirePermission,
    auditedAction,
    permissionManager,
    logger,
  } = deps;

  router.post("/run/detect", async (req, res) => {
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
          workspacePath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const project =
          projectDetector?.detect(validation.data.workspacePath) || null;
        jsonResponse(res, 200, { project });
      },
      logger,
    );
  });

  router.post("/run/start", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const { profile, options } = parsed.value;

        // Validate command if present
        if (profile && profile.runCmd) {
          const cmdValidation = validator.isValidCommand(profile.runCmd, {
            allowChaining: false,
            strict: true,
          });
          if (!cmdValidation.valid) {
            jsonResponse(res, 400, {
              error: `Invalid command: ${cmdValidation.errors.join(", ")}`,
            });
            return;
          }
        }

        // Check permission
        const permission = await requirePermission(
          "executeCode",
          {
            workspacePath: profile?.cwd || process.cwd(),
            command: profile?.runCmd,
            intent: "run-process",
          },
          permissionManager,
        );
        if (!permission.allowed) {
          jsonResponse(res, 403, {
            error:
              "Permission denied: " +
              (permission.reason || "Unauthorized to execute code"),
          });
          return;
        }

        const result = await auditedAction(
          "run-start",
          {
            command: profile?.runCmd,
            cwd: profile?.cwd,
          },
          async () => processManager.start(profile, options),
        );

        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/run/:runId/stop", async (req, res, params) => {
    await handleRoute(
      res,
      async () => {
        const validation = validateAndSanitizeInput(
          { runId: params.runId },
          {
            runId: {
              required: true,
              type: "string",
              minLength: 1,
              maxLength: 100,
              sanitize: true,
            },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const result = await processManager.stop(validation.data.runId);
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/run/:runId/restart", async (req, res, params) => {
    await handleRoute(
      res,
      async () => {
        const validation = validateAndSanitizeInput(
          { runId: params.runId },
          {
            runId: {
              required: true,
              type: "string",
              minLength: 1,
              maxLength: 100,
              sanitize: true,
            },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const result = await processManager.restart(validation.data.runId);
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.get("/run/:runId/logs", async (req, res, params) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        );
        const tail = url.searchParams.get("tail") || "100";

        const validation = validateAndSanitizeInput(
          { runId: params.runId, tail: parseInt(tail, 10) || 100 },
          {
            runId: {
              required: true,
              type: "string",
              minLength: 1,
              maxLength: 100,
              sanitize: true,
            },
            tail: { required: false, type: "number", min: 1, max: 10000 },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const result = processManager.getLogs(validation.data.runId, {
          tail: validation.data.tail,
        });
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.get("/run/:runId/status", async (req, res, params) => {
    await handleRoute(
      res,
      async () => {
        const validation = validateAndSanitizeInput(
          { runId: params.runId },
          {
            runId: {
              required: true,
              type: "string",
              minLength: 1,
              maxLength: 100,
              sanitize: true,
            },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const status = processManager.getStatus(validation.data.runId);
        jsonResponse(res, 200, { status });
      },
      logger,
    );
  });

  router.get("/run/processes", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const processes = processManager?.getAllProcesses() || [];
        jsonResponse(res, 200, { processes });
      },
      logger,
    );
  });
}

module.exports = { registerRunRoutes };
