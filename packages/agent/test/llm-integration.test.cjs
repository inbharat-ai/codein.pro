"use strict";
const assert = require("node:assert");

// Environment-gated: skip entirely if no keys present
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const RUN_LIVE = process.env.CODIN_LIVE_TESTS === "true";

if (!RUN_LIVE) {
  describe.skip("Live LLM Integration Tests (set CODIN_LIVE_TESTS=true to enable)", () => {
    it("skipped", () => {});
  });
  return;
}

let AIHubManager;
try {
  ({ AIHubManager } = require("../src/ai-hub/hub-manager"));
} catch (err) {
  console.log("AI Hub not loadable:", err.message);
  describe.skip("Live LLM Integration Tests (AI Hub module not loadable)", () => {
    it("skipped", () => {});
  });
  return;
}

describe("Live LLM Integration Tests", () => {
  let hub;

  beforeAll(() => {
    hub = new AIHubManager();
    hub.initFromEnv();
  });

  afterAll(() => {
    hub?.shutdown();
  });

  if (OPENROUTER_KEY) {
    describe("OpenRouter", () => {
      it("tests connection successfully", async () => {
        const result = await hub.testProvider("openrouter");
        assert.ok(result.success, `OpenRouter test failed: ${result.error}`);
        assert.ok(result.latencyMs > 0);
      });

      it("fetches models", async () => {
        const result = await hub.fetchModels("openrouter");
        assert.ok(result.models);
        assert.ok(result.models.length > 0, "Should have at least 1 model");
        // Verify normalization
        const model = result.models[0];
        assert.ok(model.id);
        assert.ok(model.name);
        assert.strictEqual(model.provider, "openrouter");
      });

      it("completes a simple chat", async () => {
        const result = await hub.chatCompletion("openrouter", [
          { role: "user", content: "Reply with only the word 'hello'" }
        ], { model: "openai/gpt-3.5-turbo", maxTokens: 10 });
        assert.ok(result.content);
        assert.ok(result.usage);
      });
    });
  }

  if (GROQ_KEY) {
    describe("Groq", () => {
      it("tests connection successfully", async () => {
        const result = await hub.testProvider("groq");
        assert.ok(result.success, `Groq test failed: ${result.error}`);
      });

      it("fetches models", async () => {
        const result = await hub.fetchModels("groq");
        assert.ok(result.models);
        assert.ok(result.models.length > 0);
      });

      it("completes a simple chat", async () => {
        const result = await hub.chatCompletion("groq", [
          { role: "user", content: "Reply with only the word 'hello'" }
        ], { model: "llama3-8b-8192", maxTokens: 10 });
        assert.ok(result.content);
      });
    });
  }

  if (GEMINI_KEY) {
    describe("Gemini", () => {
      it("tests connection successfully", async () => {
        const result = await hub.testProvider("gemini");
        assert.ok(result.success, `Gemini test failed: ${result.error}`);
      });

      it("fetches models", async () => {
        const result = await hub.fetchModels("gemini");
        assert.ok(result.models);
        assert.ok(result.models.length > 0);
      });
    });
  }
});
