const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { config } = require("./config");
const { logger, createRequestLogger } = require("./logger");

// Core store & routing
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

// Security
const { Sanitizer } = require("./security/sanitizer");
const { Validator } = require("./security/validator");
const { Sandbox } = require("./security/sandbox");

// Middleware
const {
  RateLimiter,
  createRateLimiterMiddleware,
} = require("./middleware/rate-limiter");
const {
  createSecurityHeadersMiddleware,
} = require("./middleware/security-headers");

// Performance
const { CacheManager } = require("./cache/cache-manager");
const { HTTPPoolManager } = require("./cache/http-pool");

// Enterprise
const { AuditLogger } = require("./audit/audit-logger");
const { JWTManager } = require("./auth/jwt-manager");

// Extracted modules
const { createAppRouter } = require("./routes/registry");
const { loadSubsystems } = require("./subsystem-loader");
const { appendAgentActivity, readAgentActivity } = require("./activity-log");
const { createAuthMiddleware } = require("./auth-middleware");
const { configureTaskManager } = require("./task-handlers");
const { createShutdownHandler } = require("./shutdown");
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  safeFilename,
  handleRoute,
} = require("./utils/http-helpers");
const { IdempotencyCache, ConcurrencyLimiter } = require("./utils/concurrency");

// ── Instantiate singletons ──────────────────────────────────────

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
const cache = new CacheManager({ maxSize: 5000, defaultTTL: 3600000 });
const httpPool = new HTTPPoolManager({ maxSockets: 10, timeout: 30000 });
const auditLogger = new AuditLogger({
  logDir: path.join(getDataDir(), "audit-logs"),
  logLevel: "info",
});
const jwtManager = new JWTManager({
  secret: config.jwtSecret || undefined,
  issuer: "codin-agent",
});
const taskManager = new TaskManager();
const idempotencyCache = new IdempotencyCache({
  maxEntries: 5000,
  ttlMs: 5 * 60 * 1000,
});
const concurrencyLimiter = new ConcurrencyLimiter(200);

// ── Load optional subsystems ────────────────────────────────────

const subsystems = loadSubsystems();
const {
  modelRuntime,
  modelRouter,
  i18nOrchestrator,
  externalProviders,
  intelligence,
  mcpClientManager,
  projectDetector,
  processManager,
  permissionManager,
} = subsystems;

// ── Auth middleware ──────────────────────────────────────────────

const auth = createAuthMiddleware({ jwtManager, auditLogger, jsonResponse });
const {
  isPublicRoute,
  authenticateJWTRequest,
  requirePermission,
  auditedAction,
} = auth;

// ── Configure task manager ──────────────────────────────────────

configureTaskManager(taskManager, {
  sanitizer,
  validator,
  validateAndSanitizeInput,
  webResearchService,
  processManager,
  appendAgentActivity,
});

// ── Build modular router ────────────────────────────────────────

function getAgentPaths() {
  const dataDir = getDataDir();
  return { dataDir, modelsDir: getModelsDir(dataDir) };
}

