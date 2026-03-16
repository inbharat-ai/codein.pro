/**
 * MAS — Workspace Indexer Smoke Tests
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

let indexer;
try {
  indexer = require("../src/mas/workspace-indexer");
} catch (err) {
  console.error("workspace-indexer import failed:", err.message);
}

test("workspace-indexer module loads without error", () => {
  assert.ok(indexer, "Module should load");
});

test("module exports expected items", () => {
  if (!indexer) return;
  const exports = Object.keys(indexer);
  assert.ok(exports.length > 0, `Module exports: ${exports.join(", ")}`);
});
