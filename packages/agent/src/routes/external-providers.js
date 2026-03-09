/**
 * External API Providers route handlers
 * Configure, list, test, and use cloud LLM providers (OpenAI, Anthropic, Gemini)
 */
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  handleRoute,
} = require("../utils/http-helpers");

function registerExternalProviderRoutes(router, deps) {
  const {
    externalProviders,
    modelRouter,
    sanitizer,
    logger,
    requirePermission,
    auditedAction,
    permissionManager,
  } = deps;

  // ── List all providers (configured status + available models) ────────────
  router.get("/external-providers", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const providers = externalProviders
          ? externalProviders.listProviders()
          : [];
        jsonResponse(res, 200, { providers });
      },
      logger,
    );
  });

  router.get("/external-providers/health", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const permission = await requirePermission(
          "configureExternalProvider",
          { workspacePath: process.cwd(), action: "read-health" },
          permissionManager,
        );
        if (!permission.allowed) {
          jsonResponse(res, 403, {
            error:
              "Permission denied: " + (permission.reason || "Unauthorized"),
          });
          return;
        }

        const health = externalProviders?.getProviderHealth
          ? externalProviders.getProviderHealth()
          : {};
        jsonResponse(res, 200, { health });
      },
      logger,
    );
  });

  // ── Configure a provider with API key ───────────────────────────────────
  router.post("/external-providers/configure", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req, 512 * 1024);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          provider: {
            required: true,
            type: "string",
            minLength: 2,
            maxLength: 30,
            sanitize: true,
          },
          apiKey: {
            required: true,
            type: "string",
            minLength: 10,
            maxLength: 500,
            sanitize: false,
          },
          model: {
            required: false,
            type: "string",
            minLength: 2,
            maxLength: 100,
            sanitize: true,
          },
          baseUrl: {
            required: false,
            type: "string",
            format: "url",
            allowedProtocols: ["https"],
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { provider, apiKey, model, baseUrl } = validation.data;

        // Permission check
        const permission = await requirePermission(
          "configureExternalProvider",
          {
            workspacePath: process.cwd(),
            provider,
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

        await auditedAction(
          "external-provider-configure",
          { provider },
          async () => {
            externalProviders.configure(provider, { apiKey, model, baseUrl });

            // Register cloud models with the model router
            if (modelRouter) {
              const profiles = externalProviders.getRouterProfiles();
              for (const fullId of Object.keys(profiles)) {
                if (fullId.startsWith(provider + "/")) {
                  modelRouter.registerModel(fullId);
                }
              }
              // Merge cloud profiles into router
              Object.assign(modelRouter.profiles, profiles);
            }
          },
        );

        jsonResponse(res, 200, {
          success: true,
          provider,
          models:
            externalProviders.listProviders().find((p) => p.id === provider)
              ?.models || [],
        });
      },
      logger,
    );
  });

  // ── Remove a provider ───────────────────────────────────────────────────
  router.post("/external-providers/remove", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req, 256 * 1024);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          provider: {
            required: true,
            type: "string",
            minLength: 2,
            maxLength: 30,
            sanitize: true,
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { provider } = validation.data;

        // Unregister cloud models from router
        if (modelRouter) {
          for (const modelId of [...modelRouter.availableModels]) {
            if (modelId.startsWith(provider + "/")) {
              modelRouter.unregisterModel(modelId);
              delete modelRouter.profiles[modelId];
            }
          }
        }

        externalProviders.unconfigure(provider);
        jsonResponse(res, 200, { success: true, provider });
      },
      logger,
    );
  });

  // ── Test a provider (send a simple prompt) ──────────────────────────────
  router.post("/external-providers/test", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req, 512 * 1024);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          provider: {
            required: true,
            type: "string",
            minLength: 2,
            maxLength: 30,
            sanitize: true,
          },
          model: {
            required: false,
            type: "string",
            minLength: 2,
            maxLength: 100,
            sanitize: true,
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { provider, model } = validation.data;

        if (!externalProviders.isConfigured(provider)) {
          jsonResponse(res, 400, {
            error: `Provider ${provider} is not configured. POST /external-providers/configure first.`,
          });
          return;
        }

        const testMessages = [
          { role: "system", content: "You are a helpful coding assistant." },
          {
            role: "user",
            content: "Reply with exactly: CodIn provider test successful",
          },
        ];

        const startTime = Date.now();
        const result = await externalProviders.complete(
          provider,
          testMessages,
          {
            model,
            maxTokens: 50,
            temperature: 0,
          },
        );
        const latencyMs = Date.now() - startTime;

        jsonResponse(res, 200, {
          success: true,
          provider,
          model: result.model,
          response: result.content,
          latencyMs,
          usage: result.usage,
        });
      },
      logger,
    );
  });

  // ── Chat completion via external provider ───────────────────────────────
  router.post("/external-providers/complete", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req, 1024 * 1024);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const body = parsed.value;
        const provider = body.provider;
        const messages = body.messages;
        const options = body.options || {};

        if (!provider || typeof provider !== "string") {
          jsonResponse(res, 400, { error: "provider is required" });
          return;
        }
        if (!Array.isArray(messages) || messages.length === 0) {
          jsonResponse(res, 400, { error: "messages array is required" });
          return;
        }

        // Sanitize message contents
        const sanitizedMessages = messages.map((m) => ({
          role: m.role,
          content: sanitizer
            ? sanitizer.sanitizePrompt(String(m.content || ""), {
                mode: "moderate",
              }).sanitized
            : String(m.content || ""),
        }));

        const result = await externalProviders.complete(
          provider,
          sanitizedMessages,
          options,
        );
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  // ── Streaming completion via external provider (SSE) ────────────────────
  router.post("/external-providers/stream", async (req, res) => {
    const raw = await readBody(req, 1024 * 1024);
    const parsed = parseJsonBody(raw);
    if (!parsed.ok) {
      jsonResponse(res, 400, { error: parsed.error });
      return;
    }

    const body = parsed.value;
    const provider = body.provider;
    const messages = body.messages;
    const options = body.options || {};

    if (!provider || !externalProviders.isConfigured(provider)) {
      jsonResponse(res, 400, {
        error: `Provider ${provider} is not configured`,
      });
      return;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      jsonResponse(res, 400, { error: "messages array is required" });
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "http://127.0.0.1:43120",
    });

    try {
      const sanitizedMessages = messages.map((m) => ({
        role: m.role,
        content: sanitizer
          ? sanitizer.sanitizePrompt(String(m.content || ""), {
              mode: "moderate",
            }).sanitized
          : String(m.content || ""),
      }));

      for await (const chunk of externalProviders.streamComplete(
        provider,
        sanitizedMessages,
        options,
      )) {
        if (chunk.content) {
          res.write(
            `data: ${JSON.stringify({ content: chunk.content, done: false })}\n\n`,
          );
        }
        if (chunk.done) {
          res.write(`data: ${JSON.stringify({ content: "", done: true })}\n\n`);
          break;
        }
      }
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ error: err.message, done: true })}\n\n`,
      );
    }

    res.end();
  });

  // ── Fallback completion (tries all configured providers) ────────────────
  router.post(
    "/external-providers/complete-with-fallback",
    async (req, res) => {
      await handleRoute(
        res,
        async () => {
          const raw = await readBody(req, 1024 * 1024);
          const parsed = parseJsonBody(raw);
          if (!parsed.ok) {
            jsonResponse(res, 400, { error: parsed.error });
            return;
          }

          const body = parsed.value;
          const messages = body.messages;
          const options = body.options || {};
          const providerOrder = body.providerOrder || null;

          if (!Array.isArray(messages) || messages.length === 0) {
            jsonResponse(res, 400, { error: "messages array is required" });
            return;
          }

          const sanitizedMessages = messages.map((m) => ({
            role: m.role,
            content: sanitizer
              ? sanitizer.sanitizePrompt(String(m.content || ""), {
                  mode: "moderate",
                }).sanitized
              : String(m.content || ""),
          }));

          const result = await externalProviders.completeWithFallback(
            sanitizedMessages,
            options,
            providerOrder,
          );
          jsonResponse(res, 200, result);
        },
        logger,
      );
    },
  );
}

module.exports = { registerExternalProviderRoutes };
