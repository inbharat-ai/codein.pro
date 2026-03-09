/**
 * External API Providers — Seamless integration with GPT-4, Claude, and Gemini.
 *
 * Each provider normalises the request/response to a common format so the
 * ModelRouter can treat cloud models and local models identically.
 *
 * Usage:
 *   const mgr = new ExternalProviderManager();
 *   mgr.configure("openai", { apiKey: "sk-..." });
 *   const result = await mgr.complete("openai", messages, options);
 */

const https = require("node:https");
const http = require("node:http");
const { EventEmitter } = require("events");

// ── Provider registry ────────────────────────────────────────────────────────

const PROVIDER_CONFIGS = {
  openai: {
    name: "OpenAI",
    models: {
      "gpt-4o": {
        contextWindow: 128000,
        costPerMTok: { input: 5, output: 15 },
        latencyTier: "medium",
        qualityScore: 0.95,
      },
      "gpt-4o-mini": {
        contextWindow: 128000,
        costPerMTok: { input: 0.15, output: 0.6 },
        latencyTier: "fast",
        qualityScore: 0.88,
      },
      "gpt-4-turbo": {
        contextWindow: 128000,
        costPerMTok: { input: 10, output: 30 },
        latencyTier: "medium",
        qualityScore: 0.93,
      },
      o1: {
        contextWindow: 200000,
        costPerMTok: { input: 15, output: 60 },
        latencyTier: "slow",
        qualityScore: 0.97,
      },
      "o1-mini": {
        contextWindow: 128000,
        costPerMTok: { input: 3, output: 12 },
        latencyTier: "medium",
        qualityScore: 0.91,
      },
    },
    defaultModel: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    chatEndpoint: "/chat/completions",
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    buildBody: (model, messages, opts) => ({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      stream: !!opts.stream,
      ...(opts.topP ? { top_p: opts.topP } : {}),
      ...(opts.stop ? { stop: opts.stop } : {}),
    }),
    parseResponse: (data) => ({
      content: data.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model,
      finishReason: data.choices?.[0]?.finish_reason ?? "stop",
    }),
    parseStreamChunk: (chunk) => {
      if (chunk === "[DONE]") return { done: true };
      try {
        const json = JSON.parse(chunk);
        const delta = json.choices?.[0]?.delta?.content ?? "";
        const done =
          json.choices?.[0]?.finish_reason !== null &&
          json.choices?.[0]?.finish_reason !== undefined;
        return { content: delta, done };
      } catch {
        return { content: "", done: false };
      }
    },
  },

  anthropic: {
    name: "Anthropic (Claude)",
    models: {
      "claude-sonnet-4-20250514": {
        contextWindow: 200000,
        costPerMTok: { input: 3, output: 15 },
        latencyTier: "medium",
        qualityScore: 0.95,
      },
      "claude-3-5-haiku-20241022": {
        contextWindow: 200000,
        costPerMTok: { input: 0.8, output: 4 },
        latencyTier: "fast",
        qualityScore: 0.87,
      },
      "claude-opus-4-20250514": {
        contextWindow: 200000,
        costPerMTok: { input: 15, output: 75 },
        latencyTier: "slow",
        qualityScore: 0.97,
      },
    },
    defaultModel: "claude-sonnet-4-20250514",
    baseUrl: "https://api.anthropic.com/v1",
    chatEndpoint: "/messages",
    authHeader: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
    buildBody: (model, messages, opts) => {
      // Claude uses a system field separate from messages
      const systemMsg = messages.find((m) => m.role === "system");
      const otherMsgs = messages.filter((m) => m.role !== "system");
      return {
        model,
        system:
          systemMsg?.content ??
          "You are CodIn, a world-class coding assistant.",
        messages: otherMsgs.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
        stream: !!opts.stream,
      };
    },
    parseResponse: (data) => ({
      content: data.content?.[0]?.text ?? "",
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens:
          (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      model: data.model,
      finishReason: data.stop_reason ?? "end_turn",
    }),
    parseStreamChunk: (chunk) => {
      try {
        const json = JSON.parse(chunk);
        if (json.type === "content_block_delta") {
          return { content: json.delta?.text ?? "", done: false };
        }
        if (json.type === "message_stop") {
          return { done: true };
        }
        return { content: "", done: false };
      } catch {
        return { content: "", done: false };
      }
    },
  },

  gemini: {
    name: "Google Gemini",
    models: {
      "gemini-2.0-flash": {
        contextWindow: 1048576,
        costPerMTok: { input: 0.075, output: 0.3 },
        latencyTier: "fast",
        qualityScore: 0.9,
      },
      "gemini-2.5-pro": {
        contextWindow: 1048576,
        costPerMTok: { input: 1.25, output: 10 },
        latencyTier: "medium",
        qualityScore: 0.96,
      },
      "gemini-2.5-flash": {
        contextWindow: 1048576,
        costPerMTok: { input: 0.15, output: 0.6 },
        latencyTier: "fast",
        qualityScore: 0.92,
      },
    },
    defaultModel: "gemini-2.0-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    // Gemini uses a different URL pattern
    chatEndpoint: (model, key) => `/models/${model}:generateContent?key=${key}`,
    authHeader: () => ({}), // API key is in URL
    buildBody: (model, messages, opts) => {
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
      const systemInstruction = messages.find((m) => m.role === "system");
      return {
        contents,
        ...(systemInstruction
          ? {
              systemInstruction: {
                parts: [{ text: systemInstruction.content }],
              },
            }
          : {}),
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: opts.maxTokens ?? 4096,
          ...(opts.topP ? { topP: opts.topP } : {}),
          ...(opts.stop ? { stopSequences: opts.stop } : {}),
        },
      };
    },
    parseResponse: (data) => {
      const candidate = data.candidates?.[0];
      return {
        content: candidate?.content?.parts?.[0]?.text ?? "",
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
        },
        model: data.modelVersion ?? "",
        finishReason: candidate?.finishReason ?? "STOP",
      };
    },
    parseStreamChunk: (chunk) => {
      try {
        const json = JSON.parse(chunk);
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const done = json.candidates?.[0]?.finishReason === "STOP";
        return { content: text, done };
      } catch {
        return { content: "", done: false };
      }
    },
  },
};

