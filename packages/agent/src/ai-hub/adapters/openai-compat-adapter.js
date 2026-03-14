"use strict";

/**
 * OpenAI-Compatible Adapter
 *
 * Handles providers that implement the OpenAI API contract:
 * - OpenRouter (https://openrouter.ai/api/v1)
 * - Groq (https://api.groq.com/openai/v1)
 *
 * Uses native Node.js fetch (Node 18+). No external dependencies.
 */

const USER_AGENT = "CodIn-Agent/1.0";

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

class OpenAICompatAdapter {
  /**
   * @param {object} providerDef - Provider definition from PROVIDERS registry
   * @param {() => string|null} getKey - Function returning the current API key
   */
  constructor(providerDef, getKey) {
    this._provider = providerDef;
    this._getKey = getKey;
  }

  /** @private */
  _headers() {
    const key = this._getKey();
    // Providers with authType "none" (e.g. Ollama) don't need an API key
    if (!key && this._provider.authType !== "none") {
      throw new Error(
        `No API key configured for ${this._provider.displayName}`,
      );
    }
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    };
    // Only set Authorization header when a key is present
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    }
    // OpenRouter recommends HTTP-Referer and X-Title headers
    if (this._provider.id === "openrouter") {
      headers["HTTP-Referer"] = "https://codin.dev";
      headers["X-Title"] = "CodIn IDE";
    }
    return headers;
  }

  /** Test connectivity with a lightweight request */
  async testConnection() {
    const start = Date.now();
    try {
      const url = `${this._provider.baseUrl}/models`;
      const resp = await fetch(url, {
        method: "GET",
        headers: this._headers(),
        signal: AbortSignal.timeout(15000),
      });

      const latencyMs = Date.now() - start;

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        return {
          success: false,
          latencyMs,
          error: `HTTP ${resp.status}: ${body.slice(0, 200)}`,
          modelCount: 0,
        };
      }

      const data = await resp.json();
      const modelCount = Array.isArray(data.data) ? data.data.length : 0;

      return { success: true, latencyMs, error: null, modelCount };
    } catch (err) {
      const latencyMs = Date.now() - start;
      // Redact any key that might appear in the error message
      const key = this._getKey();
      let msg = err.message || String(err);
      if (key && msg.includes(key)) {
        msg = msg.replaceAll(key, redactKey(key));
      }
      return { success: false, latencyMs, error: msg, modelCount: 0 };
    }
  }

  /** Fetch and normalize available models */
  async fetchModels() {
    try {
      const url = `${this._provider.baseUrl}/models`;
      const resp = await fetch(url, {
        method: "GET",
        headers: this._headers(),
        signal: AbortSignal.timeout(30000),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        return makeError(
          "FETCH_MODELS_FAILED",
          `HTTP ${resp.status}: ${body.slice(0, 200)}`,
          this._provider.id,
        );
      }

      const data = await resp.json();
      const rawModels = Array.isArray(data.data) ? data.data : [];

      return rawModels.map((m) => this._normalizeModel(m));
    } catch (err) {
      const key = this._getKey();
      let msg = err.message || String(err);
      if (key && msg.includes(key)) {
        msg = msg.replaceAll(key, redactKey(key));
      }
      return makeError("FETCH_MODELS_ERROR", msg, this._provider.id, err);
    }
  }

  /** @private Normalize a single model from OpenAI /models response */
  _normalizeModel(raw) {
    const id = raw.id || raw.name || "unknown";
    const name = raw.name || raw.id || "Unknown Model";

    // OpenRouter provides pricing in its model objects
    let pricing = { input: null, output: null };
    if (raw.pricing) {
      pricing = {
        input: parseFloat(raw.pricing.prompt) || null,
        output: parseFloat(raw.pricing.completion) || null,
      };
    }

    // Context window — OpenRouter uses context_length, Groq uses context_window
    const contextWindow =
      raw.context_length || raw.context_window || raw.max_model_len || null;

    // Derive capabilities from model metadata
    const capabilities = [];
    if (this._provider.capabilities) {
      capabilities.push(...this._provider.capabilities);
    }

    return {
      id,
      name,
      provider: this._provider.id,
      contextWindow,
      pricing,
      capabilities,
      owned_by: raw.owned_by || null,
      created: raw.created || null,
    };
  }

  /** Chat completion (non-streaming) */
  async chatCompletion(messages, opts = {}) {
    try {
      const url = `${this._provider.baseUrl}/chat/completions`;
      const body = {
        model: opts.model || "auto",
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens || 4096,
        stream: false,
      };

      if (opts.tools) body.tools = opts.tools;
      if (opts.tool_choice) body.tool_choice = opts.tool_choice;
      if (opts.response_format) body.response_format = opts.response_format;
      if (opts.stop) body.stop = opts.stop;
      if (opts.top_p != null) body.top_p = opts.top_p;
      if (opts.frequency_penalty != null)
        body.frequency_penalty = opts.frequency_penalty;
      if (opts.presence_penalty != null)
        body.presence_penalty = opts.presence_penalty;

      const resp = await fetch(url, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeout || 120000),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        return makeError(
          "CHAT_COMPLETION_FAILED",
          `HTTP ${resp.status}: ${errBody.slice(0, 500)}`,
          this._provider.id,
        );
      }

      const data = await resp.json();
      const choice = data.choices?.[0];

      return {
        content: choice?.message?.content || "",
        model: data.model || opts.model,
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
        },
        finishReason: choice?.finish_reason || "unknown",
        toolCalls: choice?.message?.tool_calls || null,
      };
    } catch (err) {
      const key = this._getKey();
      let msg = err.message || String(err);
      if (key && msg.includes(key)) {
        msg = msg.replaceAll(key, redactKey(key));
      }
      return makeError("CHAT_COMPLETION_ERROR", msg, this._provider.id, err);
    }
  }

  /** Chat completion (streaming) */
  async *chatCompletionStream(messages, opts = {}) {
    const url = `${this._provider.baseUrl}/chat/completions`;
    const body = {
      model: opts.model || "auto",
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens || 4096,
      stream: true,
    };

    if (opts.tools) body.tools = opts.tools;
    if (opts.tool_choice) body.tool_choice = opts.tool_choice;
    if (opts.stop) body.stop = opts.stop;
    if (opts.top_p != null) body.top_p = opts.top_p;

    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeout || 120000),
      });
    } catch (err) {
      const key = this._getKey();
      let msg = err.message || String(err);
      if (key && msg.includes(key)) {
        msg = msg.replaceAll(key, redactKey(key));
      }
      yield { content: "", done: true, finishReason: "error", error: msg };
      return;
    }

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      yield {
        content: "",
        done: true,
        finishReason: "error",
        error: `HTTP ${resp.status}: ${errBody.slice(0, 500)}`,
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
          const delta = parsed.choices?.[0]?.delta;
          const finishReason = parsed.choices?.[0]?.finish_reason;

          if (delta?.content) {
            yield {
              content: delta.content,
              done: false,
              finishReason: null,
            };
          }
          if (finishReason) {
            yield { content: "", done: true, finishReason };
            return;
          }
        } catch {
          // Malformed SSE chunk — skip
        }
      }
    }

    // Stream ended without [DONE]
    yield { content: "", done: true, finishReason: "stop" };
  }
}

module.exports = { OpenAICompatAdapter };
