"use strict";

/**
 * AI Hub Manager
 *
 * Central orchestrator for multi-provider AI API access.
 * Ties together the provider registry with adapters for OpenRouter, Groq, and Gemini.
 */

const { ProviderRegistry, PROVIDERS } = require("./provider-registry");
const { OpenAICompatAdapter } = require("./adapters/openai-compat-adapter");
const { GeminiAdapter } = require("./adapters/gemini-adapter");

// Environment variable names for each provider (authType: "bearer" only)
const ENV_KEY_MAP = {
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
};

// Default Ollama endpoint for auto-detection
const OLLAMA_BASE = "http://localhost:11434";

class AIHubManager {
  constructor() {
    this._registry = new ProviderRegistry();
    /** @type {Map<string, OpenAICompatAdapter|GeminiAdapter>} */
    this._adapters = new Map();
  }

  /** Initialize adapters for all providers that have keys */
  init() {
    for (const providerId of Object.keys(PROVIDERS)) {
      const key = this._registry._getKey(providerId);
      if (key) {
        this._createAdapter(providerId);
      }
    }
  }

  /** @private Create the appropriate adapter for a provider */
  _createAdapter(providerId) {
    const def = PROVIDERS[providerId];
    if (!def) return;

    const getKey = () => this._registry._getKey(providerId);

    if (def.compatibilityMode === "openai") {
      this._adapters.set(providerId, new OpenAICompatAdapter(def, getKey));
    } else if (def.compatibilityMode === "gemini") {
      this._adapters.set(providerId, new GeminiAdapter(def, getKey));
    }
  }

  /** Set key and create adapter */
  async setProviderKey(providerId, apiKey) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    this._registry.setKey(providerId, apiKey);
    this._createAdapter(providerId);
    return { success: true, provider: providerId };
  }

  /** Remove key and destroy adapter */
  removeProviderKey(providerId) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    this._adapters.delete(providerId);
    const existed = this._registry.removeKey(providerId);
    return { success: true, provider: providerId, hadKey: existed };
  }

  /** Test a provider connection */
  async testProvider(providerId) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const adapter = this._adapters.get(providerId);
    if (!adapter) {
      return {
        success: false,
        error: `Provider ${providerId} has no API key configured`,
        latencyMs: 0,
        modelCount: 0,
      };
    }

    const result = await adapter.testConnection();

    // Update health in registry
    this._registry._updateHealth(
      providerId,
      result.success ? "healthy" : "error",
      result.latencyMs,
      result.error,
    );

    return result;
  }

  /** Fetch models for a provider */
  async fetchModels(providerId) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const adapter = this._adapters.get(providerId);
    if (!adapter) {
      return {
        error: true,
        code: "NO_ADAPTER",
        message: `Provider ${providerId} has no API key configured`,
        provider: providerId,
      };
    }

    const result = await adapter.fetchModels();

    // If successful (array returned), store in registry
    if (Array.isArray(result)) {
      this._registry._setModels(providerId, result);
    }

    return result;
  }

  /** Get provider status/health/models */
  getProviderStatus(providerId) {
    return this._registry.getProvider(providerId);
  }

  /** List all providers with status */
  listProviders() {
    return this._registry.listProviders();
  }

  /** Get all available models across providers */
  getAllModels() {
    return this._registry.getAllModels();
  }

  /** Enable a provider */
  enableProvider(providerId) {
    this._registry.setEnabled(providerId, true);
    return { success: true, provider: providerId, enabled: true };
  }

  /** Disable a provider */
  disableProvider(providerId) {
    this._registry.setEnabled(providerId, false);
    return { success: true, provider: providerId, enabled: false };
  }

  /** Route a chat completion to a specific provider */
  async chatCompletion(providerId, messages, opts = {}) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const adapter = this._adapters.get(providerId);
    if (!adapter) {
      return {
        error: true,
        code: "NO_ADAPTER",
        message: `Provider ${providerId} is not configured`,
        provider: providerId,
      };
    }

    const keyEntry = this._registry._keys
      ? this._registry._getKey(providerId)
      : null;
    if (!keyEntry) {
      return {
        error: true,
        code: "NO_KEY",
        message: `No API key for provider ${providerId}`,
        provider: providerId,
      };
    }

    return adapter.chatCompletion(messages, opts);
  }

  /** Route a streaming chat completion */
  async *chatCompletionStream(providerId, messages, opts = {}) {
    if (!PROVIDERS[providerId]) {
      yield {
        content: "",
        done: true,
        finishReason: "error",
        error: `Unknown provider: ${providerId}`,
      };
      return;
    }
    const adapter = this._adapters.get(providerId);
    if (!adapter) {
      yield {
        content: "",
        done: true,
        finishReason: "error",
        error: `Provider ${providerId} is not configured`,
      };
      return;
    }

    yield* adapter.chatCompletionStream(messages, opts);
  }

  /** Auto-initialize from environment variables */
  initFromEnv() {
    let configured = 0;

    for (const [providerId, envNames] of Object.entries(ENV_KEY_MAP)) {
      const names = Array.isArray(envNames) ? envNames : [envNames];
      for (const envName of names) {
        const val = process.env[envName];
        if (val && val.trim().length > 0) {
          try {
            this._registry.setKey(providerId, val.trim());
            this._createAdapter(providerId);
            configured++;
          } catch {
            // Skip invalid keys silently
          }
          break; // Use the first env var found for this provider
        }
      }
    }

    return { configured, total: Object.keys(PROVIDERS).length };
  }

  /** Auto-detect and enable Ollama if running locally */
  async detectOllama() {
    try {
      const resp = await fetch(OLLAMA_BASE, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        this._registry.enableWithoutKey("ollama", { autoDetected: true });
        this._createAdapter("ollama");
        return { detected: true, baseUrl: OLLAMA_BASE };
      }
    } catch {
      // Ollama not running — skip silently
    }
    return { detected: false, baseUrl: OLLAMA_BASE };
  }

  /** Extended initFromEnv that also auto-detects Ollama */
  async initFromEnvAsync() {
    const envResult = this.initFromEnv();
    const ollamaResult = await this.detectOllama();
    return {
      ...envResult,
      configured: envResult.configured + (ollamaResult.detected ? 1 : 0),
      ollama: ollamaResult,
    };
  }

  /** Shutdown / cleanup */
  shutdown() {
    this._adapters.clear();
    this._registry.shutdown();
  }
}

module.exports = { AIHubManager };