function downloadFile(url, destPath) {
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

// Bridge function: agents call runLLM(systemPrompt, userPrompt, opts)
// Also handles the 2-argument form used by skills: runLLM(prompt, opts)
// where opts is an object with keys like maxTokens/temperature (not a string).
const runLLM = async (systemPrompt, userPrompt, opts = {}) => {
  // Detect 2-arg call: runLLM(prompt, { maxTokens, temperature, ... })
  if (
    userPrompt !== null &&
    typeof userPrompt === "object" &&
    !Array.isArray(userPrompt) &&
    typeof userPrompt.role === "undefined"
  ) {
    opts = userPrompt;
    userPrompt = systemPrompt;
    systemPrompt = "";
  }
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  try {
    const result = await externalProviders.completeWithFallback(messages, {
      model: opts.model,
      maxTokens: opts.maxTokens || 4096,
      temperature: opts.temperature ?? 0.7,
    });
    return result.content;
  } catch {
    if (modelRuntime && typeof modelRuntime.complete === "function") {
      return modelRuntime.complete(systemPrompt, userPrompt, opts);
    }
    throw new Error(
      "No LLM provider available. Configure an external provider via POST /external-providers/configure",
    );
  }
};

const appRouter = createAppRouter({
  jwtManager,
  crypto,
  loadStore,
  saveStore,
  getAgentPaths,
  ensureDirs,
  downloadFile,
  safeFilename,
  sanitizer,
  validator,
  sandbox,
  permissionManager,
  requirePermission,
  auditedAction,
  logger,
  appendAgentActivity,
  readAgentActivity,
  auditLogger,
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
  runLLM,
  getRouterDecision,
});

logger.info("All subsystems loaded — modular router ready");

// ── HTTP server ─────────────────────────────────────────────────

const DEFAULT_PORT = config.port;

function shouldCaptureIdempotency(statusCode, body) {
  if (!Number.isInteger(statusCode) || statusCode >= 500 || statusCode < 200) {
    return false;
  }
  return typeof body === "string" && body.length > 0;
}

function attachResponseCapture(res, maxBytes = 1024 * 1024) {
  const chunks = [];
  let totalBytes = 0;
  let truncated = false;

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  function captureChunk(chunk, encoding) {
    if (chunk === null || chunk === undefined || truncated) return;
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(String(chunk), encoding || "utf8");
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      truncated = true;
      return;
    }
    chunks.push(buf);
  }

  res.write = function patchedWrite(chunk, encoding, cb) {
    captureChunk(chunk, encoding);
    return originalWrite(chunk, encoding, cb);
  };

  res.end = function patchedEnd(chunk, encoding, cb) {
    captureChunk(chunk, encoding);
    return originalEnd(chunk, encoding, cb);
  };

  return {
    getBody() {
      if (truncated) return null;
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const requestId =
      typeof req.headers["x-request-id"] === "string"
        ? req.headers["x-request-id"]
        : crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    res.setHeader("X-API-Version", "1.0");
    req.requestId = requestId;
    const requestLogger = createRequestLogger(requestId);
    const startTime = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
      requestLogger.info(
        {
          method: req.method,
          path: (req._parsedUrl || {}).pathname,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        },
        "request.end",
      );
    });
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    // Strip versioned API prefixes for forward-compat while keeping
    // legacy un-prefixed routes working unchanged.
    // Supported prefix forms (evaluated in order of specificity):
    //   /api/v1/foo  →  /api/foo   (versioned canonical form)
    //   /v1/foo      →  /foo       (short versioned form)
    if (url.pathname.startsWith("/api/v1/") || url.pathname === "/api/v1") {
      // /api/v1/foo → /api/foo  (preserves /api/ namespace used by some routes)
      url.pathname = "/api" + (url.pathname.slice(7) || "/");
    } else if (url.pathname.startsWith("/v1/") || url.pathname === "/v1") {
      url.pathname = url.pathname.slice(3) || "/";
    }
    requestLogger.info(
      { method: req.method, path: url.pathname },
      "request.start",
    );
    const isMutatingRequest =
      req.method === "POST" || req.method === "PUT" || req.method === "DELETE";
    const idempotencyKey =
      typeof req.headers["idempotency-key"] === "string"
        ? req.headers["idempotency-key"].trim()
        : "";

    // Idempotency check for mutating requests
    if (idempotencyKey && isMutatingRequest) {
      const cached = idempotencyCache.get(idempotencyKey);
      if (cached.hit) {
        requestLogger.info({ idempotencyKey }, "Idempotent replay");
        res.writeHead(cached.status, { "Content-Type": "application/json" });
        res.end(cached.body);
        return;
      }
    }

    // Health check — always available (matches /health and /api/health)
    if (
      req.method === "GET" &&
      (url.pathname === "/health" || url.pathname === "/api/health")
    ) {
      jsonResponse(res, 200, {
        status: "ok",
        agent: "CodeIn Agent",
        version: "0.1.0",
      });
      return;
    }

    // ─── JWT VERIFICATION FOR ALL PROTECTED ROUTES ──────────────
    // NOTE: /auth/login and /auth/refresh are handled by the AppRouter
    // (routes/auth.js) which enforces per-IP rate limiting.
    // Check public routes BEFORE attempting JWT verification to avoid
    // sending a 401 response for routes that don't require auth.
    const routePath = url.pathname.replace(/^\/api\//, "/");
    if (!isPublicRoute(req.method, routePath)) {
      const authPayload = authenticateJWTRequest(req, res, requestLogger);
      if (!authPayload) {
        return;
      }
      req.user = authPayload;
    }

    // ─── PROTECTED ROUTE HANDLING ───────────────────────────────
    const idempotencyCapture =
      idempotencyKey && isMutatingRequest ? attachResponseCapture(res) : null;

    await concurrencyLimiter.run(async () => {
      // Try exact path first, then strip /api/ prefix for compatibility
      const match =
        appRouter.match(req.method, url.pathname) ||
        (url.pathname.startsWith("/api/")
          ? appRouter.match(req.method, url.pathname.slice(4))
          : null);
      if (match) {
        await match.handler(req, res, match.params);
        return;
      }

      // Legacy /router endpoint (kept inline — thin shim)
      if (req.method === "POST" && url.pathname === "/router") {
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
            const hasLocalModel =
              !!store.active.coder || !!store.active.reasoner;
            const decision = getRouterDecision({
              prompt: validation.data.prompt || "",
              contextChars: validation.data.contextChars || 0,
              deepPlanning: validation.data.deepPlanning || false,
              preferAccuracy: validation.data.preferAccuracy || false,
              hasLocalModel,
            });
            jsonResponse(res, 200, { decision });
          },
          logger,
        );
        return;
      }

      jsonResponse(res, 404, { error: "Not found" });
    });

    if (idempotencyCapture) {
      const body = idempotencyCapture.getBody();
      if (shouldCaptureIdempotency(res.statusCode, body)) {
        idempotencyCache.set(idempotencyKey, res.statusCode, body);
      }
    }
  } catch (error) {
    const errorClass = error.statusCode
      ? "client"
      : error.code === "ECONNRESET"
        ? "network"
        : "server";
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        errorClass,
        method: req.method,
        url: req.url,
      },
      "Unhandled request error",
    );
    const status = error.statusCode || 500;
    const clientMessage =
      config.nodeEnv === "production"
        ? "Internal server error"
        : error instanceof Error
          ? error.message
          : "Unexpected error";
    if (!res.headersSent) {
      jsonResponse(res, status, { error: clientMessage });
    }
  }
});

