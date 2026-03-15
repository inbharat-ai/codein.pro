"use strict";

/**
 * Google Gemini Native Adapter
 *
 * Handles Gemini's REST API which differs from the OpenAI format:
 * - Auth via ?key= query parameter (not Bearer token)
 * - Different message format (contents with parts)
 * - Different endpoint structure (/models/{model}:generateContent)
 *
 * Uses native Node.js fetch (Node 18+). No external dependencies.
 */

const USER_AGENT = "CodeIn-Agent/1.0";

/** Redact an API key for safe logging — show last 4 chars only */
function redactKey(key) {
  if (!key || key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

/** Build a normalized error object */
function makeError(code, message, provider, rawError) {
  return {
    error: true,
    code,
    message,
    provider,
    details: rawError ? String(rawError) : undefined,
  };
}

/**
 * Convert OpenAI-style messages to Gemini "contents" format.
 *
 * OpenAI:  [{ role: "system", content: "..." }, { role: "user", content: "..." }]
 * Gemini:  { systemInstruction: {...}, contents: [{ role: "user", parts: [{text: "..."}] }] }
 */
function convertMessagesToGemini(messages) {
  let systemInstruction = null;
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = { parts: [{ text: msg.content }] };
      continue;
    }

    const role = msg.role === "assistant" ? "model" : "user";

    // Handle multimodal content
    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url") {
          // Base64 inline image
          const url = part.image_url?.url || "";
          const match = url.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
          if (match) {
            parts.push({
              inlineData: { mimeType: match[1], data: match[2] },
            });
          }
        }
      }
      contents.push({ role, parts });
    } else {
      contents.push({ role, parts: [{ text: msg.content || "" }] });
    }
  }

  return { systemInstruction, contents };
}

class GeminiAdapter {
  /**
   * @param {object} providerDef - Provider definition from PROVIDERS registry
   * @param {() => string|null} getKey - Function returning the current API key
   */
  constructor(providerDef, getKey) {
    this._provider = providerDef;
    this._getKey = getKey;
  }

  /** @private Safely redact the key from any error string */
  _redactError(msg) {
    const key = this._getKey();
    if (key && typeof msg === "string" && msg.includes(key)) {
      return msg.replaceAll(key, redactKey(key));
    }
    return msg;
  }

  /** Test connectivity with a lightweight request */
  async testConnection() {
    const start = Date.now();
    try {
      const key = this._getKey();
      if (!key) {
        return {
          success: false,
          latencyMs: 0,
          error: "No API key configured for Gemini",
          modelCount: 0,
        };
      }

      const url = `${this._provider.baseUrl}/models?key=${key}`;
      const resp = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });

