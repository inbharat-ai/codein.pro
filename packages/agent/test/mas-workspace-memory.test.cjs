/**
 * MAS — Workspace Memory Smoke Tests
 */
const assert = require("node:assert/strict");

let workspaceMemory;
try {
  workspaceMemory = require("../src/mas/workspace-memory");
} catch (err) {
  console.error("workspace-memory import failed:", err.message);
}

test("workspace-memory module loads without error", () => {
  assert.ok(workspaceMemory, "Module should load");
});

test("module exports expected items", () => {
  if (!workspaceMemory) return;
  const exports = Object.keys(workspaceMemory);
  assert.ok(exports.length > 0, `Module exports: ${exports.join(", ")}`);
});
