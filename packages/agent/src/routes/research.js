/**
 * Web research route handlers — with response caching for repeated queries
 */
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  handleRoute,
} = require("../utils/http-helpers");

function registerResearchRoutes(router, deps) {
  const {
    webResearchService,
    permissionManager,
    appendAgentActivity,
    cache,
    logger,
  } = deps;

  async function checkWebPermission(req, res, intent, details) {
    if (!permissionManager) return true;
    const body = typeof req._parsedBody === "object" ? req._parsedBody : {};
    const decision = await permissionManager.checkPermission("webFetch", {
      workspacePath: body.workspacePath || process.cwd(),
      intent,
      details,
    });
    if (!decision.allowed) {
      jsonResponse(res, 403, { error: "Permission denied" });
      return false;
    }
    return true;
  }

  router.post("/api/research/web-search", async (req, res) => {
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
          query: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 1000,
            sanitize: true,
          },
          num_results: { required: false, type: "number", min: 1, max: 100 },
          workspacePath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        req._parsedBody = validation.data;
        if (
          !(await checkWebPermission(req, res, "web-search", {
            query: validation.data.query,
          }))
        ) {
          return;
        }

        // Check cache first (5 min TTL for search results)
        const cacheKey = `research:web:${validation.data.query}:${validation.data.num_results || 5}`;
        const cached = cache?.get(cacheKey);
        if (cached) {
          appendAgentActivity({
            type: "research",
            action: "web-search",
            query: validation.data.query,
            resultsCount: cached.length,
            cached: true,
          });
          jsonResponse(res, 200, {
            data: cached,
            results: cached,
            cached: true,
          });
          return;
        }

        const results = await webResearchService.searchWeb(
          validation.data.query,
          validation.data.num_results || 5,
        );
        cache?.set(cacheKey, results, { ttl: 300000, category: "research" });
        appendAgentActivity({
          type: "research",
          action: "web-search",
          query: validation.data.query,
          resultsCount: results.length,
        });
        jsonResponse(res, 200, { data: results, results });
      },
      logger,
    );
  });

  router.post("/api/research/fetch-url", async (req, res) => {
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
          url: {
            required: true,
            type: "string",
            format: "url",
            allowedProtocols: ["http", "https"],
          },
          workspacePath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        req._parsedBody = validation.data;
        if (
          !(await checkWebPermission(req, res, "fetch-url", {
            url: validation.data.url,
          }))
        ) {
          return;
        }

        const result = await webResearchService.fetchUrl(validation.data.url);
        appendAgentActivity({
          type: "research",
          action: "fetch-url",
          url: validation.data.url,
        });
        jsonResponse(res, 200, { data: result });
      },
      logger,
    );
  });

  router.post("/api/research/code-documentation-search", async (req, res) => {
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
          library: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 100,
            sanitize: true,
          },
          topic: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 500,
            sanitize: true,
          },
          num_results: { required: false, type: "number", min: 1, max: 100 },
          workspacePath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        req._parsedBody = validation.data;
        if (
          !(await checkWebPermission(req, res, "code-documentation-search", {
            library: validation.data.library,
            topic: validation.data.topic,
          }))
        ) {
          return;
        }

        const results = await webResearchService.codeDocumentationSearch(
          validation.data.library,
          validation.data.topic,
          validation.data.num_results || 5,
        );
        appendAgentActivity({
          type: "research",
          action: "code-documentation-search",
          query: `${validation.data.library} ${validation.data.topic}`,
          resultsCount: results.length,
        });
        jsonResponse(res, 200, { data: results, results });
      },
      logger,
    );
  });

  router.post("/api/research/code-example-search", async (req, res) => {
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
          language: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 50,
            sanitize: true,
          },
          pattern: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 1000,
            sanitize: true,
          },
          num_results: { required: false, type: "number", min: 1, max: 100 },
          workspacePath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        req._parsedBody = validation.data;
        if (
          !(await checkWebPermission(req, res, "code-example-search", {
            language: validation.data.language,
            pattern: validation.data.pattern,
          }))
        ) {
          return;
        }

        const results = await webResearchService.codeExampleSearch(
          validation.data.language,
          validation.data.pattern,
          validation.data.num_results || 5,
        );
        appendAgentActivity({
          type: "research",
          action: "code-example-search",
          query: `${validation.data.language} ${validation.data.pattern}`,
          resultsCount: results.length,
        });
        jsonResponse(res, 200, { data: results, results });
      },
      logger,
    );
  });

  router.post("/api/research/bug-solution-search", async (req, res) => {
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
          error_message: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 1000,
            sanitize: true,
          },
          language: {
            required: false,
            type: "string",
            maxLength: 50,
            sanitize: true,
          },
          num_results: { required: false, type: "number", min: 1, max: 100 },
          workspacePath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        req._parsedBody = validation.data;
        if (
          !(await checkWebPermission(req, res, "bug-solution-search", {
            error_message: validation.data.error_message,
          }))
        ) {
          return;
        }

        const results = await webResearchService.bugSolutionSearch(
          validation.data.error_message,
          validation.data.language || "",
          validation.data.num_results || 5,
        );
        appendAgentActivity({
          type: "research",
          action: "bug-solution-search",
          query:
            `${validation.data.language || ""} ${validation.data.error_message}`.trim(),
          resultsCount: results.length,
        });
        jsonResponse(res, 200, { data: results, results });
      },
      logger,
    );
  });

  router.post("/api/research/serper", async (req, res) => {
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
          query: {
            required: true,
            type: "string",
            minLength: 1,
            maxLength: 1000,
            sanitize: true,
          },
          num_results: { required: false, type: "number", min: 1, max: 100 },
          workspacePath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        req._parsedBody = validation.data;
        if (
          !(await checkWebPermission(req, res, "serper-search", {
            query: validation.data.query,
          }))
        ) {
          return;
        }

        const payload = await webResearchService.searchSerperLike(
          validation.data.query,
          validation.data.num_results || 5,
        );
        const resultsCount = payload.organic ? payload.organic.length : 0;
        appendAgentActivity({
          type: "research",
          action: "serper-search",
          query: validation.data.query,
          resultsCount,
        });
        jsonResponse(res, 200, { data: payload, results: payload });
      },
      logger,
    );
  });
}

module.exports = { registerResearchRoutes };
