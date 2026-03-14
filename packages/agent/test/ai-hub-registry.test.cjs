"use strict";
const assert = require("node:assert/strict");

const {
  ProviderRegistry,
  PROVIDERS,
  CAPABILITY,
} = require("../src/ai-hub/provider-registry");

// ── Provider listing ──

test("Provider registry lists all 4 providers", () => {
  const registry = new ProviderRegistry();
  const providers = registry.listProviders();
  assert.equal(providers.length, 4);
  const ids = providers.map((p) => p.id);
  assert.ok(ids.includes("openrouter"));
  assert.ok(ids.includes("groq"));
  assert.ok(ids.includes("gemini"));
  assert.ok(ids.includes("ollama"));
});

test("PROVIDERS object is frozen at top level", () => {
  assert.ok(Object.isFrozen(PROVIDERS));
  assert.equal(Object.keys(PROVIDERS).length, 4);
  assert.ok(PROVIDERS.openrouter);
  assert.ok(PROVIDERS.groq);
  assert.ok(PROVIDERS.gemini);
  assert.ok(PROVIDERS.ollama);
});

test("CAPABILITY enum is frozen", () => {
  assert.ok(Object.isFrozen(CAPABILITY));
  assert.equal(CAPABILITY.CHAT, "chat");
  assert.equal(CAPABILITY.STREAMING, "streaming");
});

// ── Set / Get / Remove key flow ──

test("Set/get/remove key flow works correctly", () => {
  const registry = new ProviderRegistry();

  // Initially no key
  assert.equal(registry._getKey("openrouter"), null);
  assert.equal(registry.getKeyHint("openrouter"), null);

  // Set key
  registry.setKey("openrouter", "sk-or-v1-abc123xyz789");
  assert.equal(registry._getKey("openrouter"), "sk-or-v1-abc123xyz789");

  // Remove key
  const existed = registry.removeKey("openrouter");
  assert.equal(existed, true);
  assert.equal(registry._getKey("openrouter"), null);

  // Remove again
  const existedAgain = registry.removeKey("openrouter");
  assert.equal(existedAgain, false);
});

// ── Key hint ──

test("Key hint shows last 4 chars only", () => {
  const registry = new ProviderRegistry();
  registry.setKey("groq", "gsk_abcdefghijklmnop1234");
  const hint = registry.getKeyHint("groq");
  assert.ok(hint.endsWith("1234"));
  // Should not contain the full key
  assert.ok(!hint.includes("gsk_abcdefghijklmnop"));
  // Should contain bullet chars as masking
  assert.ok(hint.includes("\u2022"));
});

test("Key hint for short key returns ****", () => {
  const registry = new ProviderRegistry();
  registry.setKey("groq", "ab");
  const hint = registry.getKeyHint("groq");
  assert.equal(hint, "****");
});

// ── _getKey returns full key ──

test("_getKey returns the full unredacted key", () => {
  const registry = new ProviderRegistry();
  const fullKey = "sk-full-secret-key-value-12345";
  registry.setKey("openrouter", fullKey);
  assert.equal(registry._getKey("openrouter"), fullKey);
});

// ── Enable / Disable provider ──

test("Enable/disable provider works", () => {
  const registry = new ProviderRegistry();
  registry.setKey("gemini", "AIzaSyTest123");

  // Default is enabled
  const p1 = registry.getProvider("gemini");
  assert.equal(p1.enabled, true);

  // Disable
  registry.setEnabled("gemini", false);
  const p2 = registry.getProvider("gemini");
  assert.equal(p2.enabled, false);

  // Re-enable
  registry.setEnabled("gemini", true);
  const p3 = registry.getProvider("gemini");
  assert.equal(p3.enabled, true);
});

test("Cannot enable provider without key", () => {
  const registry = new ProviderRegistry();
  assert.throws(() => registry.setEnabled("openrouter", true), /no API key/i);
});

// ── Disabled provider excluded from active models ──

test("Disabled provider excluded from getAllModels", () => {
  const registry = new ProviderRegistry();

  // Setup two providers with models
  registry.setKey("openrouter", "key1");
  registry.setKey("groq", "key2");
  registry._setModels("openrouter", [{ id: "m1", provider: "openrouter" }]);
  registry._setModels("groq", [{ id: "m2", provider: "groq" }]);

  // Both enabled — should see 2 models
  const all1 = registry.getAllModels();
  assert.equal(all1.length, 2);

  // Disable groq — should see 1 model
  registry.setEnabled("groq", false);
  const all2 = registry.getAllModels();
  assert.equal(all2.length, 1);
  assert.equal(all2[0].id, "m1");
});

// ── Health tracking ──

test("Health tracking updates correctly", () => {
  const registry = new ProviderRegistry();
  registry.setKey("openrouter", "key1");

  registry._updateHealth("openrouter", "healthy", 150, null);
  const provider = registry.getProvider("openrouter");
  assert.equal(provider.health.status, "healthy");
  assert.equal(provider.health.latencyMs, 150);
  assert.equal(provider.health.error, null);
  assert.ok(provider.health.lastCheck);

  // Also updates key entry test timestamp
  assert.ok(provider.lastTestedAt);
  assert.deepEqual(provider.lastTestResult.status, "healthy");
});

test("Health tracking records errors", () => {
  const registry = new ProviderRegistry();
  registry.setKey("groq", "key1");

  registry._updateHealth("groq", "error", 5000, "Connection timeout");
  const provider = registry.getProvider("groq");
  assert.equal(provider.health.status, "error");
  assert.equal(provider.health.error, "Connection timeout");
});

