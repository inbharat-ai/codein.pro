"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { AIHubManager } = require("../src/ai-hub/hub-manager");

// ── Mock fetch setup ──
function mockFetch(handler) {
  const original = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = original;
  };
}

// ── Initialization ──

test("Manager initializes with empty state", () => {
  const manager = new AIHubManager();
  const providers = manager.listProviders();
  assert.equal(providers.length, 4);
  // No providers should be configured
  assert.ok(providers.every((p) => p.configured === false));
  assert.ok(providers.every((p) => p.enabled === false));
  // No models
  const models = manager.getAllModels();
  assert.equal(models.length, 0);
});

// ── Set provider key creates adapter ──

test("Set provider key creates adapter", async () => {
  const manager = new AIHubManager();
  const result = await manager.setProviderKey("openrouter", "sk-test-key");
  assert.equal(result.success, true);
  assert.equal(result.provider, "openrouter");

  // Adapter should exist
  assert.ok(manager._adapters.has("openrouter"));

  // Provider should show as configured
  const status = manager.getProviderStatus("openrouter");
  assert.equal(status.configured, true);
  assert.equal(status.enabled, true);
});

test("Set provider key for Gemini creates GeminiAdapter", async () => {
  const manager = new AIHubManager();
  await manager.setProviderKey("gemini", "AIzaSyTest");
  assert.ok(manager._adapters.has("gemini"));
});

test("Set provider key for unknown provider throws", async () => {
  const manager = new AIHubManager();
  await assert.rejects(
    () => manager.setProviderKey("unknown", "key"),
    /Unknown provider/,
  );
});

// ── Test provider ──

test("Test provider returns connectivity result", async () => {
  const restore = mockFetch(async () => ({
    ok: true,
    json: async () => ({ data: [{ id: "m1" }, { id: "m2" }] }),
    text: async () => "",
  }));

  try {
    const manager = new AIHubManager();
    await manager.setProviderKey("openrouter", "sk-test");
    const result = await manager.testProvider("openrouter");
    assert.equal(result.success, true);
    assert.equal(result.modelCount, 2);
    assert.ok(result.latencyMs >= 0);

    // Health should be updated in registry
    const status = manager.getProviderStatus("openrouter");
    assert.equal(status.health.status, "healthy");
  } finally {
    restore();
  }
});

test("Test provider without key returns error", async () => {
  const manager = new AIHubManager();
  const result = await manager.testProvider("openrouter");
  assert.equal(result.success, false);
  assert.ok(result.error.includes("no API key"));
});

test("Test provider with unknown ID throws", async () => {
  const manager = new AIHubManager();
  await assert.rejects(
    () => manager.testProvider("unknown"),
    /Unknown provider/,
  );
});

// ── Remove key ──

test("Remove key destroys adapter", async () => {
  const manager = new AIHubManager();
  await manager.setProviderKey("groq", "gsk-test-key");
  assert.ok(manager._adapters.has("groq"));

  const result = manager.removeProviderKey("groq");
  assert.equal(result.success, true);
  assert.equal(result.hadKey, true);
  assert.ok(!manager._adapters.has("groq"));

  // Provider status should show unconfigured
  const status = manager.getProviderStatus("groq");
  assert.equal(status.configured, false);
});

test("Remove key for unknown provider throws", () => {
  const manager = new AIHubManager();
  assert.throws(() => manager.removeProviderKey("unknown"), /Unknown provider/);
});

// ── List providers ──

test("List providers shows all with status", async () => {
  const manager = new AIHubManager();
  await manager.setProviderKey("openrouter", "sk-test");
  await manager.setProviderKey("gemini", "AIzaSy-test");

  const providers = manager.listProviders();
  assert.equal(providers.length, 4);

  const or = providers.find((p) => p.id === "openrouter");
  assert.equal(or.configured, true);
  assert.equal(or.enabled, true);

  const groq = providers.find((p) => p.id === "groq");
  assert.equal(groq.configured, false);

  const gemini = providers.find((p) => p.id === "gemini");
  assert.equal(gemini.configured, true);
});

// ── Enable / Disable ──

test("Enable and disable providers", async () => {
  const manager = new AIHubManager();
  await manager.setProviderKey("groq", "gsk-test");

  const disabled = manager.disableProvider("groq");
  assert.equal(disabled.enabled, false);

  const status1 = manager.getProviderStatus("groq");
  assert.equal(status1.enabled, false);

  const enabled = manager.enableProvider("groq");
  assert.equal(enabled.enabled, true);

  const status2 = manager.getProviderStatus("groq");
  assert.equal(status2.enabled, true);
});