// ── Middleware wiring ────────────────────────────────────────────

const rateLimiter = new RateLimiter({
  requestsPerMinute: config.rateLimitPerMinute,
  requestsPerHour: config.rateLimitPerHour,
});

if (appRouter && appRouter._deps) {
  appRouter._deps.concurrencyLimiter = concurrencyLimiter;
  appRouter._deps.rateLimiter = rateLimiter;
}

const rateLimiterMiddleware = createRateLimiterMiddleware(rateLimiter, {
  trustProxy: config.trustProxy,
});
const securityHeadersMiddleware = createSecurityHeadersMiddleware({
  corsOrigin: config.corsOrigin,
  corsCredentials: config.corsCredentials,
  cspPolicy: config.cspPolicy,
  enableStrictTransportSecurity: config.enableHsts,
  hstsMaxAge: config.hstsMaxAge,
});

const originalHandler = server.listeners("request")[0];
server.removeAllListeners("request");
server.on("request", (req, res) => {
  securityHeadersMiddleware(req, res, () => {
    rateLimiterMiddleware(req, res, () => {
      originalHandler(req, res);
    });
  });
});

// ── Start listening ─────────────────────────────────────────────

server.listen(DEFAULT_PORT, "127.0.0.1", () => {
  logger.info(
    { port: DEFAULT_PORT },
    `CodeIn Agent listening on http://127.0.0.1:${DEFAULT_PORT}`,
  );
});

// ── Graceful shutdown ───────────────────────────────────────────

createShutdownHandler(server, {
  // Getter resolves swarmManager lazily — it's created inside the swarm
  // route module after /swarm/init is called, so it's undefined at boot.
  getSwarmManager: () =>
    appRouter && appRouter._deps ? appRouter._deps.swarmManager : null,
  processManager,
  rateLimiter,
  sandbox,
});
