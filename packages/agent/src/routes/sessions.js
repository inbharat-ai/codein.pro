/**
 * Session Management HTTP Routes
 *
 * REST API endpoints for session lifecycle management
 *
 * Endpoints:
 *   POST   /sessions          — Create new session
 *   GET    /sessions/:id      — Get session details
 *   PUT    /sessions/:id      — Update session activity
 *   DELETE /sessions/:id      — Terminate session
 *   GET    /sessions          — List all sessions
 *   GET    /sessions/:id/workspace — Get session workspace path
 */
"use strict";

const { SessionManager } = require("../utils/session-manager");
const {
  readBody,
  parseJsonBody,
  jsonResponse,
} = require("../utils/http-helpers");

function sendJson(res, status, body) {
  jsonResponse(res, status, body);
}

function registerSessionRoutes(router, deps) {
  // Initialize session manager (singleton)
  if (!deps.sessionManager) {
    deps.sessionManager = new SessionManager({
      baseWorkspaceDir: deps.config?.sessionWorkspaceDir,
      maxSessions: deps.config?.maxConcurrentSessions || 100,
      sessionTTL: deps.config?.sessionTTL || 3600000, // 1 hour
    });
  }

  const sessionManager = deps.sessionManager;

  // ─── POST /sessions ────────────────────────────────────────
  router.post("/sessions", async (req, res) => {
    try {
      const raw = await readBody(req);
      const parsed = parseJsonBody(raw);
      const sessionData = parsed.ok ? parsed.value : {};

      const session = await sessionManager.createSession({
        userId: sessionData.userId || req.user?.userId || "anonymous",
        metadata: sessionData.metadata || {},
      });

      sendJson(res, 201, { session });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /sessions/:sessionId ──────────────────────────────
  router.get("/sessions/:sessionId", (req, res, ctx) => {
    try {
      const session = sessionManager.getSession(ctx.sessionId);
      if (!session) {
        return sendJson(res, 404, { error: "Session not found" });
      }
      sendJson(res, 200, { session });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── PUT /sessions/:sessionId ──────────────────────────────
  router.put("/sessions/:sessionId", async (req, res, ctx) => {
    try {
      const raw = await readBody(req);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) {
        return sendJson(res, 400, { error: parsed.error });
      }

      const { activity, metadata } = parsed.value;

      sessionManager.updateActivity(ctx.sessionId, activity);

      if (metadata) {
        const session = sessionManager.getSession(ctx.sessionId);
        if (session) {
          session.metadata = { ...session.metadata, ...metadata };
        }
      }

      const updatedSession = sessionManager.getSession(ctx.sessionId);
      sendJson(res, 200, { session: updatedSession });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── DELETE /sessions/:sessionId ───────────────────────────
  router.delete("/sessions/:sessionId", async (req, res, ctx) => {
    try {
      await sessionManager.terminateSession(ctx.sessionId);
      sendJson(res, 200, { message: "Session terminated" });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /sessions ─────────────────────────────────────────
  router.get("/sessions", (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const userId = url.searchParams.get("userId");
      const status = url.searchParams.get("status");

      const sessions = sessionManager.listSessions({ userId, status });
      sendJson(res, 200, { sessions, count: sessions.length });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /sessions/:sessionId/workspace ────────────────────
  router.get("/sessions/:sessionId/workspace", (req, res, ctx) => {
    try {
      const session = sessionManager.getSession(ctx.sessionId);
      if (!session) {
        return sendJson(res, 404, { error: "Session not found" });
      }
      sendJson(res, 200, { workspacePath: session.workspacePath });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerSessionRoutes };
