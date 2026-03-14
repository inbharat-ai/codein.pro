"use strict";
const crypto = require("node:crypto");

// Provider capability flags
const CAPABILITY = Object.freeze({
  CHAT: "chat",
  STREAMING: "streaming",
  FUNCTION_CALLING: "function_calling",
  VISION: "vision",
  REASONING: "reasoning",
  CODE: "code",
  EMBEDDINGS: "embeddings",
});

// Provider definitions
const PROVIDERS = Object.freeze({
  openrouter: {
    id: "openrouter",
    displayName: "OpenRouter",
    authType: "bearer",
    baseUrl: "https://openrouter.ai/api/v1",
    compatibilityMode: "openai",
    modelDiscovery: "api",
    capabilities: [
      CAPABILITY.CHAT,
      CAPABILITY.STREAMING,
      CAPABILITY.FUNCTION_CALLING,
      CAPABILITY.VISION,
      CAPABILITY.REASONING,
      CAPABILITY.CODE,
    ],
    streaming: true,
    description:
      "Multi-model aggregator \u2014 access 200+ models from one API key",
  },
  groq: {
    id: "groq",
    displayName: "Groq",
    authType: "bearer",
    baseUrl: "https://api.groq.com/openai/v1",
    compatibilityMode: "openai",
    modelDiscovery: "api",
    capabilities: [
      CAPABILITY.CHAT,
      CAPABILITY.STREAMING,
      CAPABILITY.FUNCTION_CALLING,
      CAPABILITY.CODE,
    ],
    streaming: true,
    description: "Ultra-fast inference \u2014 lowest latency for agent loops",
  },
  gemini: {
    id: "gemini",
    displayName: "Google Gemini",
    authType: "bearer",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    compatibilityMode: "gemini",
    modelDiscovery: "api",
    capabilities: [
      CAPABILITY.CHAT,
      CAPABILITY.STREAMING,
      CAPABILITY.FUNCTION_CALLING,
      CAPABILITY.VISION,
      CAPABILITY.REASONING,
      CAPABILITY.CODE,
    ],
    streaming: true,
    description:
      "Google's frontier models \u2014 strong reasoning and multimodal",
  },
  ollama: {
    id: "ollama",
    displayName: "Ollama (Local)",
    authType: "none",
    baseUrl: "http://localhost:11434/v1",
    compatibilityMode: "openai",
    modelDiscovery: "api",
    capabilities: [CAPABILITY.CHAT, CAPABILITY.STREAMING, CAPABILITY.CODE],
    streaming: true,
    description: "Local AI inference \u2014 private, free, no API key needed",
  },
});

class ProviderRegistry {
  constructor() {
    /** @type {Map<string, {key: string, enabled: boolean, addedAt: string, lastTestedAt: string|null, lastTestResult: object|null}>} */
    this._keys = new Map();
    /** @type {Map<string, {status: string, lastCheck: string|null, latencyMs: number|null, error: string|null}>} */
    this._health = new Map();
    /** @type {Map<string, Array>} */
    this._models = new Map();
  }

  /** List all known providers with their current state */
  listProviders() {
    const result = [];
    for (const [id, def] of Object.entries(PROVIDERS)) {
      const keyEntry = this._keys.get(id);
      const health = this._health.get(id) || {
        status: "unknown",
        lastCheck: null,
        latencyMs: null,
        error: null,
      };
      result.push({
        ...def,
        configured: !!keyEntry,
        enabled: keyEntry ? keyEntry.enabled : false,
        keyHint: keyEntry ? keyEntry.key.slice(-4) : null,
        addedAt: keyEntry ? keyEntry.addedAt : null,
        lastTestedAt: keyEntry ? keyEntry.lastTestedAt : null,
        lastTestResult: keyEntry ? keyEntry.lastTestResult : null,
        health,
        modelCount: (this._models.get(id) || []).length,
      });
    }
    return result;
  }

  /** Get a single provider's full status */
  getProvider(id) {
    const def = PROVIDERS[id];
    if (!def) {
      return null;
    }
    const keyEntry = this._keys.get(id);
    const health = this._health.get(id) || {
      status: "unknown",
      lastCheck: null,
      latencyMs: null,
      error: null,
    };
    return {
      ...def,
      configured: !!keyEntry,
      enabled: keyEntry ? keyEntry.enabled : false,
      keyHint: keyEntry ? keyEntry.key.slice(-4) : null,
      addedAt: keyEntry ? keyEntry.addedAt : null,
      lastTestedAt: keyEntry ? keyEntry.lastTestedAt : null,
      lastTestResult: keyEntry ? keyEntry.lastTestResult : null,
      health,
      models: this._models.get(id) || [],
      modelCount: (this._models.get(id) || []).length,
    };
  }

  /** Set API key for a provider */
  setKey(providerId, apiKey) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const def = PROVIDERS[providerId];
    // Providers with authType "none" (e.g. Ollama) don't require a key
    if (def.authType !== "none") {
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
        throw new Error("API key must be a non-empty string");
      }
    }
    const existing = this._keys.get(providerId);
    this._keys.set(providerId, {
      key: apiKey ? String(apiKey).trim() : "",
      enabled: existing ? existing.enabled : true,
      addedAt: existing ? existing.addedAt : new Date().toISOString(),
      lastTestedAt: existing ? existing.lastTestedAt : null,
      lastTestResult: existing ? existing.lastTestResult : null,
      autoDetected: false,
    });
  }

  /** Enable a provider without a key (for authType: "none" providers like Ollama) */
  enableWithoutKey(providerId, opts = {}) {
    const def = PROVIDERS[providerId];
    if (!def) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    if (def.authType !== "none") {
      throw new Error(`Provider ${providerId} requires an API key`);
    }
    const existing = this._keys.get(providerId);
    this._keys.set(providerId, {
      key: "",
      enabled: existing ? existing.enabled : true,
      addedAt: existing ? existing.addedAt : new Date().toISOString(),
      lastTestedAt: existing ? existing.lastTestedAt : null,
      lastTestResult: existing ? existing.lastTestResult : null,
      autoDetected: !!opts.autoDetected,
    });
  }

  /** Remove API key and disable provider */
  removeKey(providerId) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const existed = this._keys.has(providerId);
    this._keys.delete(providerId);
    this._health.delete(providerId);
    this._models.delete(providerId);
    return existed;
  }

  /** Enable/disable a provider */
  setEnabled(providerId, enabled) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const entry = this._keys.get(providerId);
    if (!entry) {
      // For authType "none" providers, auto-enable without a key
      const def = PROVIDERS[providerId];
      if (def.authType === "none" && enabled) {
        this.enableWithoutKey(providerId);
        return;
      }
      throw new Error(
        `Provider ${providerId} has no API key configured \u2014 set a key first`,
      );
    }
    entry.enabled = !!enabled;
  }

  /** Get API key for internal use only — NEVER expose to UI */
  _getKey(providerId) {
    const entry = this._keys.get(providerId);
    return entry ? entry.key : null;
  }

  /** Get a safe display version of the key (last 4 chars) */
  getKeyHint(providerId) {
    const entry = this._keys.get(providerId);
    if (!entry) return null;
    const key = entry.key;
    if (key.length <= 4) return "****";
    return "\u2022".repeat(Math.min(key.length - 4, 12)) + key.slice(-4);
  }

  /** Update health status for a provider */
  _updateHealth(providerId, status, latencyMs, error) {
    this._health.set(providerId, {
      status,
      lastCheck: new Date().toISOString(),
      latencyMs: latencyMs != null ? Math.round(latencyMs) : null,
      error: error || null,
    });
    // Also update the key entry test timestamp
    const keyEntry = this._keys.get(providerId);
    if (keyEntry) {
      keyEntry.lastTestedAt = new Date().toISOString();
      keyEntry.lastTestResult = { status, latencyMs, error: error || null };
    }
  }

  /** Store normalized models for a provider */
  _setModels(providerId, models) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    this._models.set(providerId, Array.isArray(models) ? models : []);
  }

  /** Get cached models for a provider */
  getModels(providerId) {
    if (!PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    return this._models.get(providerId) || [];
  }

  /** Get all models across all enabled providers */
  getAllModels() {
    const allModels = [];
    for (const [providerId, models] of this._models.entries()) {
      const keyEntry = this._keys.get(providerId);
      if (keyEntry && keyEntry.enabled) {
        allModels.push(...models);
      }
    }
    return allModels;
  }

  /** Shutdown / cleanup */
  shutdown() {
    this._keys.clear();
    this._health.clear();
    this._models.clear();
  }
}

module.exports = { ProviderRegistry, PROVIDERS, CAPABILITY };
