/**
 * MAS — Mode Config Smoke Tests
 */
const assert = require("node:assert/strict");

const {
  MODE_CONFIGS,
  getModeConfig,
  getAllModeConfigs,
  requiresSwarm,
  isModeAutoApproved,
  AGENT_MODEL_TIERS,
  getAgentModelTier,
} = require("../src/mas/mode-config");
const { AGENT_TYPE, TOPOLOGY, PERMISSION_TYPE } = require("../src/mas/types");

// ── MODE_CONFIGS ──

test("MODE_CONFIGS is frozen with expected modes", () => {
  assert.ok(Object.isFrozen(MODE_CONFIGS));
  const modes = Object.keys(MODE_CONFIGS);
  assert.ok(modes.includes("ask"));
  assert.ok(modes.includes("build"));
  assert.ok(modes.includes("debug"));
  assert.ok(modes.includes("harden"));
  assert.ok(modes.includes("swarm"));
  assert.ok(modes.includes("vibe"));
});

test("each mode config has required fields", () => {
  for (const [key, cfg] of Object.entries(MODE_CONFIGS)) {
    assert.equal(cfg.mode, key, `mode field should match key for ${key}`);
    assert.ok(cfg.label, `${key} missing label`);
    assert.ok(cfg.description, `${key} missing description`);
    assert.ok(Array.isArray(cfg.agents), `${key} agents should be array`);
    assert.equal(typeof cfg.useSwarm, "boolean", `${key} useSwarm should be boolean`);
    assert.ok(cfg.defaultModelTier, `${key} missing defaultModelTier`);
    assert.equal(typeof cfg.maxConcurrency, "number", `${key} maxConcurrency should be number`);
    assert.equal(typeof cfg.maxBudgetUSD, "number", `${key} maxBudgetUSD should be number`);
    assert.ok(Array.isArray(cfg.autoApprovePermissions), `${key} autoApprovePermissions should be array`);
  }
});

// ── getModeConfig ──

test("getModeConfig returns correct config for valid mode", () => {
  const cfg = getModeConfig("build");
  assert.equal(cfg.mode, "build");
  assert.equal(cfg.topology, TOPOLOGY.HIERARCHICAL);
  assert.ok(cfg.agents.includes(AGENT_TYPE.PLANNER));
  assert.ok(cfg.agents.includes(AGENT_TYPE.CODER));
});

test("getModeConfig falls back to ask for unknown mode", () => {
  const cfg = getModeConfig("nonexistent");
  assert.equal(cfg.mode, "ask");
});

// ── getAllModeConfigs ──

test("getAllModeConfigs returns all configs as array", () => {
  const all = getAllModeConfigs();
  assert.ok(Array.isArray(all));
  assert.equal(all.length, Object.keys(MODE_CONFIGS).length);
});

// ── requiresSwarm ──

test("ask mode does not require swarm", () => {
  assert.equal(requiresSwarm("ask"), false);
});

test("build mode requires swarm", () => {
  assert.equal(requiresSwarm("build"), true);
});

test("swarm mode requires swarm", () => {
  assert.equal(requiresSwarm("swarm"), true);
});

// ── isModeAutoApproved ──

test("file_read is auto-approved in build mode", () => {
  assert.equal(isModeAutoApproved("build", PERMISSION_TYPE.FILE_READ), true);
});

test("command_run is never auto-approved", () => {
  assert.equal(isModeAutoApproved("build", PERMISSION_TYPE.COMMAND_RUN), false);
  assert.equal(isModeAutoApproved("swarm", PERMISSION_TYPE.COMMAND_RUN), false);
});

// ── AGENT_MODEL_TIERS ──

test("AGENT_MODEL_TIERS is frozen and covers all agent types", () => {
  assert.ok(Object.isFrozen(AGENT_MODEL_TIERS));
  assert.ok(AGENT_MODEL_TIERS[AGENT_TYPE.PLANNER]);
  assert.ok(AGENT_MODEL_TIERS[AGENT_TYPE.CODER]);
  assert.ok(AGENT_MODEL_TIERS[AGENT_TYPE.SECURITY]);
});

test("getAgentModelTier returns correct tier", () => {
  assert.equal(getAgentModelTier(AGENT_TYPE.PLANNER), "premium");
  assert.equal(getAgentModelTier(AGENT_TYPE.DOCS), "fast");
  assert.equal(getAgentModelTier(AGENT_TYPE.CODER), "balanced");
});

test("getAgentModelTier defaults to balanced for unknown types", () => {
  assert.equal(getAgentModelTier("alien_agent"), "balanced");
});
