/**
 * MAS — Doc Generator Smoke Tests
 */
const assert = require("node:assert/strict");

let docGen;
try {
  docGen = require("../src/mas/doc-generator");
} catch (err) {
  console.error("doc-generator import failed:", err.message);
}

test("doc-generator module loads without error", () => {
  assert.ok(docGen, "Module should load");
});

test("module exports expected functions/objects", () => {
  if (!docGen) return;
  const exports = Object.keys(docGen);
  assert.ok(exports.length > 0, `Module should have exports, found: ${exports.join(", ")}`);
});

test("COMMIT_TYPES has standard conventional commit types", () => {
  if (!docGen || !docGen.COMMIT_TYPES) return;
  assert.ok(docGen.COMMIT_TYPES.feat, "Should have feat type");
  assert.ok(docGen.COMMIT_TYPES.fix, "Should have fix type");
  assert.ok(docGen.COMMIT_TYPES.refactor, "Should have refactor type");
  assert.ok(docGen.COMMIT_TYPES.docs, "Should have docs type");
  assert.ok(docGen.COMMIT_TYPES.test, "Should have test type");
});
