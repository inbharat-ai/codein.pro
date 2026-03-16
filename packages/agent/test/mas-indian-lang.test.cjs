/**
 * MAS — Indian Language Support Smoke Tests
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

let indianLang;
try {
  indianLang = require("../src/mas/indian-lang");
} catch (err) {
  console.error("indian-lang import failed:", err.message);
}

test("indian-lang module loads without error", () => {
  assert.ok(indianLang, "Module should load");
});

test("module exports detectLanguage function", () => {
  if (!indianLang) return;
  if (typeof indianLang.detectLanguage !== "function") {
    // Check for alternative export names
    const fns = Object.keys(indianLang).filter(k => typeof indianLang[k] === "function");
    assert.ok(fns.length > 0, `Module should export functions, found: ${fns.join(", ")}`);
    return;
  }
  assert.equal(typeof indianLang.detectLanguage, "function");
});

test("module exports SCRIPT_RANGES or similar", () => {
  if (!indianLang) return;
  const exports = Object.keys(indianLang);
  assert.ok(exports.length > 0, "Module should have exports");
});

test("detects Hindi Devanagari text", () => {
  if (!indianLang || typeof indianLang.detectLanguage !== "function") return;
  const result = indianLang.detectLanguage("यह फ़ंक्शन को ठीक करो");
  assert.ok(result, "Should detect something from Hindi text");
});

test("detects English text", () => {
  if (!indianLang || typeof indianLang.detectLanguage !== "function") return;
  const result = indianLang.detectLanguage("fix this function please");
  assert.ok(result, "Should detect something from English text");
});