      const latencyMs = Date.now() - start;

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        return {
          success: false,
          latencyMs,
          error: this._redactError(
            `HTTP ${resp.status}: ${body.slice(0, 200)}`,
          ),
          modelCount: 0,
        };
      }

      const data = await resp.json();
      const modelCount = Array.isArray(data.models) ? data.models.length : 0;

      return { success: true, latencyMs, error: null, modelCount };
    } catch (err) {
      const latencyMs = Date.now() - start;
      return {
        success: false,
        latencyMs,
        error: this._redactError(err.message || String(err)),
        modelCount: 0,
      };
    }
  }

  /** Fetch and normalize available models */
  async fetchModels() {
    try {
      const key = this._getKey();
      if (!key) {
        return makeError(
          "NO_KEY",
          "No API key configured for Gemini",
          this._provider.id,
        );
      }

      const url = `${this._provider.baseUrl}/models?key=${key}`;
      const resp = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30000),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        return makeError(
          "FETCH_MODELS_FAILED",
          this._redactError(`HTTP ${resp.status}: ${body.slice(0, 200)}`),
          this._provider.id,
        );
      }

      const data = await resp.json();
      const rawModels = Array.isArray(data.models) ? data.models : [];

      // Filter to generative models only
      return rawModels
        .filter(
          (m) =>
            m.supportedGenerationMethods?.includes("generateContent") ||
            (m.name && m.name.includes("gemini")),
        )
        .map((m) => this._normalizeModel(m));
    } catch (err) {
      return makeError(
        "FETCH_MODELS_ERROR",
        this._redactError(err.message || String(err)),
        this._provider.id,
        err,
      );
    }
  }

  /** @private Normalize a single Gemini model */
  _normalizeModel(raw) {
    // Gemini model names are like "models/gemini-1.5-pro"
    const fullName = raw.name || "unknown";
    const id = fullName.replace(/^models\//, "");
    const name = raw.displayName || id;

    const contextWindow = raw.inputTokenLimit || raw.outputTokenLimit || null;

    const capabilities = [];
    if (this._provider.capabilities) {
      capabilities.push(...this._provider.capabilities);
    }

    return {
      id,
      name,
      provider: this._provider.id,
      contextWindow,
      pricing: { input: null, output: null }, // Gemini doesn't expose pricing via API
      capabilities,
      version: raw.version || null,
      supportedMethods: raw.supportedGenerationMethods || [],
    };
  }

  /** Chat completion (non-streaming) */
  async chatCompletion(messages, opts = {}) {
    try {
      const key = this._getKey();
      if (!key) {
        return makeError(
          "NO_KEY",
          "No API key configured for Gemini",
          this._provider.id,
        );
      }

      const model = opts.model || "gemini-2.0-flash";
      const url = `${this._provider.baseUrl}/models/${model}:generateContent?key=${key}`;

      const { systemInstruction, contents } = convertMessagesToGemini(messages);

      const body = { contents };
      if (systemInstruction) {
        body.systemInstruction = systemInstruction;
      }

      // Generation config
      body.generationConfig = {};
      if (opts.temperature != null)
        body.generationConfig.temperature = opts.temperature;
      if (opts.maxTokens)
        body.generationConfig.maxOutputTokens = opts.maxTokens;
      if (opts.top_p != null) body.generationConfig.topP = opts.top_p;
      if (opts.stop) body.generationConfig.stopSequences = opts.stop;

      // Tool calling
      if (opts.tools) {
        body.tools = [
          {
            functionDeclarations: opts.tools.map((t) => ({
              name: t.function?.name || t.name,
              description: t.function?.description || t.description || "",
              parameters: t.function?.parameters || t.parameters || {},
            })),
          },
        ];
      }

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeout || 120000),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        return makeError(
          "CHAT_COMPLETION_FAILED",
          this._redactError(`HTTP ${resp.status}: ${errBody.slice(0, 500)}`),
          this._provider.id,
        );
      }

      const data = await resp.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Extract text content
      const textParts = parts.filter((p) => p.text).map((p) => p.text);
      const content = textParts.join("");

      // Extract function calls
      const functionCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => ({
          name: p.functionCall.name,
          arguments: JSON.stringify(p.functionCall.args || {}),
        }));

      // Map Gemini finish reason to OpenAI-style
      const geminiReason = candidate?.finishReason || "STOP";
      const finishReasonMap = {
        STOP: "stop",
        MAX_TOKENS: "length",
        SAFETY: "content_filter",
        RECITATION: "content_filter",
        OTHER: "stop",
      };

      return {
        content,
        model,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount || 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
        },
        finishReason: finishReasonMap[geminiReason] || "stop",
        toolCalls:
          functionCalls.length > 0
            ? functionCalls.map((fc, i) => ({
                id: `call_${i}`,
                type: "function",
                function: fc,
              }))
            : null,
      };
    } catch (err) {
      return makeError(
        "CHAT_COMPLETION_ERROR",
        this._redactError(err.message || String(err)),
        this._provider.id,
        err,
      );
    }
  }

  /** Chat completion (streaming) */
  async *chatCompletionStream(messages, opts = {}) {
    const key = this._getKey();
    if (!key) {
      yield {
        content: "",
        done: true,
        finishReason: "error",
        error: "No API key configured for Gemini",
      };
      return;
    }

    const model = opts.model || "gemini-2.0-flash";
    const url = `${this._provider.baseUrl}/models/${model}:streamGenerateContent?key=${key}&alt=sse`;

    const { systemInstruction, contents } = convertMessagesToGemini(messages);

    const body = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    body.generationConfig = {};
    if (opts.temperature != null)
      body.generationConfig.temperature = opts.temperature;
    if (opts.maxTokens) body.generationConfig.maxOutputTokens = opts.maxTokens;
    if (opts.top_p != null) body.generationConfig.topP = opts.top_p;

    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeout || 120000),
      });
    } catch (err) {
      yield {
        content: "",
        done: true,
        finishReason: "error",
        error: this._redactError(err.message || String(err)),
      };
      return;
    }

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      yield {
        content: "",
        done: true,
        finishReason: "error",
        error: this._redactError(
          `HTTP ${resp.status}: ${errBody.slice(0, 500)}`,
        ),
      };
      return;
    }

    const reader = resp.body;
    if (!reader) {
      yield {
        content: "",
        done: true,
        finishReason: "error",
        error: "No response body",
      };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of reader) {
      buffer +=
        typeof chunk === "string"
          ? chunk
          : decoder.decode(chunk, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          yield { content: "", done: true, finishReason: "stop" };
          return;
        }

        try {
          const parsed = JSON.parse(payload);
          const candidate = parsed.candidates?.[0];
          const parts = candidate?.content?.parts || [];
          const text = parts
            .filter((p) => p.text)
            .map((p) => p.text)
            .join("");

          if (text) {
            yield { content: text, done: false, finishReason: null };
          }

          if (candidate?.finishReason && candidate.finishReason !== "STOP") {
            // non-stop finish
          }
          if (candidate?.finishReason === "STOP") {
            yield { content: "", done: true, finishReason: "stop" };
            return;
          }
        } catch {
          // Malformed SSE chunk — skip
        }
      }
    }

    // Stream ended
    yield { content: "", done: true, finishReason: "stop" };
  }
}

module.exports = { GeminiAdapter, convertMessagesToGemini };