// ── Model storage and retrieval ──

test("Model storage and retrieval works", () => {
  const registry = new ProviderRegistry();
  const models = [
    { id: "gpt-4", name: "GPT-4", provider: "openrouter" },
    { id: "claude-3", name: "Claude 3", provider: "openrouter" },
  ];
  registry._setModels("openrouter", models);

  const retrieved = registry.getModels("openrouter");
  assert.equal(retrieved.length, 2);
  assert.equal(retrieved[0].id, "gpt-4");
  assert.equal(retrieved[1].id, "claude-3");
});

test("getModels returns empty array for provider with no models", () => {
  const registry = new ProviderRegistry();
  const models = registry.getModels("groq");
  assert.deepEqual(models, []);
});

// ── getAllModels aggregation ──

test("getAllModels aggregates across providers", () => {
  const registry = new ProviderRegistry();
  registry.setKey("openrouter", "k1");
  registry.setKey("groq", "k2");
  registry.setKey("gemini", "k3");

  registry._setModels("openrouter", [
    { id: "m1", provider: "openrouter" },
    { id: "m2", provider: "openrouter" },
  ]);
  registry._setModels("groq", [{ id: "m3", provider: "groq" }]);
  registry._setModels("gemini", [{ id: "m4", provider: "gemini" }]);

  const all = registry.getAllModels();
  assert.equal(all.length, 4);
});

// ── Unknown provider ID rejected ──

test("Unknown provider ID rejected for setKey", () => {
  const registry = new ProviderRegistry();
  assert.throws(() => registry.setKey("unknown", "key"), /Unknown provider/);
});

test("Unknown provider ID rejected for removeKey", () => {
  const registry = new ProviderRegistry();
  assert.throws(() => registry.removeKey("unknown"), /Unknown provider/);
});

test("Unknown provider ID rejected for setEnabled", () => {
  const registry = new ProviderRegistry();
  assert.throws(
    () => registry.setEnabled("unknown", true),
    /Unknown provider/,
  );
});

test("Unknown provider ID rejected for getModels", () => {
  const registry = new ProviderRegistry();
  assert.throws(() => registry.getModels("unknown"), /Unknown provider/);
});

test("Unknown provider ID rejected for _setModels", () => {
  const registry = new ProviderRegistry();
  assert.throws(
    () => registry._setModels("unknown", []),
    /Unknown provider/,
  );
});

test("getProvider returns null for unknown ID", () => {
  const registry = new ProviderRegistry();
  assert.equal(registry.getProvider("unknown"), null);
});

// ── Empty key rejected ──

test("Empty key rejected", () => {
  const registry = new ProviderRegistry();
  assert.throws(() => registry.setKey("openrouter", ""), /non-empty/);
  assert.throws(() => registry.setKey("openrouter", "   "), /non-empty/);
  assert.throws(() => registry.setKey("openrouter", null), /non-empty/);
  assert.throws(() => registry.setKey("openrouter", undefined), /non-empty/);
});

// ── Ollama (authType: "none") ──

test("Ollama provider has authType none", () => {
  assert.equal(PROVIDERS.ollama.authType, "none");
  assert.equal(PROVIDERS.ollama.compatibilityMode, "openai");
});

test("Ollama can be enabled without a key via enableWithoutKey", () => {
  const registry = new ProviderRegistry();
  registry.enableWithoutKey("ollama", { autoDetected: true });

  const provider = registry.getProvider("ollama");
  assert.equal(provider.configured, true);
  assert.equal(provider.enabled, true);
});

test("enableWithoutKey rejects providers that require a key", () => {
  const registry = new ProviderRegistry();
  assert.throws(() => registry.enableWithoutKey("openrouter"), /requires an API key/);
});

test("Ollama can be enabled via setEnabled without prior key", () => {
  const registry = new ProviderRegistry();
  // setEnabled should auto-enable for authType "none" providers
  registry.setEnabled("ollama", true);
  const provider = registry.getProvider("ollama");
  assert.equal(provider.configured, true);
  assert.equal(provider.enabled, true);
});

// ── Shutdown cleanup ──

test("Shutdown clears all state", () => {
  const registry = new ProviderRegistry();
  registry.setKey("openrouter", "key1");
  registry._setModels("openrouter", [{ id: "m1" }]);
  registry._updateHealth("openrouter", "healthy", 100, null);

  registry.shutdown();

  assert.equal(registry._getKey("openrouter"), null);
  assert.equal(registry.getKeyHint("openrouter"), null);
  // Models cleared (getModels still works — returns empty since no key)
  const provider = registry.getProvider("openrouter");
  assert.equal(provider.configured, false);
  assert.equal(provider.modelCount, 0);
});

// ── Provider listing shows correct configured state ──

test("listProviders shows configured and unconfigured providers", () => {
  const registry = new ProviderRegistry();
  registry.setKey("groq", "gsk_test");

  const providers = registry.listProviders();
  const groq = providers.find((p) => p.id === "groq");
  const openrouter = providers.find((p) => p.id === "openrouter");

  assert.equal(groq.configured, true);
  assert.equal(groq.enabled, true);
  assert.ok(groq.keyHint);

  assert.equal(openrouter.configured, false);
  assert.equal(openrouter.enabled, false);
  assert.equal(openrouter.keyHint, null);
});
