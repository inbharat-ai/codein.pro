/**
 * MCP (Model Context Protocol) route handlers
 */
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  handleRoute,
} = require("../utils/http-helpers");

function registerMcpRoutes(router, deps) {
  const {
    mcpClientManager,
    requirePermission,
    auditedAction,
    permissionManager,
    logger,
  } = deps;

  router.get("/mcp/servers", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const servers = mcpClientManager?.getAllServers() || [];
        jsonResponse(res, 200, { servers });
      },
      logger,
    );
  });

  router.post("/mcp/servers", async (req, res) => {
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
          name: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 100,
            sanitize: true,
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const permission = await requirePermission(
          "mcpManage",
          {
            workspacePath: process.cwd(),
            serverName: validation.data.name,
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

        const result = await auditedAction(
          "mcp-server-add",
          { name: validation.data.name },
          async () =>
            mcpClientManager.addServer(
              validation.data.name,
              parsed.value.config || {},
            ),
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.del("/mcp/servers/:name", async (req, res, params) => {
    await handleRoute(
      res,
      async () => {
        // params.name is already decoded by MicroRouter.match()
        const name = params.name;
        const validation = validateAndSanitizeInput(
          { name },
          {
            name: {
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

        const permission = await requirePermission(
          "mcpManage",
          {
            workspacePath: process.cwd(),
            serverName: validation.data.name,
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

        const result = await auditedAction(
          "mcp-server-remove",
          { name: validation.data.name },
          async () => mcpClientManager.removeServer(validation.data.name),
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/mcp/servers/:name/connect", async (req, res, params) => {
    await handleRoute(
      res,
      async () => {
        const name = params.name;
        const validation = validateAndSanitizeInput(
          { name },
          {
            name: {
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

        const permission = await requirePermission(
          "mcpManage",
          {
            workspacePath: process.cwd(),
            serverName: validation.data.name,
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

        const result = await auditedAction(
          "mcp-server-connect",
          { name: validation.data.name },
          async () => mcpClientManager.connect(validation.data.name),
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/mcp/servers/:name/disconnect", async (req, res, params) => {
    await handleRoute(
      res,
      async () => {
        const name = params.name;
        const validation = validateAndSanitizeInput(
          { name },
          {
            name: {
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

        const permission = await requirePermission(
          "mcpManage",
          {
            workspacePath: process.cwd(),
            serverName: validation.data.name,
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

        const result = await auditedAction(
          "mcp-server-disconnect",
          { name: validation.data.name },
          async () => mcpClientManager.disconnect(validation.data.name),
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.get("/mcp/tools", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        );
        const serverName = url.searchParams.get("server");

        const validation = validateAndSanitizeInput(
          { serverName },
          {
            serverName: {
              required: false,
              type: "string",
              maxLength: 100,
              sanitize: true,
            },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const tools =
          mcpClientManager?.listTools(validation.data.serverName) || [];
        jsonResponse(res, 200, { tools });
      },
      logger,
    );
  });

  router.post("/mcp/tools/call", async (req, res) => {
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
            maxLength: 120,
            sanitize: true,
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const permission = await requirePermission(
          "mcpToolCall",
          {
            workspacePath: process.cwd(),
            toolName: validation.data.toolName,
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

        const result = await auditedAction(
          "mcp-tool-call",
          { toolName: validation.data.toolName },
          async () =>
            mcpClientManager.callTool(
              validation.data.toolName,
              parsed.value.args || {},
              parsed.value.context,
            ),
        );
        jsonResponse(res, 200, { result });
      },
      logger,
    );
  });

  router.get("/mcp/activity", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        );
        const limit = url.searchParams.get("limit") || "100";

        const validation = validateAndSanitizeInput(
          { limit: parseInt(limit, 10) || 100 },
          {
            limit: { required: false, type: "number", min: 1, max: 10000 },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const activity =
          mcpClientManager?.getToolActivity(validation.data.limit) || [];
        jsonResponse(res, 200, { activity });
      },
      logger,
    );
  });
}

module.exports = { registerMcpRoutes };
