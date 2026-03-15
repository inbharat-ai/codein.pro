/**
 * Authentication & authorization middleware.
 * Factory pattern: createAuthMiddleware({ jwtManager, auditLogger, jsonResponse }).
 * Extracted from index.js.
 */
"use strict";

const PUBLIC_ROUTES = new Set([
  "GET /health",
  "POST /auth/login",
  "POST /auth/refresh",
]);

function isPublicRoute(method, pathname) {
  return PUBLIC_ROUTES.has(`${method} ${pathname}`);
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}

/**
 * Create auth middleware functions bound to the given dependencies.
 * @param {object} deps
 * @param {object} deps.jwtManager
 * @param {object} deps.auditLogger
 * @param {Function} deps.jsonResponse
 * @returns {object} { PUBLIC_ROUTES, isPublicRoute, getBearerToken, authenticateJWTRequest, requirePermission, auditedAction }
 */
function createAuthMiddleware({ jwtManager, auditLogger, jsonResponse }) {
  function authenticateJWTRequest(req, res, requestLogger) {
    const token = getBearerToken(req);
    if (!token) {
      requestLogger.warn("auth.missing_token");
      jsonResponse(res, 401, { error: "Unauthorized" });
      return null;
    }

    const verification = jwtManager.verifyToken(token);
    if (!verification.valid) {
      requestLogger.warn({ reason: verification.error }, "auth.invalid_token");
      jsonResponse(res, 401, { error: "Unauthorized" });
      return null;
    }

    return verification.payload;
  }

  // Permission check wrapper
  async function requirePermission(permissionName, context, permissionMgr) {
    if (!permissionMgr) {
      // Local-only agent: allow by default when no permission manager is loaded.
      // In production multi-tenant deployments, set up a real permission manager.
      return {
        allowed: true,
        reason: "No permission manager — local mode (allow)",
      };
    }

    const decision = await permissionMgr.checkPermission(
      permissionName,
      context,
    );
    return decision;
  }

  // Audit logging wrapper
  async function auditedAction(action, metadata, handler) {
    const startTime = Date.now();
    try {
      const result = await handler();
      auditLogger.log("info", action, {
        ...metadata,
        status: "success",
        duration: Date.now() - startTime,
      });
      return result;
    } catch (error) {
      auditLogger.log("error", action, {
        ...metadata,
        status: "error",
        error: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  return {
    PUBLIC_ROUTES,
    isPublicRoute,
    getBearerToken,
    authenticateJWTRequest,
    requirePermission,
    auditedAction,
  };
}

module.exports = { createAuthMiddleware };