// ── Provider state ───────────────────────────────────────────────────────────

class ExternalProviderManager extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, { apiKey: string, model?: string, baseUrl?: string }>} */
    this.configured = new Map();
    /** @type {Map<string, {state:string, failures:number, successes:number, openedAt:number|null, nextProbeAt:number, halfOpenInFlight:boolean, lastError:string|null, lastStatus:string|null, lastLatencyMs:number|null}>} */
    this.providerHealth = new Map();

    this.resilienceConfig = {
      failureThreshold: 3,
      cooldownMs: 30_000,
      probeAfterMs: 10_000,
      requestTimeoutMs: 25_000,
      retryCount: 1,
      retryBackoffMs: 400,
    };
  }

  _ensureHealth(providerId) {
    if (!this.providerHealth.has(providerId)) {
      this.providerHealth.set(providerId, {
        state: "closed",
        failures: 0,
        successes: 0,
        openedAt: null,
        nextProbeAt: 0,
        halfOpenInFlight: false,
        lastError: null,
        lastStatus: null,
        lastLatencyMs: null,
      });
    }
    return this.providerHealth.get(providerId);
  }

  _classifyError(error) {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("timeout")) return "timeout";
    if (msg.includes("429") || msg.includes("rate")) return "rate_limit";
    if (msg.includes("5") && msg.includes("returned")) return "upstream_5xx";
    if (msg.includes("4") && msg.includes("returned")) return "upstream_4xx";
    if (
      msg.includes("econn") ||
      msg.includes("socket") ||
      msg.includes("network")
    )
      return "network";
    return "unknown";
  }

  _isRetryableClassification(classification) {
    return ["timeout", "rate_limit", "upstream_5xx", "network"].includes(
      classification,
    );
  }

  _markSuccess(providerId, latencyMs = null) {
    const health = this._ensureHealth(providerId);
    health.successes += 1;
    health.failures = 0;
    health.lastError = null;
    health.lastStatus = "ok";
    health.lastLatencyMs = latencyMs;
    if (health.state !== "closed") {
      health.state = "closed";
      health.openedAt = null;
      health.nextProbeAt = 0;
      health.halfOpenInFlight = false;
      this.emit("provider-recovered", { providerId, latencyMs });
    }
  }

  _markFailure(providerId, error, classification) {
    const health = this._ensureHealth(providerId);
    health.failures += 1;
    health.lastError = String(
      error?.message || error || "Unknown provider failure",
    );
    health.lastStatus = classification;
    health.halfOpenInFlight = false;

    if (health.failures >= this.resilienceConfig.failureThreshold) {
      health.state = "open";
      health.openedAt = Date.now();
      health.nextProbeAt = Date.now() + this.resilienceConfig.cooldownMs;
      this.emit("provider-circuit-open", {
        providerId,
        failures: health.failures,
        reason: classification,
      });
    }
  }

  _isProviderCallable(providerId) {
    const health = this._ensureHealth(providerId);
    if (health.state === "closed") {
      return { callable: true, mode: "closed" };
    }
    if (health.state === "open") {
      if (Date.now() >= health.nextProbeAt) {
        health.state = "half_open";
        health.halfOpenInFlight = false;
      } else {
        return { callable: false, mode: "open", until: health.nextProbeAt };
      }
    }

    if (health.state === "half_open") {
      if (health.halfOpenInFlight) {
        // Safety: if halfOpen probe has been in-flight too long, reset it
        if (
          health._halfOpenStartedAt &&
          Date.now() - health._halfOpenStartedAt >
            this.resilienceConfig.requestTimeoutMs + 5000
        ) {
          health.halfOpenInFlight = false;
          health._halfOpenStartedAt = null;
        } else {
          return {
            callable: false,
            mode: "half_open_busy",
            until: health.nextProbeAt,
          };
        }
      }
      health.halfOpenInFlight = true;
      health._halfOpenStartedAt = Date.now();
      return { callable: true, mode: "half_open" };
    }

    return { callable: true, mode: health.state };
  }

  getProviderHealth(providerId) {
    if (providerId) {
      return { providerId, ...this._ensureHealth(providerId) };
    }
    const snapshot = {};
    for (const id of Object.keys(PROVIDER_CONFIGS)) {
      snapshot[id] = { ...this._ensureHealth(id) };
    }
    return snapshot;
  }

  // ── Configuration ────────────────────────────────────────────────────────

  /** Configure a provider with an API key and optional overrides */
  configure(providerId, { apiKey, model, baseUrl } = {}) {
    if (!PROVIDER_CONFIGS[providerId]) {
      throw new Error(
        `Unknown provider: ${providerId}. Available: ${Object.keys(PROVIDER_CONFIGS).join(", ")}`,
      );
    }
    if (!apiKey) {
      throw new Error(`apiKey is required for ${providerId}`);
    }
    this.configured.set(providerId, { apiKey, model, baseUrl });
    this._ensureHealth(providerId);
    this.emit("provider-configured", { providerId });
  }

  /** Remove a provider */
  unconfigure(providerId) {
    this.configured.delete(providerId);
    this.emit("provider-unconfigured", { providerId });
  }

  /** Check if a provider is configured */
  isConfigured(providerId) {
    return this.configured.has(providerId);
  }

  /** List all available providers (configured or not) */
  listProviders() {
    return Object.entries(PROVIDER_CONFIGS).map(([id, cfg]) => ({
      id,
      name: cfg.name,
      configured: this.configured.has(id),
      models: Object.entries(cfg.models).map(([mId, mCfg]) => ({
        id: mId,
        contextWindow: mCfg.contextWindow,
        costInputPerMTok: mCfg.costPerMTok.input,
        costOutputPerMTok: mCfg.costPerMTok.output,
        latencyTier: mCfg.latencyTier,
        qualityScore: mCfg.qualityScore,
      })),
      defaultModel: cfg.defaultModel,
    }));
  }

  /** Get the model profile for router scoring (same shape as local profiles) */
  getRouterProfiles() {
    const profiles = {};
    for (const [providerId, cfg] of Object.entries(PROVIDER_CONFIGS)) {
      if (!this.configured.has(providerId)) continue;
      for (const [modelId, mCfg] of Object.entries(cfg.models)) {
        const fullId = `${providerId}/${modelId}`;
        profiles[fullId] = {
          type: mCfg.qualityScore >= 0.95 ? "reasoner" : "coder",
          contextWindow: mCfg.contextWindow,
          strengths: [
            "reasoning",
            "code_generation",
            "code_edit",
            "explanation",
            "debugging",
            "refactoring",
            "testing",
            "translation",
          ],
          latencyTier: mCfg.latencyTier,
          costTier:
            mCfg.costPerMTok.input > 5
              ? "expensive"
              : mCfg.costPerMTok.input > 1
                ? "moderate"
                : "cheap",
          qualityScore: mCfg.qualityScore,
          maxInputTokens: Math.floor(mCfg.contextWindow * 0.85),
          provider: providerId,
          cloud: true,
        };
      }
    }
    return profiles;
  }

  // ── Completion (non-streaming) ───────────────────────────────────────────

  /**
   * Send a chat completion request to the specified provider.
   *
   * @param {string} providerId - "openai" | "anthropic" | "gemini"
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options - temperature, maxTokens, topP, stop, model
   * @returns {Promise<Object>} Normalised response { content, usage, model, finishReason, latencyMs }
   */
  async complete(providerId, messages, options = {}) {
    const providerCfg = PROVIDER_CONFIGS[providerId];
    const userCfg = this.configured.get(providerId);
    if (!providerCfg || !userCfg) {
      throw new Error(`Provider ${providerId} is not configured`);
    }

    const model = options.model || userCfg.model || providerCfg.defaultModel;
    const baseUrl = userCfg.baseUrl || providerCfg.baseUrl;

    const endpoint =
      typeof providerCfg.chatEndpoint === "function"
        ? providerCfg.chatEndpoint(model, userCfg.apiKey)
        : providerCfg.chatEndpoint;

    const body = providerCfg.buildBody(model, messages, {
      ...options,
      stream: false,
    });
    const headers = {
      "Content-Type": "application/json",
      ...providerCfg.authHeader(userCfg.apiKey),
    };

    const callable = this._isProviderCallable(providerId);
    if (!callable.callable) {
      throw new Error(
        `Provider ${providerId} temporarily suppressed (${callable.mode})`,
      );
    }

    const startTime = Date.now();
    let data;
    try {
      data = await this._requestWithRetry(
        providerId,
        baseUrl + endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          timeoutMs:
            options.timeoutMs || this.resilienceConfig.requestTimeoutMs,
        },
        options,
      );
    } catch (error) {
      this._markFailure(providerId, error, this._classifyError(error));
      throw error;
    }

    const latencyMs = Date.now() - startTime;
    const parsed = providerCfg.parseResponse(data);
    parsed.latencyMs = latencyMs;
    parsed.provider = providerId;
    this._markSuccess(providerId, latencyMs);

    this.emit("completion", {
      providerId,
      model,
      latencyMs,
      usage: parsed.usage,
    });
    return parsed;
  }

  // ── Streaming completion ─────────────────────────────────────────────────

  /**
   * Stream a chat completion. Returns an async generator of content chunks.
   *
   * @param {string} providerId
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options
   * @yields {{ content: string, done: boolean }}
   */
  async *streamComplete(providerId, messages, options = {}) {
    const callable = this._isProviderCallable(providerId);
    if (!callable.callable) {
      throw new Error(
        `Provider ${providerId} temporarily suppressed (${callable.mode})`,
      );
    }

    const providerCfg = PROVIDER_CONFIGS[providerId];
    const userCfg = this.configured.get(providerId);
    if (!providerCfg || !userCfg) {
      throw new Error(`Provider ${providerId} is not configured`);
    }

    const model = options.model || userCfg.model || providerCfg.defaultModel;
    const baseUrl = userCfg.baseUrl || providerCfg.baseUrl;

    const endpoint =
      typeof providerCfg.chatEndpoint === "function"
        ? providerCfg.chatEndpoint(model, userCfg.apiKey)
        : providerCfg.chatEndpoint;

    // For Gemini streaming, use streamGenerateContent
    const streamEndpoint =
      providerId === "gemini"
        ? endpoint.replace(":generateContent", ":streamGenerateContent")
        : endpoint;

    const body = providerCfg.buildBody(model, messages, {
      ...options,
      stream: true,
    });
    const headers = {
      "Content-Type": "application/json",
      ...providerCfg.authHeader(userCfg.apiKey),
    };

    const url = new URL(baseUrl + streamEndpoint);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    const requestOptions = {
      method: "POST",
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        ...headers,
        "Content-Length": Buffer.byteLength(JSON.stringify(body)),
      },
    };

    const response = await new Promise((resolve, reject) => {
      const req = client.request(requestOptions, resolve);
      req.setTimeout(
        options.timeoutMs || this.resilienceConfig.requestTimeoutMs,
        () => {
          req.destroy(new Error("Provider stream request timeout"));
        },
      );
      req.on("error", reject);
      req.write(JSON.stringify(body));
      req.end();
    });

    if (response.statusCode >= 400) {
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      const errorBody = Buffer.concat(chunks).toString();
      const error = new Error(
        `${providerId} stream error ${response.statusCode}: ${errorBody.slice(0, 500)}`,
      );
      this._markFailure(providerId, error, this._classifyError(error));
      throw error;
    }

    let buffer = "";
    for await (const chunk of response) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        let payload = trimmed;
        if (payload.startsWith("data: ")) {
          payload = payload.slice(6).trim();
        }
        if (payload === "[DONE]") {
          this._markSuccess(providerId);
          yield { content: "", done: true };
          return;
        }

        const parsed = providerCfg.parseStreamChunk(payload);
        if (parsed.done) {
          this._markSuccess(providerId);
          yield { content: parsed.content || "", done: true };
          return;
        }
        if (parsed.content) {
          yield { content: parsed.content, done: false };
        }
      }
    }
  }

  // ── Automatic fallback completion ────────────────────────────────────────

  /**
   * Try providers in order until one succeeds.
   * Useful for resilient completions across multiple backends.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options
   * @param {string[]} [providerOrder] - Order of providers to try
   * @returns {Promise<Object>}
   */
  async completeWithFallback(messages, options = {}, providerOrder = null) {
    // Backward-compatible overloaded signature:
    // completeWithFallback({ messages, providerOrder, ...options })
    if (
      messages &&
      typeof messages === "object" &&
      !Array.isArray(messages) &&
      Array.isArray(messages.messages)
    ) {
      const payload = messages;
      providerOrder = payload.providerOrder || providerOrder;
      options = {
        ...payload,
      };
      delete options.messages;
      delete options.providerOrder;
      messages = payload.messages;
    }

    const order = providerOrder || ["openai", "anthropic", "gemini"];
    const configuredOrder = order.filter((p) => this.configured.has(p));

    if (configuredOrder.length === 0) {
      throw new Error(
        "No external providers configured. Configure at least one via POST /external-providers/configure",
      );
    }

    const errors = [];
    for (const providerId of configuredOrder) {
      const callable = this._isProviderCallable(providerId);
      if (!callable.callable) {
        errors.push({
          provider: providerId,
          error: `suppressed (${callable.mode})`,
        });
        continue;
      }
      try {
        const result = await this.complete(providerId, messages, options);
        result.fallbackChain = errors.map((e) => e.provider);
        return result;
      } catch (err) {
        const classification = this._classifyError(err);
        this._markFailure(providerId, err, classification);
        errors.push({
          provider: providerId,
          error: err.message,
          classification,
        });
        this.emit("fallback", { from: providerId, error: err.message });
      }
    }

    throw new Error(
      `All providers failed: ${errors.map((e) => `${e.provider}: ${e.error}`).join("; ")}`,
    );
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _request(url, options) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const client = isHttps ? https : http;

      const reqOpts = {
        method: options.method || "GET",
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: options.headers || {},
      };

      const req = client.request(reqOpts, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString();
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `${reqOpts.method} ${url} returned ${res.statusCode}: ${body.slice(0, 500)}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(
              new Error(`Invalid JSON from ${url}: ${body.slice(0, 200)}`),
            );
          }
        });
      });

      req.setTimeout(
        options.timeoutMs || this.resilienceConfig.requestTimeoutMs,
        () => {
          req.destroy(new Error("Provider request timeout"));
        },
      );
      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  async _requestWithRetry(providerId, url, requestOptions, options = {}) {
    const retries = Math.max(
      0,
      Number.isInteger(options.retryCount)
        ? options.retryCount
        : this.resilienceConfig.retryCount,
    );

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this._request(url, requestOptions);
      } catch (error) {
        lastError = error;
        const classification = this._classifyError(error);
        const canRetry =
          attempt < retries && this._isRetryableClassification(classification);
        if (!canRetry) {
          throw error;
        }
        const delay = Math.min(
          (this.resilienceConfig.retryBackoffMs || 300) * 2 ** attempt,
          3000,
        );
        this.emit("provider-retry", {
          providerId,
          attempt: attempt + 1,
          delay,
          classification,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError || new Error("Provider request failed");
  }
}

const externalProviders = new ExternalProviderManager();

module.exports = {
  ExternalProviderManager,
  externalProviders,
  PROVIDER_CONFIGS,
};
