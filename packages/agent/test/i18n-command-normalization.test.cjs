"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { i18nOrchestrator } = require("../src/i18n/orchestrator");

test("normalizeCodingInstruction keeps traceability and technical terms", async () => {
  const originalTranslate = i18nOrchestrator.translateToEnglishIfNeeded;
  i18nOrchestrator.translateToEnglishIfNeeded = async () => ({
    text: "please create React login page with Supabase auth and dashboard",
    language: "hi",
    translated: true,
  });

  try {
    const result = await i18nOrchestrator.normalizeCodingInstruction(
      "bhai React login page banao Supabase auth ke saath",
      { languageHint: "hi" },
    );

    assert.equal(result.sourceLanguage, "hi");
    assert.equal(result.translated, true);
    assert.ok(result.traceId.startsWith("i18n_"));
    assert.ok(result.normalizedEnglishTask.includes("React"));
    assert.ok(result.normalizedEnglishTask.includes("Supabase"));
    assert.equal(typeof result.mixedLanguage, "boolean");
  } finally {
    i18nOrchestrator.translateToEnglishIfNeeded = originalTranslate;
  }
});

test("normalizeCodingInstruction handles empty input safely", async () => {
  const result = await i18nOrchestrator.normalizeCodingInstruction("   ");
  assert.equal(result.normalizedEnglishTask, "");
  assert.equal(result.translated, false);
  assert.equal(result.sourceLanguage, "en");
});
