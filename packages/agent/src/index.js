const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { URL } = require("node:url");
const { config } = require("./config");
const { logger, createRequestLogger } = require("./logger");

// Import existing modules
const {
  ensureDirs,
  getDataDir,
  getModelsDir,
  loadStore,
  saveStore,
} = require("./store");
const { getRouterDecision } = require("./router");
const { webResearchService } = require("./research/web-research");
const { TaskManager } = require("./run/task-manager");

// Import security modules
const { Sanitizer } = require("./security/sanitizer");
const { Validator } = require("./security/validator");
const { Sandbox } = require("./security/sandbox");

// Import middleware modules
const {
  RateLimiter,
  createRateLimiterMiddleware,
} = require("./middleware/rate-limiter");
const {
  createSecurityHeadersMiddleware,
} = require("./middleware/security-headers");

// Import performance modules
const { CacheManager } = require("./cache/cache-manager");
const { HTTPPoolManager } = require("./cache/http-pool");

// Import enterprise modules
const { AuditLogger } = require("./audit/audit-logger");
const { JWTManager } = require("./auth/jwt-manager");

// Import modular route registry
const { createAppRouter } = require("./routes/registry");

// Initialize security and performance systems
const sanitizer = new Sanitizer();
const validator = new Validator({
  allowedDirs: [
    process.cwd(),
    path.join(process.cwd(), "projects"),
    path.join(process.cwd(), "workspaces"),
    path.join(process.cwd(), "data"),
  ],
});
const sandbox = new Sandbox({ timeout: 30000, maxWorkers: 5 });
const cache = new CacheManager({ maxSize: 5000, defaultTTL: 3600000 }); // 1 hour TTL
const httpPool = new HTTPPoolManager({ maxSockets: 10, timeout: 30000 }); // connection pooling for outbound requests
const auditLogger = new AuditLogger({
  logDir: path.join(getDataDir(), "audit-logs"),
  logLevel: "info",
});
const jwtManager = new JWTManager({
  secret: config.jwtSecret || undefined,
  issuer: "codin-agent",
});

// Import new systems
let modelRuntime, modelRouter, i18nOrchestrator, ai4bharatProvider;
let mcpClientManager, projectDetector, processManager, permissionManager;
let externalProviders;
let intelligence; // Hybrid Intelligence Orchestrator
let appRouter = null; // Built after all subsystems load
const taskManager = new TaskManager();

// Load subsystem modules (all now CJS)
try {
  ({ modelRuntime } = require("./model-runtime/index.js"));
} catch (err) {
  logger.warn({ error: err.message }, "Model runtime failed to load");
}

try {
  ({ modelRouter } = require("./model-runtime/router.js"));
} catch (err) {
  logger.warn({ error: err.message }, "Model router failed to load");
}

try {
  ({ i18nOrchestrator } = require("./i18n/orchestrator.js"));
} catch (err) {
  logger.warn({ error: err.message }, "i18n orchestrator failed to load");
}

try {
  ({ ai4bharatProvider } = require("./i18n/ai4bharat-provider.js"));
} catch (err) {
  logger.warn({ error: err.message }, "AI4Bharat provider failed to load");
}

try {
  ({ mcpClientManager } = require("./mcp/client-manager.js"));
} catch (err) {
  logger.warn({ error: err.message }, "MCP client manager failed to load");
}

try {
  ({ projectDetector } = require("./run/project-detector.js"));
} catch (err) {
  logger.warn({ error: err.message }, "Project detector failed to load");
}

try {
  ({ processManager } = require("./run/process-manager.js"));
} catch (err) {
  logger.warn({ error: err.message }, "Process manager failed to load");
}

// Permission manager is in shared package
try {
  ({ permissionManager } = require("codin-shared/permissions/manager"));
} catch (err) {
  logger.warn({ error: err.message }, "Permission manager failed to load");
}

// External API provider manager (GPT-4, Claude, Gemini)
try {
  ({ externalProviders } = require("./model-runtime/external-providers.js"));
} catch (err) {
  logger.warn({ error: err.message }, "External providers failed to load");
}

// Hybrid Intelligence Orchestrator (classify → verify → escalate → confidence)
try {
  const {
    HybridIntelligenceOrchestrator,
  } = require("./intelligence/hybrid-orchestrator");
  intelligence = new HybridIntelligenceOrchestrator({
    modelRouter,
    externalProviders,
    modelRuntime,
    autoEscalate: true,
  });
  logger.info("Hybrid Intelligence Orchestrator initialized");
} catch (err) {
  logger.warn(
    { error: err.message },
    "Intelligence orchestrator failed to load",
  );
}

taskManager.setHandlers({
  "web-search": async (step) => {
    // Sanitize query
    const sanitized = sanitizer.sanitizePrompt(step.query || "", {
      mode: "moderate",
    });
    return await webResearchService.searchWeb(
      sanitized.sanitized,
      step.limit || 5,
    );
  },
  "fetch-url": async (step) => {
    // Validate URL
    const urlValidation = validateAndSanitizeInput(
      { url: step.url },
      {
        url: {
          required: true,
          type: "string",
          format: "url",
          allowedProtocols: ["http", "https"],
        },
      },
    );
    if (!urlValidation.valid) {
      throw new Error(`Invalid URL: ${urlValidation.errors.join(", ")}`);
    }
    return await webResearchService.fetchUrl(urlValidation.data.url);
  },
  "run-command": async (step) => {
    // Validate command
    const cmdValidation = validator.isValidCommand(step.command, {
      allowChaining: false,
      strict: true,
    });
    if (!cmdValidation.valid) {
      throw new Error(`Invalid command: ${cmdValidation.errors.join(", ")}`);
    }

    const profile = {
      runCmd: step.command,
      cwd: step.cwd || process.cwd(),
      env: step.env || {},
      port: step.port,
    };
    const result = await processManager.start(profile, {
      approved: !!step.approved,
    });
    return result;
  },
  "read-file": async (step) => {
    // Validate file path
    const pathValidation = validator.isValidFilePath(step.path, {
      mustExist: true,
      checkReadable: true,
    });
    if (!pathValidation.valid) {
      throw new Error(`Invalid file path: ${pathValidation.errors.join(", ")}`);
    }
    const content = fs.readFileSync(pathValidation.path, "utf8");
    return { path: pathValidation.path, content };
  },
  "write-file": async (step) => {
    // Validate file path
    const pathValidation = validator.isValidFilePath(step.path, {
      mustExist: false,
      checkReadable: false,
    });
    if (!pathValidation.valid) {
      throw new Error(`Invalid file path: ${pathValidation.errors.join(", ")}`);
    }
    // Sanitize content if it's a string
    let content = step.content || "";
    if (typeof content === "string") {
      const sanitized = sanitizer.sanitizePrompt(content, { mode: "moderate" });
      content = sanitized.sanitized;
    }
    fs.writeFileSync(pathValidation.path, content, "utf8");
    return { path: step.path, bytes: (step.content || "").length };
  },
  "system-open": async (step) => {
    openSystemTarget(step.target);
    return { target: step.target };
  },
});

taskManager.on("task-created", (task) => {
  appendAgentActivity({
    type: "task",
    action: "created",
    taskId: task.id,
    title: task.title,
  });
});

taskManager.on("task-started", (task) => {
  appendAgentActivity({
    type: "task",
    action: "started",
    taskId: task.id,
  });
});

taskManager.on("task-log", ({ taskId, entry }) => {
  appendAgentActivity({
    type: "task-log",
    taskId,
    level: entry.level,
    message: entry.message,
  });
});

taskManager.on("task-completed", (task) => {
  appendAgentActivity({
    type: "task",
    action: "completed",
    taskId: task.id,
  });
});

taskManager.on("task-failed", ({ task, error }) => {
  appendAgentActivity({
    type: "task",
    action: "failed",
    taskId: task.id,
    error: error.message || String(error),
  });
});

// Build the modular router now that all subsystems are available
buildRouter();
logger.info("All subsystems loaded — modular router ready");

const DEFAULT_PORT = config.port;

function ensureAgentLogDir() {
  const logDir = path.join(getDataDir(), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function appendAgentActivity(entry) {
  const logDir = ensureAgentLogDir();
  const logPath = path.join(logDir, "agent_activity.jsonl");
  const safeEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(logPath, JSON.stringify(safeEntry) + "\n", "utf8");
}

function readAgentActivity(limit = 100) {
  const logDir = ensureAgentLogDir();
  const logPath = path.join(logDir, "agent_activity.jsonl");
  if (!fs.existsSync(logPath)) {
    return [];
  }
  const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  const sliced = lines.slice(-limit);
  return sliced.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
}

function openSystemTarget(target) {
  if (!target) {
    throw new Error("Target is required");
  }

  // SECURITY: Only allow http/https URLs and absolute file paths
  let sanitized;
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Disallowed protocol: ${parsed.protocol}`);
    }
    sanitized = parsed.href;
  } catch (urlErr) {
    // Not a URL — treat as a file path
    const path = require("path");
    const resolved = path.resolve(target);
    // Block path traversal and shell metacharacters
    if (target.includes("..") || /[;&|`$<>(){}!]/.test(target)) {
      throw new Error("Invalid target path: contains disallowed characters");
    }
    sanitized = resolved;
  }

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", sanitized], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [sanitized], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [sanitized], { detached: true, stdio: "ignore" }).unref();
}

function getAgentPaths() {
  const dataDir = getDataDir();
  return {
    dataDir,
    modelsDir: getModelsDir(dataDir),
  };
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
    const chunks = [];
    let totalSize = 0;
    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy(new Error("Request body too large"));
        reject(new Error("Request body exceeds 10 MB limit"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve("");
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      resolve(raw);
    });
    req.on("error", reject);
  });
}

function parseJsonBody(raw) {
  if (!raw || raw.trim() === "") {
    return { ok: false, error: "Empty request body" };
  }
  try {
    const parsed = JSON.parse(raw);
    return { ok: true, value: parsed };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

// Security middleware
function validateAndSanitizeInput(body, schema) {
  const errors = [];
  const sanitized = {};

  for (const [key, rules] of Object.entries(schema)) {
    const value = body[key];

    // Required check
    if (
      rules.required &&
      (value === undefined || value === null || value === "")
    ) {
      errors.push(`${key} is required`);
      continue;
    }

    // Skip validation if optional and not provided
    if (!rules.required && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    if (rules.type === "string" && typeof value !== "string") {
      errors.push(`${key} must be a string`);
      continue;
    }

    if (rules.type === "number" && typeof value !== "number") {
      errors.push(`${key} must be a number`);
      continue;
    }

    if (rules.type === "boolean" && typeof value !== "boolean") {
      errors.push(`${key} must be a boolean`);
      continue;
    }

    // String validation
    if (typeof value === "string") {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${key} must be at least ${rules.minLength} characters`);
        continue;
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${key} must be at most ${rules.maxLength} characters`);
        continue;
      }

      // Sanitize text inputs
      if (rules.sanitize !== false) {
        const result = sanitizer.sanitizePrompt(value, {
          mode: rules.sanitizeMode || "moderate",
        });
        if (result.hasThreats && rules.rejectThreats) {
          errors.push(
            `${key} contains potential security threats: ${result.threats.join(", ")}`,
          );
          continue;
        }
        sanitized[key] = result.sanitized;
      } else {
        sanitized[key] = value;
      }

      // URL validation
      if (rules.format === "url") {
        try {
          const url = new URL(value);
          if (
            rules.allowedProtocols &&
            !rules.allowedProtocols.includes(url.protocol.replace(":", ""))
          ) {
            errors.push(
              `${key} protocol must be one of: ${rules.allowedProtocols.join(", ")}`,
            );
            continue;
          }
          sanitized[key] = value;
        } catch {
          errors.push(`${key} must be a valid URL`);
          continue;
        }
      }

      // Path validation
      if (rules.format === "path") {
        const pathValidation = validator.isValidFilePath(value, {
          mustExist: rules.mustExist,
          checkReadable: rules.checkReadable,
        });
        if (!pathValidation.valid) {
          errors.push(`${key}: ${pathValidation.errors.join(", ")}`);
          continue;
        }
        sanitized[key] = pathValidation.path;
      }
    } else {
      sanitized[key] = value;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: sanitized,
  };
}

function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

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
async function requirePermission(permissionName, context, permissionManager) {
  if (!permissionManager) {
    // Local-only agent: allow by default when no permission manager is loaded.
    // In production multi-tenant deployments, set up a real permission manager.
    return {
      allowed: true,
      reason: "No permission manager — local mode (allow)",
    };
  }

  const decision = await permissionManager.checkPermission(
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

// Helper to handle async route errors
async function handleRoute(res, handler) {
  try {
    await handler();
  } catch (error) {
    logger.error(
      { error: error.message, stack: error.stack },
      "Route handling failed",
    );
    jsonResponse(res, 500, {
      error: error.message || "Internal server error",
    });
  }
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(parsed, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Download failed with ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });
    request.on("error", reject);
  });
}

// ========================================
//  MODULAR ROUTE SETUP
// ========================================

// The app router is created lazily after all subsystems load.
// Until then, requests get 503.

function buildRouter() {
  appRouter = createAppRouter({
    // Auth
    jwtManager,
    crypto,

    // Store / paths
    loadStore,
    saveStore,
    getAgentPaths,
    ensureDirs,
    downloadFile,
    safeFilename,

    // Security & permissions
    sanitizer,
    validator,
    sandbox,
    permissionManager,
    requirePermission,
    auditedAction,

    // Logging
    logger,
    appendAgentActivity,
    readAgentActivity,
    auditLogger,

    // Subsystems (may be null if dynamic import failed)
    modelRuntime,
    modelRouter,
    i18nOrchestrator,
    externalProviders,
    intelligence,
    cache,
    httpPool,
    webResearchService,
    mcpClientManager,
    taskManager,
    projectDetector,
    processManager,

    // Legacy router
    getRouterDecision,
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const requestId =
      typeof req.headers["x-request-id"] === "string"
        ? req.headers["x-request-id"]
        : crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    const requestLogger = createRequestLogger(requestId);
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    requestLogger.info(
      { method: req.method, path: url.pathname },
      "request.start",
    );

    // Health check â€” always available
    if (req.method === "GET" && url.pathname === "/health") {
      jsonResponse(res, 200, {
        status: "ok",
        agent: "CodIn Agent",
        version: "0.1.0",
      });
      return;
    }

    // Public auth routes handled before JWT check
    if (req.method === "POST" && url.pathname === "/auth/login") {
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
      // Role is always "developer" for local agent — ignore client-supplied role
      const role = "developer";
      const userId = crypto
        .createHash("sha256")
        .update(username)
        .digest("hex")
        .slice(0, 16);
      const tokens = jwtManager.generateRefreshToken({
        userId,
        username,
        role,
      });

      jsonResponse(res, 200, { success: true, ...tokens });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/refresh") {
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
      return;
    }

    if (!isPublicRoute(req.method, url.pathname)) {
      const payload = authenticateJWTRequest(req, res, requestLogger);
      if (!payload) {
        return;
      }
      req.user = payload;
    }

    // â”€â”€ Delegate to modular router â”€â”€
    if (!appRouter) {
      jsonResponse(res, 503, {
        error: "Server initializing â€” try again shortly",
      });
      return;
    }

    const match = appRouter.match(req.method, url.pathname);
    if (match) {
      await match.handler(req, res, match.params);
      return;
    }

    // Legacy /router endpoint (kept inline â€” thin shim)
    if (req.method === "POST" && url.pathname === "/router") {
      await handleRoute(res, async () => {
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
          contextChars: {
            required: false,
            type: "number",
            min: 0,
            max: 1000000,
          },
          deepPlanning: { required: false, type: "boolean" },
          preferAccuracy: { required: false, type: "boolean" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }
        const store = loadStore();
        const hasLocalModel = !!store.active.coder || !!store.active.reasoner;
        const decision = getRouterDecision({
          prompt: validation.data.prompt || "",
          contextChars: validation.data.contextChars || 0,
          deepPlanning: validation.data.deepPlanning || false,
          preferAccuracy: validation.data.preferAccuracy || false,
          hasLocalModel,
        });
        jsonResponse(res, 200, { decision });
      });
      return;
    }

    jsonResponse(res, 404, { error: "Not found" });
  } catch (error) {
    logger.error(
      { error: error.message, stack: error.stack },
      "Unhandled request error",
    );
    jsonResponse(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  }
});

// Initialize middleware
const rateLimiter = new RateLimiter({
  requestsPerMinute: config.rateLimitPerMinute,
  requestsPerHour: config.rateLimitPerHour,
});

const rateLimiterMiddleware = createRateLimiterMiddleware(rateLimiter);
const securityHeadersMiddleware = createSecurityHeadersMiddleware({
  corsOrigin: config.corsOrigin,
  corsCredentials: config.corsCredentials,
  cspPolicy: config.cspPolicy,
  enableStrictTransportSecurity: config.enableHsts,
  hstsMaxAge: config.hstsMaxAge,
});

// Wrap server request handler with middleware
const originalHandler = server.listeners("request")[0];
server.removeAllListeners("request");
server.on("request", (req, res) => {
  // Apply security headers first
  securityHeadersMiddleware(req, res, () => {
    // Then apply rate limiting
    rateLimiterMiddleware(req, res, () => {
      // Finally, run the main request handler
      originalHandler(req, res);
    });
  });
});

server.listen(DEFAULT_PORT, "127.0.0.1", () => {
  logger.info(
    { port: DEFAULT_PORT },
    `CodIn Agent listening on http://127.0.0.1:${DEFAULT_PORT}`,
  );
});
