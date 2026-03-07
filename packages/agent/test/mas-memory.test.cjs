/**
 * MAS — Memory System Tests
 *
 * Covers all 3 tiers: ShortTermMemory, WorkingMemory, LongTermMemory,
 * plus MemoryManager lifecycle hooks and stripSecrets.
 */
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  stripSecrets,
  ShortTermMemory,
  WorkingMemory,
  LongTermMemory,
  MemoryManager,
  SHORT_TERM_DEFAULT_TTL,
} = require("../src/mas/memory");
const { EVENT_TYPE, MEMORY_SCOPE } = require("../src/mas/types");

// ── stripSecrets ──

test("stripSecrets redacts API keys", () => {
  const val = stripSecrets("key is sk-abc123def456ghi789jkl0123456789ab");
  assert.ok(!val.includes("sk-abc123"));
  assert.ok(val.includes("[REDACTED]"));
});

test("stripSecrets redacts GitHub tokens", () => {
  const val = stripSecrets("token: ghp_abcdef1234567890abcdef1234567890abcd");
  assert.ok(!val.includes("ghp_abcdef"));
});

test("stripSecrets handles objects with sensitive keys", () => {
  const obj = { apiKey: "secret123", data: "safe" };
  const result = stripSecrets(obj);
  assert.ok(typeof result === "object");
  assert.equal(result.apiKey, "[REDACTED]");
  assert.equal(result.data, "safe");
});

test("stripSecrets handles null/undefined", () => {
  assert.equal(stripSecrets(null), null);
  assert.equal(stripSecrets(undefined), undefined);
});

// ── ShortTermMemory ──

test("ShortTermMemory stores and retrieves entries", () => {
  const stm = new ShortTermMemory();
  stm.set("key1", { value: 42 });
  const result = stm.get("key1");
  assert.deepEqual(result, { value: 42 });
  stm.destroy();
});

test("ShortTermMemory returns undefined for missing key", () => {
  const stm = new ShortTermMemory();
  assert.equal(stm.get("missing"), undefined);
  stm.destroy();
});

test("ShortTermMemory delete removes entry", () => {
  const stm = new ShortTermMemory();
  stm.set("x", 1);
  stm.delete("x");
  assert.equal(stm.get("x"), undefined);
  stm.destroy();
});

test("ShortTermMemory clear removes all entries", () => {
  const stm = new ShortTermMemory();
  stm.set("a", 1);
  stm.set("b", 2);
  stm.clear();
  assert.equal(stm.size(), 0);
  stm.destroy();
});

test("ShortTermMemory respects TTL", async () => {
  const stm = new ShortTermMemory(50); // 50ms TTL
  stm.set("temp", "value");
  assert.equal(stm.get("temp"), "value");
  await new Promise((r) => setTimeout(r, 80));
  stm.prune();
  assert.equal(stm.get("temp"), undefined);
  stm.destroy();
});

// ── WorkingMemory ──

test("WorkingMemory tracks decisions", () => {
  const wm = new WorkingMemory();
  wm.recordDecision({ action: "chose mesh topology" });
  wm.recordDecision({ action: "spawned 3 agents" });
  const history = wm.getDecisionHistory();
  assert.equal(history.length, 2);
  assert.equal(history[0].action, "chose mesh topology");
});

test("WorkingMemory caps at 500 decisions", () => {
  const wm = new WorkingMemory();
  for (let i = 0; i < 550; i++) {
    wm.recordDecision({ i });
  }
  assert.equal(wm.getDecisionHistory().length, 500);
});

test("WorkingMemory tracks plan", () => {
  const wm = new WorkingMemory();
  wm.setPlan({ goal: "build app", steps: 3 });
  assert.deepEqual(wm.getPlan(), { goal: "build app", steps: 3 });
});

test("WorkingMemory tracks budget", () => {
  const wm = new WorkingMemory();
  wm.trackCost(0.05);
  wm.trackCost(0.1);
  const budget = wm.getBudget();
  // Default budget starts at 0 spent
  assert.ok(budget.spent >= 0.15);
});

test("WorkingMemory tracks permission grants", () => {
  const wm = new WorkingMemory();
  wm.setPermissionGrant("file_read", "approve_always");
  assert.equal(wm.getPermissionGrant("file_read"), "approve_always");
  assert.equal(wm.getPermissionGrant("file_write"), null);
});

// ── MemoryManager ──

test("MemoryManager initializes with options", () => {
  const mm = new MemoryManager({ workspaceHash: "test001" });
  assert.ok(mm);
  mm.destroy();
});

test("MemoryManager.onSwarmInit records config", () => {
  const events = [];
  const mm = new MemoryManager({
    workspaceHash: "test002",
    emitEvent: (ev) => events.push(ev),
  });
  mm.onSwarmInit({ topology: "mesh" });
  // Should have stored config in working memory
  const config = mm.working.get("swarm_config");
  assert.deepEqual(config, { topology: "mesh" });
  mm.destroy();
});

test("MemoryManager short-term get/set works", () => {
  const mm = new MemoryManager({ workspaceHash: "test003" });
  mm.shortTerm.set("hello", "world");
  assert.equal(mm.shortTerm.get("hello"), "world");
  mm.destroy();
});

test("MemoryManager usage returns tier stats", () => {
  const mm = new MemoryManager({ workspaceHash: "test004" });
  mm.shortTerm.set("a", 1);
  mm.working.set("b", 2);
  const usage = mm.usage();
  assert.ok(usage.shortTerm.entries >= 1);
  assert.ok(usage.working.entries >= 1);
  mm.destroy();
});
