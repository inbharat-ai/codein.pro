/**
 * GitNexus Integration Routes
 *
 * REST API endpoints for managing the GitNexus code-intelligence graph service.
 * GitNexus runs as an external MCP server — these routes handle setup, status,
 * indexing, and health for the integration layer.
 *
 * Endpoints:
 *   GET  /gitnexus/status      — Get installation, index, and MCP status
 *   POST /gitnexus/setup       — Full setup: install check → index → MCP register
 *   POST /gitnexus/reindex     — Trigger re-indexing of current workspace
 *   POST /gitnexus/register    — Register GitNexus as MCP server (without indexing)
 *
 * All endpoints return 503 with { available: false } if GitNexus is not installed.
 * Existing repo-intelligence routes continue to work unchanged.
 */
"use strict";

const {
  jsonResponse,
  readBody,
  parseJsonBody,
  handleRoute,
} = require("../utils/http-helpers");

function registerGitNexusRoutes(router, deps) {
  const { gitNexusService, requirePermission, permissionManager, logger } =
    deps;

  // ─── Guard: if service not loaded, all routes return 503 ──────
  function requireService(res) {
    if (!gitNexusService) {
      jsonResponse(res, 503, {
        available: false,
        reason: "GitNexus service not loaded",
      });
      return false;
    }
    return true;
  }

  // ─── GET /gitnexus/status ─────────────────────────────────────
  router.get("/gitnexus/status", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        if (!requireService(res)) return;

        const repoPath = req.query?.path || process.cwd();
        const status = await gitNexusService.getStatus(repoPath);

        jsonResponse(res, 200, {
          available: true,
          ...status,
        });
      },
      logger,
    );
  });

  // ─── POST /gitnexus/setup ────────────────────────────────────
  router.post("/gitnexus/setup", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        if (!requireService(res)) return;

        // Require repo operation permission
        if (typeof requirePermission === "function" && permissionManager) {
          const permission = await requirePermission(
            "repoOperation",
            {
              workspacePath: process.cwd(),
              operation: "gitnexus-setup",
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
        }

        const raw = await readBody(req, 64 * 1024);
        const parsed = parseJsonBody(raw);
        const repoPath = (parsed.ok && parsed.value?.path) || process.cwd();

        const result = await gitNexusService.setup(repoPath);

        jsonResponse(res, result.success ? 200 : 500, result);
      },
      logger,
    );
  });

  // ─── POST /gitnexus/reindex ──────────────────────────────────
  router.post("/gitnexus/reindex", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        if (!requireService(res)) return;

        if (typeof requirePermission === "function" && permissionManager) {
          const permission = await requirePermission(
            "repoOperation",
            {
              workspacePath: process.cwd(),
              operation: "gitnexus-reindex",
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
        }

        const raw = await readBody(req, 64 * 1024);
        const parsed = parseJsonBody(raw);
        const repoPath = (parsed.ok && parsed.value?.path) || process.cwd();

        const result = await gitNexusService.indexRepo(repoPath);

        jsonResponse(res, result.success ? 200 : 500, result);
      },
      logger,
    );
  });

  // ─── POST /gitnexus/register ─────────────────────────────────
  router.post("/gitnexus/register", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        if (!requireService(res)) return;

        if (typeof requirePermission === "function" && permissionManager) {
          const permission = await requirePermission(
            "mcpManage",
            {
              workspacePath: process.cwd(),
              serverName: "gitnexus",
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
        }

        const result = await gitNexusService.registerMcpServer();

        jsonResponse(res, result.registered ? 200 : 500, result);
      },
      logger,
    );
  });
}

module.exports = { registerGitNexusRoutes };
