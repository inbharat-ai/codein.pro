"use strict";
const assert = require("node:assert/strict");

const {
  OpenAICompatAdapter,
} = require("../src/ai-hub/adapters/openai-compat-adapter");
const {
  GeminiAdapter,
  convertMessagesToGemini,
} = require("../src/ai-hub/adapters/gemini-adapter");
const { PROVIDERS } = require("../src/ai-hub/provider-registry");

// ── Mock fetch setup ──
// We override global.fetch for testing purposes and restore after each test.

function mockFetch(handler) {
  const original = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = original;
  };
}

// ── OpenAI-Compat Adapter Tests ──

test("OpenAI-compat adapter constructs correct request URL for /models", async () => {
  let capturedUrl = null;
  const restore = mockFetch(async (url, opts) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({ data: [] }),
      text: async () => "",
    };
  });

  try {
    const adapter = new OpenAICompatAdapter(
      PROVIDERS.openrouter,
      () => "sk-test-key",
    );
    await adapter.testConnection();
    assert.equal(capturedUrl, "https://openrouter.ai/api/v1/models");
  } finally {
    restore();
  }
});

test("OpenAI-compat adapter constructs correct URL for Groq", async () => {
  let capturedUrl = null;
  const restore = mockFetch(async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({ data: [] }),
      text: async () => "",
    };
  });

  try {
    const adapter = new OpenAICompatAdapter(PROVIDERS.groq, () => "gsk-key");
    await adapter.testConnection();
    assert.equal(capturedUrl, "https://api.groq.com/openai/v1/models");
  } finally {
    restore();
  }
});

test("OpenAI-compat adapter sets auth header correctly", async () => {
  let capturedHeaders = null;
  const restore = mockFetch(async (url, opts) => {
    capturedHeaders = opts.headers;
    return {
      ok: true,
      json: async () => ({ data: [] }),
      text: async () => "",
    };
  });

  try {
    const adapter = new OpenAICompatAdapter(
      PROVIDERS.openrouter,
      () => "sk-my-secret",
    );
    await adapter.testConnection();
    assert.equal(capturedHeaders.Authorization, "Bearer sk-my-secret");
    assert.ok(capturedHeaders["User-Agent"]);
  } finally {
    restore();
  }
});

test("OpenAI-compat adapter sets OpenRouter-specific headers", async () => {
  let capturedHeaders = null;
  const restore = mockFetch(async (url, opts) => {
    capturedHeaders = opts.headers;
    return {
      ok: true,
      json: async () => ({ data: [] }),
      text: async () => "",
    };
  });

  try {
    const adapter = new OpenAICompatAdapter(
      PROVIDERS.openrouter,
      () => "sk-test",
    );
    await adapter.testConnection();
    assert.equal(capturedHeaders["HTTP-Referer"], "https://codin.dev");
    assert.equal(capturedHeaders["X-Title"], "CodIn IDE");
  } finally {
    restore();
  }
});

test("OpenAI-compat normalizes model list response", async () => {
  const restore = mockFetch(async () => ({
    ok: true,
    json: async () => ({
      data: [
        {
          id: "gpt-4o",
          name: "GPT-4o",
          owned_by: "openai",
          context_length: 128000,
          pricing: { prompt: "0.005", completion: "0.015" },
        },
        {
          id: "claude-3-opus",
          name: "Claude 3 Opus",
          owned_by: "anthropic",
          context_length: 200000,
        },
      ],
    }),
    text: async () => "",
  }));

  try {
    const adapter = new OpenAICompatAdapter(
      PROVIDERS.openrouter,
      () => "sk-test",
    );
    const models = await adapter.fetchModels();
    assert.ok(Array.isArray(models));
    assert.equal(models.length, 2);
    assert.equal(models[0].id, "gpt-4o");
    assert.equal(models[0].provider, "openrouter");
    assert.equal(models[0].contextWindow, 128000);
    assert.equal(models[0].pricing.input, 0.005);
    assert.equal(models[0].pricing.output, 0.015);
    assert.equal(models[1].id, "claude-3-opus");
  } finally {
    restore();
  }
});

