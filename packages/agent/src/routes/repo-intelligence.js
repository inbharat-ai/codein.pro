/**
 * Repo Intelligence HTTP Routes
 *
 * REST API endpoints for repository-wide code intelligence and safe multi-file refactoring.
 *
 * Endpoints:
 *   POST /repo/scan           — Scan/index a repository
 *   GET  /repo/status         — Get index status & metadata
 *   POST /repo/search         — Search indexed codebase
 *   POST /repo/search/semantic — Semantic/hybrid search over indexed codebase
 *   POST /repo/symbol         — Find symbol definitions
 *   POST /repo/callers        — Find callers from AST-backed call graph
 *   POST /repo/impact         — Analyze change impact
 *   GET  /repo/summary        — Get repo summary for LLM context
 *   POST /repo/context        — Assemble LLM context from query terms
 *   POST /repo/refactor/plan  — Generate a refactoring plan
 *   POST /repo/refactor/exec  — Execute a refactoring plan
 *   GET  /repo/refactor/:id   — Get refactoring execution status
 *   POST /repo/validate       — Run validation pipeline on workspace
 *   GET  /repo/file/:path     — Get file info + symbols
 *   GET  /repo/deps/:path     — Get file dependencies & dependents
 */
"use strict";

const path = require("node:path");
const { RepoIndex } = require("../repo-intelligence/repo-index");
const { RefactorPlanner } = require("../repo-intelligence/refactor-planner");
const {
  ValidationPipeline,
} = require("../repo-intelligence/validation-pipeline");
const { RefactorExecutor } = require("../repo-intelligence/refactor-executor");
const {
  readBody,
  parseJsonBody,
  jsonResponse,
} = require("../utils/http-helpers");

function sendJson(res, status, body) {
  jsonResponse(res, status, body);
}

function ensureAuthenticated(req, res) {
  if (req.user) {
    return true;
  }
  sendJson(res, 401, { error: "Authentication required" });
  return false;
}

async function ensureRepoPermission(req, res, deps, operation, context = {}) {
  if (!ensureAuthenticated(req, res)) {
    return false;
  }
  if (typeof deps.requirePermission !== "function") {
    return true;
  }
  const decision = await deps.requirePermission(
    "repoOperation",
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

function validateTopK(value, fallback = 20, min = 1, max = 200) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function validateWeight(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return null;
  }
  return parsed;
}

function validateIndexedRelativePath(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "'path' query parameter is required" };
  }
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!normalized) {
    return { ok: false, error: "'path' query parameter is required" };
  }
  if (normalized.includes("..") || path.isAbsolute(normalized)) {
    return { ok: false, error: "Invalid repository file path" };
  }
  return { ok: true, normalized };
}

function validateRefactorExecPayload(payload = {}) {
  const { plan, edits, maxRetries, dryRun, skipValidation } = payload;
  if (!plan || typeof plan !== "object" || typeof plan.id !== "string") {
    return { ok: false, error: "'plan' with valid string 'id' is required" };
  }

  if (skipValidation === true && dryRun !== true) {
    return {
      ok: false,
      error: "'skipValidation' is only allowed when 'dryRun' is true",
    };
  }

  if (maxRetries !== undefined) {
    const parsed = Number(maxRetries);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5) {
      return {
        ok: false,
        error: "'maxRetries' must be an integer between 0 and 5",
      };
    }
  }

  if (edits !== undefined) {
    if (!Array.isArray(edits)) {
      return { ok: false, error: "'edits' must be an array" };
    }
    for (const edit of edits) {
      if (!edit || typeof edit !== "object") {
        return { ok: false, error: "Each edit must be an object" };
      }
      const relPath =
        typeof edit.relativePath === "string" ? edit.relativePath.trim() : "";
      if (!relPath || relPath.includes("..") || path.isAbsolute(relPath)) {
        return {
          ok: false,
          error: "Each edit must include a safe relativePath",
        };
      }
      const hasNewContent = typeof edit.newContent === "string";
      const hasPatch =
        typeof edit.patch === "string" && edit.patch.trim().length > 0;
      if (!hasNewContent && !hasPatch) {
        return {
          ok: false,
          error: `Edit '${relPath}' must include either 'newContent' or 'patch'`,
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Security: Validate workspace path with auth + allowlist + normalization.
 * Requires authenticated user and explicitly trusted workspace roots.
 */
function validateWorkspacePath(workspacePath, req, deps) {
  // 1. Require authentication
  if (!req.user) {
    return { ok: false, error: "Authentication required for repo operations" };
  }

  // 2. Validate input
  if (!workspacePath || typeof workspacePath !== "string") {
    return { ok: false, error: "workspace path is required" };
  }

  // 3. Normalize path to absolute
  const resolved = path.resolve(workspacePath);

  // 4. Create allowlist of trusted workspace roots
  const allowedRoots = [
    process.cwd(),
    path.join(process.cwd(), "projects"),
    path.join(process.cwd(), "workspaces"),
    path.join(process.cwd(), "managed-repos"),
    deps.config?.workspaceRoot || process.cwd(),
  ].map((p) => path.resolve(p));

  // 5. Verify that resolved path is within one of the allowed roots
  const isAllowed = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );

  if (!isAllowed) {
    return {
      ok: false,
      error:
        "Repository must be in an allowed workspace (projects, workspaces, or managed-repos)",
      resolvedPath: resolved,
      allowedRoots,
    };
  }

  // 6. Reject path traversal attempts
  if (workspacePath.includes("..")) {
    return {
      ok: false,
      error:
        "Path traversal using '..' is not allowed — use absolute paths only",
    };
  }

  // 7. Check for symbolic link escapes (prevent sneaking out via symlinks)
  try {
    const realPath = require("fs").realpathSync(resolved);
    const realAllowed = allowedRoots.some(
      (root) => realPath === root || realPath.startsWith(root + path.sep),
    );
    if (!realAllowed) {
      return {
        ok: false,
        error: "Symbolic link target is outside allowed workspace roots",
      };
    }
  } catch {
    // Path may not exist yet (e.g., new project), which is OK
    // but we log it for security auditing
  }

  return { ok: true, resolved };
}

function registerRepoIntelligenceRoutes(router, deps) {
  // Shared instances (one per server lifetime)
  const repoIndex = new RepoIndex();
  const validator = new ValidationPipeline();
  const planner = new RefactorPlanner(repoIndex);
  const executor = new RefactorExecutor({
    planner,
    validator,
    runLLM: deps.runLLM || null,
  });

  // Expose for other subsystems
  deps.repoIndex = repoIndex;
  deps.refactorPlanner = planner;
  deps.refactorExecutor = executor;
  deps.validationPipeline = validator;

  const log = deps.logger || console;

  // ─── POST /repo/scan ──────────────────────────────────────────

  router.post("/repo/scan", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "scan"))) {
        return;
      }

      const raw = await readBody(req, 256 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const {
        workspace,
        maxFiles,
        maxFileSizeBytes,
        incremental,
        includeExts,
        excludeExts,
      } = parsed.value || {};
      const check = validateWorkspacePath(workspace, req, deps);
      if (!check.ok) return sendJson(res, 400, { error: check.error });

      const result = await repoIndex.scan(check.resolved, {
        maxFiles,
        maxFileSizeBytes,
        incremental,
        includeExts,
        excludeExts,
      });

      sendJson(res, 200, {
        success: true,
        ...result,
      });
    } catch (err) {
      log.error("repo/scan failed:", err);
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /repo/status ─────────────────────────────────────────

  router.get("/repo/status", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "status"))) {
        return;
      }
      sendJson(res, 200, {
        indexed: repoIndex.meta.fileCount > 0,
        ...repoIndex.meta,
        edgeCount: repoIndex.graph.edges.length,
        ast: {
          enabled: repoIndex.astGraph.enabled,
          parser: repoIndex.astGraph.parser,
          filesProcessed: repoIndex.astGraph.filesProcessed,
          symbolNodes: repoIndex.astGraph.symbolNodes.length,
          callEdges: repoIndex.astGraph.callEdges.length,
        },
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /repo/search ────────────────────────────────────────

  router.post("/repo/search", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "search"))) {
        return;
      }
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { terms, topK } = parsed.value || {};
      if (!Array.isArray(terms) || terms.length === 0) {
        return sendJson(res, 400, {
          error: "'terms' must be a non-empty array of strings",
        });
      }

      const validatedTopK = validateTopK(topK);
      if (validatedTopK === null) {
        return sendJson(res, 400, {
          error: "'topK' must be an integer between 1 and 200",
        });
      }

      const results = repoIndex.search(terms, validatedTopK);
      sendJson(res, 200, { results, total: results.length });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /repo/search/semantic ───────────────────────────────

  router.post("/repo/search/semantic", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "semantic-search"))) {
        return;
      }
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { query, terms, topK, lexicalWeight, semanticWeight } =
        parsed.value || {};
      const normalizedTerms = Array.isArray(terms)
        ? terms
        : typeof query === "string"
          ? query.split(/\s+/).filter(Boolean)
          : [];

      if (normalizedTerms.length === 0) {
        return sendJson(res, 400, {
          error: "Provide 'query' string or non-empty 'terms' array",
        });
      }

      const validatedTopK = validateTopK(topK);
      if (validatedTopK === null) {
        return sendJson(res, 400, {
          error: "'topK' must be an integer between 1 and 200",
        });
      }

      const validatedLexicalWeight = validateWeight(lexicalWeight);
      if (lexicalWeight !== undefined && validatedLexicalWeight === null) {
        return sendJson(res, 400, {
          error: "'lexicalWeight' must be a number between 0 and 1",
        });
      }

      const validatedSemanticWeight = validateWeight(semanticWeight);
      if (semanticWeight !== undefined && validatedSemanticWeight === null) {
        return sendJson(res, 400, {
          error: "'semanticWeight' must be a number between 0 and 1",
        });
      }

      const results = repoIndex.hybridSearch(normalizedTerms, {
        topK: validatedTopK,
        lexicalWeight: validatedLexicalWeight ?? undefined,
        semanticWeight: validatedSemanticWeight ?? undefined,
      });
      sendJson(res, 200, {
        mode: "hybrid",
        terms: normalizedTerms,
        results,
        total: results.length,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /repo/symbol ────────────────────────────────────────

  router.post("/repo/symbol", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "symbol"))) {
        return;
      }
      const raw = await readBody(req, 64 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { name } = parsed.value || {};
      if (!name || typeof name !== "string") {
        return sendJson(res, 400, { error: "'name' is required" });
      }

      const definitions = repoIndex.findSymbol(name);
      const exports = repoIndex.findExport(name);

      sendJson(res, 200, { name, definitions, exports });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /repo/callers ───────────────────────────────────────

  router.post("/repo/callers", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "callers"))) {
        return;
      }
      const raw = await readBody(req, 64 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { name } = parsed.value || {};
      if (!name || typeof name !== "string") {
        return sendJson(res, 400, { error: "'name' is required" });
      }

      const callers = repoIndex.getCallers(name);
      sendJson(res, 200, {
        name,
        callers,
        astEnabled: repoIndex.astGraph.enabled,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /repo/impact ────────────────────────────────────────

  router.post("/repo/impact", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "impact"))) {
        return;
      }
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { changedFiles } = parsed.value || {};
      if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
        return sendJson(res, 400, {
          error: "'changedFiles' must be a non-empty array",
        });
      }

      const impact = repoIndex.getChangeImpact(changedFiles);
      sendJson(res, 200, { ...impact, changedFiles });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /repo/summary ────────────────────────────────────────

  router.get("/repo/summary", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "summary"))) {
        return;
      }
      const summary = repoIndex.getRepoSummary();
      sendJson(res, 200, { summary });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /repo/context ───────────────────────────────────────

  router.post("/repo/context", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "context"))) {
        return;
      }
      const raw = await readBody(req, 128 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { terms, maxTokens, maxFiles, mustInclude } = parsed.value || {};
      if (!Array.isArray(terms) || terms.length === 0) {
        return sendJson(res, 400, { error: "'terms' is required" });
      }

      const ctx = repoIndex.assembleContext(terms, {
        maxTokens,
        maxFiles,
        mustInclude,
      });
      sendJson(res, 200, ctx);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /repo/refactor/plan ─────────────────────────────────

  router.post("/repo/refactor/plan", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "refactor-plan"))) {
        return;
      }

      const raw = await readBody(req, 256 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { goal, targetFiles, excludeFiles, maxFiles } = parsed.value || {};
      if (!goal || typeof goal !== "string") {
        return sendJson(res, 400, { error: "'goal' is required" });
      }

      const plan = planner.plan(goal, { targetFiles, excludeFiles, maxFiles });
      sendJson(res, 200, { plan });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /repo/refactor/exec ─────────────────────────────────

  router.post("/repo/refactor/exec", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "refactor-exec"))) {
        return;
      }

      const raw = await readBody(req, 2 * 1024 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { workspace, plan, edits, maxRetries, dryRun, skipValidation } =
        parsed.value || {};
      const execValidation = validateRefactorExecPayload(parsed.value || {});
      if (!execValidation.ok) {
        return sendJson(res, 400, { error: execValidation.error });
      }
      const check = validateWorkspacePath(workspace, req, deps);
      if (!check.ok) return sendJson(res, 400, { error: check.error });

      // Execute asynchronously — return immediately with refactorId
      const execPromise = executor.execute(check.resolved, plan, {
        edits,
        maxRetries,
        dryRun,
        skipValidation,
      });

      sendJson(res, 202, {
        message: "Refactoring started",
        refactorId: plan.id,
        status: "running",
      });

      execPromise.catch((err) => {
        log.error("Refactor execution failed:", err);
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /repo/refactor/:id ───────────────────────────────────

  router.get("/repo/refactor/:id", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "refactor-status"))) {
        return;
      }
      // Extract :id from URL
      const url = new URL(req.url, `http://${req.headers.host}`);
      const segments = url.pathname.split("/").filter(Boolean);
      const id = segments[segments.length - 1];

      const status = executor.getStatus(id);
      if (!status) {
        return sendJson(res, 404, {
          error: "Refactoring not found or already completed",
        });
      }

      sendJson(res, 200, {
        id: status.id,
        status: status.status,
        modifiedFiles: status.modifiedFiles,
        retries: status.retries,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── POST /repo/validate ──────────────────────────────────────

  router.post("/repo/validate", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "validate"))) {
        return;
      }

      const raw = await readBody(req, 256 * 1024);
      const parsed = parseJsonBody(raw);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

      const { workspace, lint, typecheck, test, customCommands, changedFiles } =
        parsed.value || {};
      const check = validateWorkspacePath(workspace, req, deps);
      if (!check.ok) return sendJson(res, 400, { error: check.error });

      const report = await validator.validate(check.resolved, {
        lint,
        typecheck,
        test,
        customCommands,
        changedFiles,
      });

      sendJson(res, 200, report);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /repo/file/* ─────────────────────────────────────────

  router.get("/repo/file", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "file"))) {
        return;
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const filePath = url.searchParams.get("path");
      const pathCheck = validateIndexedRelativePath(filePath);
      if (!pathCheck.ok) {
        return sendJson(res, 400, { error: pathCheck.error });
      }

      const info = repoIndex.getFile(pathCheck.normalized);
      if (!info) {
        return sendJson(res, 404, { error: "File not found in index" });
      }

      sendJson(res, 200, {
        relativePath: info.relativePath,
        language: info.language,
        sizeBytes: info.sizeBytes,
        lineCount: info.lineCount,
        symbols: info.symbols,
        imports: info.imports,
        exports: info.exports,
        dependencies: repoIndex.getDependencies(pathCheck.normalized),
        dependents: repoIndex.getDependents(pathCheck.normalized),
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });

  // ─── GET /repo/deps ───────────────────────────────────────────

  router.get("/repo/deps", async (req, res) => {
    try {
      if (!(await ensureRepoPermission(req, res, deps, "deps"))) {
        return;
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const filePath = url.searchParams.get("path");
      const pathCheck = validateIndexedRelativePath(filePath);
      if (!pathCheck.ok) {
        return sendJson(res, 400, { error: pathCheck.error });
      }

      sendJson(res, 200, {
        file: pathCheck.normalized,
        dependencies: repoIndex.getDependencies(pathCheck.normalized),
        dependents: repoIndex.getDependents(pathCheck.normalized),
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { registerRepoIntelligenceRoutes };
