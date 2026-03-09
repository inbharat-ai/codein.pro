"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { GitRepoService } = require("../services/git-repo-service");
const {
  readBody,
  parseJsonBody,
  jsonResponse,
} = require("../utils/http-helpers");

function sendJson(res, status, body) {
  jsonResponse(res, status, body);
}

function inferRepoNameFromUrl(repoUrl) {
  if (!repoUrl || typeof repoUrl !== "string") return null;
  const cleaned = repoUrl.replace(/\.git$/i, "");
  const parts = cleaned.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1] || null;
}

async function ensurePermission(req, res, deps, operation, context = {}) {
  if (typeof deps.requirePermission !== "function") {
    return true;
  }
  const decision = await deps.requirePermission(
    "gitOperation",
    {
      user: req.user,
      operation,
      ...context,
    },
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

/**
 * Verify that the git operation is authorized and the path is safe.
 */
function validateGitOperationAccess(req, repoPath, deps) {
  // Require user authentication for git operations
  if (!req.user) {
    return {
      authorized: false,
      reason: "Authentication required for git operations",
    };
  }

  // Path must be valid string
  if (!repoPath || typeof repoPath !== "string") {
    return {
      authorized: false,
      reason: "Invalid repository path",
    };
  }

  // Block path traversal
  if (repoPath.includes("..")) {
    return {
      authorized: false,
      reason: "Path traversal not allowed",
    };
  }

  // Resolve to absolute path and validate it's within managed-repos
  const resolved = path.resolve(repoPath);
  const managedReposDir =
    deps.config?.managedReposDir || path.join(process.cwd(), "managed-repos");
  const allowedBase = path.resolve(managedReposDir);

  if (
    !(resolved === allowedBase || resolved.startsWith(allowedBase + path.sep))
  ) {
    return {
      authorized: false,
      reason: "Repository must be in managed-repos directory",
    };
  }

  // For existing paths, enforce realpath containment to block symlink escapes.
  if (fs.existsSync(resolved)) {
    try {
      const realResolved = fs.realpathSync(resolved);
      const realAllowedBase = fs.realpathSync(allowedBase);
      if (
        !(
          realResolved === realAllowedBase ||
          realResolved.startsWith(realAllowedBase + path.sep)
        )
      ) {
        return {
          authorized: false,
          reason: "Repository path escapes managed-repos directory",
        };
      }
    } catch {
      return {
        authorized: false,
        reason: "Unable to validate repository path",
      };
    }
  }

  return {
    authorized: true,
    resolvedPath: resolved,
  };
}

function registerGitRoutes(router, deps) {
  if (!deps.gitRepoService) {
    deps.gitRepoService = new GitRepoService({
      baseDir:
        deps.config?.managedReposDir ||
        path.join(process.cwd(), "managed-repos"),
      timeoutMs: deps.config?.gitTimeoutMs || 120000,
    });
  }

  const svc = deps.gitRepoService;
  const log = deps.logger || console;

  router.post("/git/clone", async (req, res) => {
    try {
      const raw = await readBody(req, 256 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { repoUrl, branch, name } = parsed.value || {};

      if (!repoUrl || typeof repoUrl !== "string") {
        return sendJson(res, 400, { error: "Repository URL is required" });
      }

      const repoName =
        typeof name === "string" && name.trim()
          ? name.trim()
          : inferRepoNameFromUrl(repoUrl);
      if (!repoName) {
        return sendJson(res, 400, {
          error: "Repository name is required or must be inferable from URL",
        });
      }

      // Validate auth and perms
      const managedReposDir =
        deps.config?.managedReposDir ||
        path.join(process.cwd(), "managed-repos");
      const targetRepoPath = path.join(managedReposDir, repoName);
      const auth = validateGitOperationAccess(req, targetRepoPath, deps);
      if (!auth.authorized) {
        return sendJson(res, 403, { error: auth.reason });
      }

      if (
        !(await ensurePermission(req, res, deps, "clone", {
          repoUrl,
          repoName,
        }))
      ) {
        return;
      }

      // Validate URL is safe
      try {
        const url = new URL(repoUrl);
        if (!["https:"].includes(url.protocol)) {
          return sendJson(res, 400, {
            error: "Only HTTPS git URLs are allowed",
          });
        }
      } catch {
        const isSsh = /^git@[^\s:]+:[^\s]+$/i.test(repoUrl.trim());
        if (!isSsh) {
          return sendJson(res, 400, { error: "Invalid repository URL" });
        }
      }

      log.info(
        {
          user: req.user.userId,
          repoUrl: repoUrl.slice(0, 50),
          name: repoName,
        },
        "git.clone authorized",
      );
      const result = await svc.clone(repoUrl, { branch, name: repoName });
      sendJson(res, 201, { success: true, ...result });
    } catch (err) {
      log.error("git/clone failed", err);
      sendJson(res, 500, { error: err.message });
    }
  });

  router.post("/git/open", async (req, res) => {
    try {
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
      const { repoPath } = parsed.value || {};

      const auth = validateGitOperationAccess(req, repoPath, deps);
      if (!auth.authorized) {
        return sendJson(res, 403, { error: auth.reason });
      }

      if (
        !(await ensurePermission(req, res, deps, "open", {
          repoPath: auth.resolvedPath,
        }))
      ) {
        return;
      }

      log.info(
        { user: req.user.userId, repoPath: auth.resolvedPath },
        "git.open authorized",
      );
      const result = await svc.open(auth.resolvedPath);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  router.post("/git/pull", async (req, res) => {
    try {
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
      const { repoPath } = parsed.value || {};

      const auth = validateGitOperationAccess(req, repoPath, deps);
      if (!auth.authorized) {
        return sendJson(res, 403, { error: auth.reason });
      }

      if (
        !(await ensurePermission(req, res, deps, "pull", {
          repoPath: auth.resolvedPath,
        }))
      ) {
        return;
      }

      log.info(
        { user: req.user.userId, repoPath: auth.resolvedPath },
        "git.pull authorized",
      );
      const result = await svc.pull(auth.resolvedPath);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  router.post("/git/branch", async (req, res) => {
    try {
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
      const { repoPath, branchName, checkout } = parsed.value || {};

      if (!branchName || typeof branchName !== "string") {
        return sendJson(res, 400, { error: "Branch name is required" });
      }

      const auth = validateGitOperationAccess(req, repoPath, deps);
      if (!auth.authorized) {
        return sendJson(res, 403, { error: auth.reason });
      }

      if (
        !(await ensurePermission(req, res, deps, "branch", {
          repoPath: auth.resolvedPath,
          branchName,
        }))
      ) {
        return;
      }

      // Validate branch name (no shell metacharacters)
      if (!/^[\w\-/.]+$/.test(branchName)) {
        return sendJson(res, 400, { error: "Invalid branch name" });
      }

      log.info(
        {
          user: req.user.userId,
          repoPath: auth.resolvedPath,
          branchName,
        },
        "git.branch authorized",
      );
      const result = await svc.createBranch(
        auth.resolvedPath,
        branchName,
        checkout !== false,
      );
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  router.get("/git/status", async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const repoPath = url.searchParams.get("repoPath");

      const auth = validateGitOperationAccess(req, repoPath, deps);
      if (!auth.authorized) {
        return sendJson(res, 403, { error: auth.reason });
      }

      if (
        !(await ensurePermission(req, res, deps, "status", {
          repoPath: auth.resolvedPath,
        }))
      ) {
        return;
      }

      const result = await svc.status(auth.resolvedPath);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  router.get("/git/diff", async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const repoPath = url.searchParams.get("repoPath");
      const baseRef = url.searchParams.get("base");
      const headRef = url.searchParams.get("head");

      const auth = validateGitOperationAccess(req, repoPath, deps);
      if (!auth.authorized) {
        return sendJson(res, 403, { error: auth.reason });
      }

      if (
        !(await ensurePermission(req, res, deps, "diff", {
          repoPath: auth.resolvedPath,
          baseRef,
          headRef,
        }))
      ) {
        return;
      }

      const result = await svc.diff(auth.resolvedPath, baseRef, headRef);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  router.post("/git/commit", async (req, res) => {
    try {
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
      const { repoPath, message, files } = parsed.value || {};

      if (
        !message ||
        typeof message !== "string" ||
        message.trim().length < 3
      ) {
        return sendJson(res, 400, {
          error: "Commit message must be at least 3 characters",
        });
      }

      const auth = validateGitOperationAccess(req, repoPath, deps);
      if (!auth.authorized) {
        return sendJson(res, 403, { error: auth.reason });
      }

      if (
        !(await ensurePermission(req, res, deps, "commit", {
          repoPath: auth.resolvedPath,
        }))
      ) {
        return;
      }

      log.info(
        { user: req.user.userId, repoPath: auth.resolvedPath, message },
        "git.commit authorized",
      );
      const result = await svc.commit(auth.resolvedPath, message, files);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerGitRoutes };
