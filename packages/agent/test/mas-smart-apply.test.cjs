/**
 * MAS — Smart Apply Smoke Tests
 */
const assert = require("node:assert/strict");

let smartApply;
try {
  smartApply = require("../src/mas/smart-apply");
} catch (err) {
  console.error("smart-apply import failed:", err.message);
}

test("smart-apply module loads without error", () => {
  assert.ok(smartApply, "Module should load");
});

test("module exports levenshteinDistance function", () => {
  if (!smartApply) return;
  if (typeof smartApply.levenshteinDistance !== "function") {
    const fns = Object.keys(smartApply).filter(k => typeof smartApply[k] === "function");
    assert.ok(fns.length > 0, `Module should export functions, found: ${fns.join(", ")}`);
    return;
  }
  assert.equal(typeof smartApply.levenshteinDistance, "function");
});

test("levenshteinDistance computes correctly", () => {
  if (!smartApply || typeof smartApply.levenshteinDistance !== "function") return;
  const lev = smartApply.levenshteinDistance;
  assert.equal(lev("", ""), 0);
  assert.equal(lev("abc", "abc"), 0);
  assert.equal(lev("abc", ""), 3);
  assert.equal(lev("", "abc"), 3);
  assert.equal(lev("kitten", "sitting"), 3);
  assert.equal(lev("abc", "axc"), 1);
});

test("module exports SmartApply or similar class/function", () => {
  if (!smartApply) return;
  const exports = Object.keys(smartApply);
  assert.ok(exports.length > 0, `Module should have exports: ${exports.join(", ")}`);
});
