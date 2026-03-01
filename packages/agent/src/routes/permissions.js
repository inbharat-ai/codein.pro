/**
 * Permissions route handlers
 */
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  handleRoute,
} = require("../utils/http-helpers");

function registerPermissionRoutes(router, deps) {
  const { permissionManager, logger } = deps;

  router.post("/permissions/check", async (req, res) => {
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
          toolName: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 100,
            sanitize: true,
          },
          context: { required: false, type: "object" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const permission = await permissionManager.checkPermission(
          validation.data.toolName,
          validation.data.context || {},
        );
        jsonResponse(res, 200, permission);
      },
      logger,
    );
  });

  router.post("/permissions/respond", async (req, res) => {
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
          requestId: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 100,
            sanitize: true,
          },
          response: { required: true, type: "boolean" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        permissionManager.respondToConsent(
          validation.data.requestId,
          validation.data.response,
        );
        jsonResponse(res, 200, { success: true });
      },
      logger,
    );
  });

  router.get("/permissions/queue", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const queue = permissionManager?.getConsentQueue() || [];
        jsonResponse(res, 200, { queue });
      },
      logger,
    );
  });

  router.get("/permissions/summary", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        );
        const workspacePath = url.searchParams.get("workspace");

        const validation = validateAndSanitizeInput(
          { workspacePath },
          {
            workspacePath: { required: false, type: "string", format: "path" },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const summary =
          permissionManager?.getPolicySummary(validation.data.workspacePath) ||
          {};
        jsonResponse(res, 200, summary);
      },
      logger,
    );
  });

  router.post("/permissions/extended-access", async (req, res) => {
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
          workspacePath: { required: true, type: "string", format: "path" },
          grant: { required: true, type: "boolean" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const result = validation.data.grant
          ? permissionManager.grantExtendedAccess(validation.data.workspacePath)
          : permissionManager.revokeExtendedAccess(
              validation.data.workspacePath,
            );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/permissions/reset", async (req, res) => {
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
          workspacePath: { required: true, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const result = permissionManager.resetPolicy(
          validation.data.workspacePath,
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });
}

module.exports = { registerPermissionRoutes };