test("OpenAI-compat normalizes chat completion response", async () => {
  const restore = mockFetch(async () => ({
    ok: true,
    json: async () => ({
      model: "gpt-4o",
      choices: [
        {
          message: { content: "Hello, world!" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    text: async () => "",
  }));

  try {
    const adapter = new OpenAICompatAdapter(
      PROVIDERS.openrouter,
      () => "sk-test",
    );
    const result = await adapter.chatCompletion([
      { role: "user", content: "Hi" },
    ]);
    assert.equal(result.content, "Hello, world!");
    assert.equal(result.model, "gpt-4o");
    assert.equal(result.usage.inputTokens, 10);
    assert.equal(result.usage.outputTokens, 5);
    assert.equal(result.finishReason, "stop");
    assert.equal(result.error, undefined);
  } finally {
    restore();
  }
});

// ── Gemini Adapter Tests ──

test("Gemini adapter constructs correct URL format", async () => {
  let capturedUrl = null;
  const restore = mockFetch(async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({ models: [] }),
      text: async () => "",
    };
  });

  try {
    const adapter = new GeminiAdapter(PROVIDERS.gemini, () => "AIzaSyTest");
    await adapter.testConnection();
    assert.ok(
      capturedUrl.startsWith(
        "https://generativelanguage.googleapis.com/v1beta/models",
      ),
    );
    assert.ok(capturedUrl.includes("key=AIzaSyTest"));
  } finally {
    restore();
  }
});

test("Gemini adapter converts messages to Gemini format", () => {
  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
    { role: "user", content: "How are you?" },
  ];

  const { systemInstruction, contents } = convertMessagesToGemini(messages);

  // System message becomes systemInstruction
  assert.ok(systemInstruction);
  assert.equal(
    systemInstruction.parts[0].text,
    "You are a helpful assistant.",
  );

  // Remaining messages become contents
  assert.equal(contents.length, 3);
  assert.equal(contents[0].role, "user");
  assert.equal(contents[0].parts[0].text, "Hello");
  assert.equal(contents[1].role, "model"); // assistant -> model
  assert.equal(contents[1].parts[0].text, "Hi there!");
  assert.equal(contents[2].role, "user");
});

test("Gemini adapter normalizes response", async () => {
  const restore = mockFetch(async (url) => {
    // Model list fetch vs generate content
    if (url.includes(":generateContent")) {
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: "Gemini response!" }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 8,
          },
        }),
        text: async () => "",
      };
    }
    return {
      ok: true,
      json: async () => ({ models: [] }),
      text: async () => "",
    };
  });

  try {
    const adapter = new GeminiAdapter(PROVIDERS.gemini, () => "AIzaSyTest");
    const result = await adapter.chatCompletion([
      { role: "user", content: "Hello" },
    ]);
    assert.equal(result.content, "Gemini response!");
    assert.equal(result.usage.inputTokens, 15);
    assert.equal(result.usage.outputTokens, 8);
    assert.equal(result.finishReason, "stop");
    assert.equal(result.error, undefined);
  } finally {
    restore();
  }
});

