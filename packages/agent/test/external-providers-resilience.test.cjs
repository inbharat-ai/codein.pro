"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ExternalProviderManager,
} = require("../src/model-runtime/external-providers");

test("ExternalProviderManager opens circuit after repeated failures", async () => {
  const mgr = new ExternalProviderManager();
  mgr.configure("openai", { apiKey: "sk-test" });

  let callCount = 0;
  mgr._request = async () => {
    callCount += 1;
    throw new Error("POST failed with 500");
  };

  for (let i = 0; i < 3; i++) {
    await assert.rejects(
      () => mgr.complete("openai", [{ role: "user", content: "hi" }]),
      /failed|returned|suppressed/i,
    );
  }

  const health = mgr.getProviderHealth("openai");
  assert.equal(health.state, "open");
  assert.ok(callCount >= 3);

  await assert.rejects(
    () => mgr.complete("openai", [{ role: "user", content: "again" }]),
    /temporarily suppressed/i,
  );
});

test("ExternalProviderManager recovers provider after cooldown and success", async () => {
  const mgr = new ExternalProviderManager();
  mgr.configure("openai", { apiKey: "sk-test" });

  // Open the circuit quickly.
  mgr.resilienceConfig.failureThreshold = 1;
  mgr.resilienceConfig.cooldownMs = 1;
  mgr._request = async () => {
    throw new Error("Provider request timeout");
  };

  await assert.rejects(
    () => mgr.complete("openai", [{ role: "user", content: "x" }]),
    /timeout|failed|returned/i,
  );

  // Wait for half-open probe window, then return success.
  await new Promise((resolve) => setTimeout(resolve, 5));
  mgr._request = async () => ({
    choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    model: "gpt-4o",
  });

  const res = await mgr.complete("openai", [{ role: "user", content: "x" }]);
  assert.equal(res.content, "ok");
  assert.equal(mgr.getProviderHealth("openai").state, "closed");
});

test("completeWithFallback accepts object payload signature", async () => {
  const mgr = new ExternalProviderManager();
  mgr.configure("openai", { apiKey: "sk-test" });

  mgr._request = async () => ({
    choices: [{ message: { content: "done" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    model: "gpt-4o",
  });

  const out = await mgr.completeWithFallback({
    messages: [{ role: "user", content: "hello" }],
    model: "gpt-4o",
  });

  assert.equal(out.content, "done");
  assert.equal(out.provider, "openai");
});