// ── initFromEnv ──

test("initFromEnv picks up environment variables", () => {
  // Set env vars
  const origOR = process.env.OPENROUTER_API_KEY;
  const origGroq = process.env.GROQ_API_KEY;
  const origGemini = process.env.GEMINI_API_KEY;

  process.env.OPENROUTER_API_KEY = "sk-env-test-key";
  process.env.GROQ_API_KEY = "gsk-env-test-key";

  try {
    const manager = new AIHubManager();
    const result = manager.initFromEnv();
    assert.equal(result.configured, 2);
    assert.equal(result.total, 4);

    assert.ok(manager._adapters.has("openrouter"));
    assert.ok(manager._adapters.has("groq"));
    assert.ok(!manager._adapters.has("gemini"));
  } finally {
    // Restore env vars
    if (origOR !== undefined) process.env.OPENROUTER_API_KEY = origOR;
    else delete process.env.OPENROUTER_API_KEY;
    if (origGroq !== undefined) process.env.GROQ_API_KEY = origGroq;
    else delete process.env.GROQ_API_KEY;
    if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("initFromEnv picks up GOOGLE_API_KEY as fallback for Gemini", () => {
  const origGemini = process.env.GEMINI_API_KEY;
  const origGoogle = process.env.GOOGLE_API_KEY;

  delete process.env.GEMINI_API_KEY;
  process.env.GOOGLE_API_KEY = "AIzaSy-google-key";

  try {
    const manager = new AIHubManager();
    const result = manager.initFromEnv();
    assert.ok(result.configured >= 1);
    assert.ok(manager._adapters.has("gemini"));
  } finally {
    if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
    else delete process.env.GEMINI_API_KEY;
    if (origGoogle !== undefined) process.env.GOOGLE_API_KEY = origGoogle;
    else delete process.env.GOOGLE_API_KEY;
  }
});

// ── Chat completion routing ──

test("chatCompletion without adapter returns error object", async () => {
  const manager = new AIHubManager();
  const result = await manager.chatCompletion("openrouter", [
    { role: "user", content: "hi" },
  ]);
  assert.equal(result.error, true);
  assert.equal(result.code, "NO_ADAPTER");
});

test("chatCompletion with unknown provider throws", async () => {
  const manager = new AIHubManager();
  await assert.rejects(
    () =>
      manager.chatCompletion("unknown", [{ role: "user", content: "hi" }]),
    /Unknown provider/,
  );
});

// ── Streaming routing ──

test("chatCompletionStream with unknown provider yields error", async () => {
  const manager = new AIHubManager();
  const chunks = [];
  for await (const chunk of manager.chatCompletionStream("unknown", [
    { role: "user", content: "hi" },
  ])) {
    chunks.push(chunk);
  }
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].done, true);
  assert.ok(chunks[0].error.includes("Unknown provider"));
});

test("chatCompletionStream without adapter yields error", async () => {
  const manager = new AIHubManager();
  const chunks = [];
  for await (const chunk of manager.chatCompletionStream("openrouter", [
    { role: "user", content: "hi" },
  ])) {
    chunks.push(chunk);
  }
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].done, true);
  assert.ok(chunks[0].error.includes("not configured"));
});

// ── Shutdown ──

test("Shutdown cleans up all state", async () => {
  const manager = new AIHubManager();
  await manager.setProviderKey("openrouter", "sk-test");
  await manager.setProviderKey("groq", "gsk-test");

  assert.equal(manager._adapters.size, 2);

  manager.shutdown();

  assert.equal(manager._adapters.size, 0);
  const providers = manager.listProviders();
  assert.ok(providers.every((p) => p.configured === false));
});

// ── Fetch models ──

test("Fetch models stores results in registry", async () => {
  const restore = mockFetch(async () => ({
    ok: true,
    json: async () => ({
      data: [
        { id: "model-1", name: "Model 1", context_length: 8192 },
        { id: "model-2", name: "Model 2", context_length: 32768 },
      ],
    }),
    text: async () => "",
  }));

  try {
    const manager = new AIHubManager();
    await manager.setProviderKey("groq", "gsk-test");
    const models = await manager.fetchModels("groq");
    assert.ok(Array.isArray(models));
    assert.equal(models.length, 2);

    // Should be cached in registry
    const allModels = manager.getAllModels();
    assert.equal(allModels.length, 2);
  } finally {
    restore();
  }
});

test("Fetch models without adapter returns error", async () => {
  const manager = new AIHubManager();
  const result = await manager.fetchModels("openrouter");
  assert.equal(result.error, true);
  assert.equal(result.code, "NO_ADAPTER");
});
