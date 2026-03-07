/**
 * Auth route handlers — login, refresh, logout
 */
const crypto = require("node:crypto");
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  handleRoute: _handleRoute,
} = require("../utils/http-helpers");

function registerAuthRoutes(router, deps) {
  const { jwtManager } = deps;

  router.post("/auth/login", async (req, res) => {
    const raw = await readBody(req);
    const parsed = parseJsonBody(raw);
    if (!parsed.ok) {
      jsonResponse(res, 400, { error: parsed.error });
      return;
    }

    const validation = validateAndSanitizeInput(parsed.value, {
      username: {
        required: true,
        type: "string",
        minLength: 3,
        maxLength: 100,
        sanitize: true,
      },
      role: {
        required: false,
        type: "string",
        minLength: 3,
        maxLength: 30,
        sanitize: true,
      },
    });
    if (!validation.valid) {
      jsonResponse(res, 400, { error: validation.errors.join(", ") });
      return;
    }

    const username = validation.data.username;
    const role = validation.data.role || "developer";
    const userId = crypto
      .createHash("sha256")
      .update(username)
      .digest("hex")
      .slice(0, 16);
    const tokens = jwtManager.generateRefreshToken({ userId, username, role });
    jsonResponse(res, 200, { success: true, ...tokens });
  });

  router.post("/auth/refresh", async (req, res) => {
    const raw = await readBody(req);
    const parsed = parseJsonBody(raw);
    if (!parsed.ok) {
      jsonResponse(res, 400, { error: parsed.error });
      return;
    }

    const validation = validateAndSanitizeInput(parsed.value, {
      refreshToken: {
        required: true,
        type: "string",
        minLength: 20,
        maxLength: 5000,
      },
    });
    if (!validation.valid) {
      jsonResponse(res, 400, { error: validation.errors.join(", ") });
      return;
    }

    const refreshed = jwtManager.refreshAccessToken(
      validation.data.refreshToken,
    );
    if (!refreshed.success) {
      jsonResponse(res, 401, { error: "Unauthorized" });
      return;
    }

    jsonResponse(res, 200, {
      success: true,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresIn: refreshed.expiresIn,
    });
  });

  router.post("/auth/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const revoked = token ? jwtManager.revokeToken(token) : false;
    jsonResponse(res, 200, { success: revoked });
  });
}

module.exports = { registerAuthRoutes };