test("Gemini adapter normalizes model list", async () => {
  const restore = mockFetch(async () => ({
    ok: true,
    json: async () => ({
      models: [
        {
          name: "models/gemini-2.0-flash",
          displayName: "Gemini 2.0 Flash",
          inputTokenLimit: 1048576,
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/gemini-1.5-pro",
          displayName: "Gemini 1.5 Pro",
          inputTokenLimit: 2097152,
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    }),
    text: async () => "",
  }));

  try {
    const adapter = new GeminiAdapter(PROVIDERS.gemini, () => "AIzaSyTest");
    const models = await adapter.fetchModels();
    assert.ok(Array.isArray(models));
    assert.equal(models.length, 2);
    assert.equal(models[0].id, "gemini-2.0-flash"); // "models/" prefix stripped
    assert.equal(models[0].provider, "gemini");
    assert.equal(models[0].contextWindow, 1048576);
    assert.equal(models[1].id, "gemini-1.5-pro");
  } finally {
    restore();
  }
});

// ── Error handling ──

test("OpenAI-compat adapter handles network errors gracefully", async () => {
  const restore = mockFetch(async () => {
    throw new Error("Network error: ECONNREFUSED");
  });

  try {
    const adapter = new OpenAICompatAdapter(
      PROVIDERS.openrouter,
      () => "sk-test",
    );
    const result = await adapter.testConnection();
    assert.equal(result.success, false);
    assert.ok(result.error.includes("ECONNREFUSED"));
    assert.equal(result.modelCount, 0);
  } finally {
    restore();
  }
});

test("Gemini adapter handles network errors gracefully", async () => {
  const restore = mockFetch(async () => {
    throw new Error("Network error: timeout");
  });

  try {
    const adapter = new GeminiAdapter(PROVIDERS.gemini, () => "AIzaSyTest");
    const result = await adapter.testConnection();
    assert.equal(result.success, false);
    assert.ok(result.error.includes("timeout"));
  } finally {
    restore();
  }
});

test("OpenAI-compat adapter handles HTTP error responses", async () => {
  const restore = mockFetch(async () => ({
    ok: false,
    status: 401,
    text: async () => "Unauthorized: invalid API key",
  }));

  try {
    const adapter = new OpenAICompatAdapter(
      PROVIDERS.groq,
      () => "bad-key",
    );
    const result = await adapter.testConnection();
    assert.equal(result.success, false);
    assert.ok(result.error.includes("401"));
  } finally {
    restore();
  }
});

test("Gemini adapter handles HTTP error responses", async () => {
  const restore = mockFetch(async () => ({
    ok: false,
    status: 403,
    text: async () => "Forbidden",
  }));

  try {
    const adapter = new GeminiAdapter(PROVIDERS.gemini, () => "bad-key");
    const result = await adapter.testConnection();
    assert.equal(result.success, false);
    assert.ok(result.error.includes("403"));
  } finally {
    restore();
  }
});

// ── Key redaction in errors ──

test("OpenAI-compat adapter redacts key in error messages", async () => {
  const apiKey = "sk-secret-key-value-1234";
  const restore = mockFetch(async () => {
    throw new Error(`Connection failed for ${apiKey}`);
  });

  try {
    const adapter = new OpenAICompatAdapter(
      PROVIDERS.openrouter,
      () => apiKey,
    );
    const result = await adapter.testConnection();
    assert.equal(result.success, false);
    // Error should NOT contain the full key
    assert.ok(!result.error.includes(apiKey));
    // Should contain the redacted version
    assert.ok(result.error.includes("1234"));
  } finally {
    restore();
  }
});

test("Gemini adapter redacts key in error messages", async () => {
  const apiKey = "AIzaSySecretKeyVal1234";
  const restore = mockFetch(async () => {
    throw new Error(`Auth failed for key ${apiKey}`);
  });

  try {
    const adapter = new GeminiAdapter(PROVIDERS.gemini, () => apiKey);
    const result = await adapter.testConnection();
    assert.equal(result.success, false);
    assert.ok(!result.error.includes(apiKey));
    assert.ok(result.error.includes("1234"));
  } finally {
    restore();
  }
});

// ── Chat completion error handling ──

test("OpenAI-compat chatCompletion handles errors", async () => {
  const restore = mockFetch(async () => ({
    ok: false,
    status: 500,
    text: async () => "Internal server error",
  }));

  try {
    const adapter = new OpenAICompatAdapter(
      PROVIDERS.openrouter,
      () => "sk-test",
    );
    const result = await adapter.chatCompletion([
      { role: "user", content: "test" },
    ]);
    assert.equal(result.error, true);
    assert.equal(result.code, "CHAT_COMPLETION_FAILED");
    assert.equal(result.provider, "openrouter");
  } finally {
    restore();
  }
});

test("Gemini chatCompletion returns error when no key", async () => {
  const adapter = new GeminiAdapter(PROVIDERS.gemini, () => null);
  const result = await adapter.chatCompletion([
    { role: "user", content: "test" },
  ]);
  assert.equal(result.error, true);
  assert.equal(result.code, "NO_KEY");
});

// ── OpenAI-compat adapter throws on missing key for headers ──

test("OpenAI-compat adapter throws when no key is available", () => {
  const adapter = new OpenAICompatAdapter(PROVIDERS.openrouter, () => null);
  assert.throws(() => adapter._headers(), /No API key/);
});

// ── convertMessagesToGemini handles edge cases ──

test("convertMessagesToGemini handles no system message", () => {
  const { systemInstruction, contents } = convertMessagesToGemini([
    { role: "user", content: "Hello" },
  ]);
  assert.equal(systemInstruction, null);
  assert.equal(contents.length, 1);
});
