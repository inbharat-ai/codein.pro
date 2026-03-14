/**
 * MAS — Plugin System Smoke Tests
 */
const assert = require("node:assert/strict");

let pluginSystem;
try {
  pluginSystem = require("../src/mas/plugin-system");
} catch (err) {
  console.error("plugin-system import failed:", err.message);
}

test("plugin-system module loads without error", () => {
  assert.ok(pluginSystem, "Module should load");
});

test("module exports PluginManager class", () => {
  if (!pluginSystem) return;
  assert.ok(
    pluginSystem.PluginManager || typeof pluginSystem.createPluginManager === "function",
    "Should export PluginManager or createPluginManager"
  );
});

test("PluginManager can be instantiated", () => {
  if (!pluginSystem || !pluginSystem.PluginManager) return;
  const pm = new pluginSystem.PluginManager({
    pluginDir: "/tmp/test-plugins-nonexistent",
  });
  assert.ok(pm, "Should create PluginManager instance");
});

test("module exports expected constants", () => {
  if (!pluginSystem) return;
  const exports = Object.keys(pluginSystem);
  assert.ok(exports.length > 0, `Module exports: ${exports.join(", ")}`);
});
