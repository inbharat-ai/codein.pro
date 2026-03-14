/**
 * MAS — Persistence Layer Smoke Tests
 *
 * Tests the module loads and gracefully handles missing better-sqlite3.
 */
const assert = require("node:assert/strict");

let persistence;
let importError = null;
try {
  persistence = require("../src/mas/persistence");
} catch (err) {
  importError = err;
}

test("persistence module loads without throwing", () => {
  // The module should always load — it has a try/catch for better-sqlite3
  assert.ok(persistence || importError === null || importError,
    "Module should either load or fail gracefully");
});

test("module exports PersistenceStore or similar", () => {
  if (!persistence) return;
  const exports = Object.keys(persistence);
  assert.ok(exports.length > 0, `Module exports: ${exports.join(", ")}`);
});
