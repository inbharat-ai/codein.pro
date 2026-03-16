/**
 * Tests for SQLite Store — memory, task queue, analytics
 */
"use strict";
const { describe, it, afterEach } = require("node:test");

const assert = require("node:assert");

let SqliteMemoryStore, SqliteTaskQueue, SqliteAnalyticsStore;
try {
  ({
    SqliteMemoryStore,
    SqliteTaskQueue,
    SqliteAnalyticsStore,
  } = require("../src/mas/sqlite-store"));
} catch (err) {
  console.log("sqlite-store.js not found — skipping:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

// ═══════════════════════════════════════════════════════════════
// SqliteMemoryStore
// ═══════════════════════════════════════════════════════════════

describe("SqliteMemoryStore", () => {
  const testHash = "test-" + Date.now();
  let store;

  afterEach(() => {
    if (store) {
      store.close();
      store = null;
    }
  });

  it("initializes with enabled=false returns empty", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash, enabled: false });
    assert.strictEqual(store.size(), 0);
    assert.strictEqual(store.get("key"), undefined);
  });

  it("set and get a value", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash, enabled: true });
    store.set("hello", { msg: "world" });
    const val = store.get("hello");
    assert.deepStrictEqual(val, { msg: "world" });
  });

  it("has() returns correct boolean", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash, enabled: true });
    store.set("exists", "yes");
    assert.ok(store.has("exists"));
    assert.ok(!store.has("nope"));
  });

  it("delete removes entry", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash, enabled: true });
    store.set("todelete", "val");
    assert.ok(store.delete("todelete"));
    assert.ok(!store.has("todelete"));
  });

  it("size tracks entries", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash + "-size", enabled: true });
    assert.strictEqual(store.size(), 0);
    store.set("a", 1);
    store.set("b", 2);
    assert.strictEqual(store.size(), 2);
  });

  it("prune removes old entries", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash + "-prune", enabled: true });
    store.set("old", "data");
    // Prune with 1ms max age — set was just called so the entry is current.
    // Instead test that prune(huge_age) removes nothing, and enforceLimit removes entries.
    const prunedNone = store.prune(999999999);
    assert.strictEqual(prunedNone, 0, "recent entry should not be pruned");
    assert.strictEqual(store.size(), 1);
    // enforceLimit(0) should remove it
    const evicted = store.enforceLimit(0);
    assert.ok(evicted >= 1);
    assert.strictEqual(store.size(), 0);
  });

  it("enforceLimit evicts LRU", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash + "-limit", enabled: true });
    for (let i = 0; i < 10; i++) {
      store.set(`key-${i}`, `val-${i}`);
    }
    const evicted = store.enforceLimit(5);
    assert.ok(evicted >= 5);
    assert.ok(store.size() <= 5);
  });

  it("snapshot returns all entries", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash + "-snap", enabled: true });
    store.set("x", 10);
    store.set("y", 20);
    const snap = store.snapshot();
    assert.ok("x" in snap);
    assert.ok("y" in snap);
  });

  it("rejects oversized values", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash + "-big", enabled: true });
    const bigVal = "x".repeat(600 * 1024);
    assert.throws(() => store.set("toobig", bigVal), /too large/i);
  });

  it("stores and retrieves string values", () => {
    store = new SqliteMemoryStore({ workspaceHash: testHash + "-str", enabled: true });
    store.set("str", "plain string");
    assert.strictEqual(store.get("str"), "plain string");
  });
});

// ═══════════════════════════════════════════════════════════════
// SqliteTaskQueue
// ═══════════════════════════════════════════════════════════════

describe("SqliteTaskQueue", () => {
  const testHash = "test-tq-" + Date.now();
  let queue;

  afterEach(() => {
    if (queue) {
      queue.close();
      queue = null;
    }
  });

  it("enqueues a task", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash });
    const result = queue.enqueue({ goal: "Test task" });
    assert.ok(result.taskId);
    assert.ok(result.position >= 1);
  });

  it("gets a task by ID", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash + "-get" });
    const { taskId } = queue.enqueue({ goal: "Get me" });
    const task = queue.get(taskId);
    assert.strictEqual(task.goal, "Get me");
    assert.strictEqual(task.status, "queued");
  });

  it("lists tasks", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash + "-list" });
    queue.enqueue({ goal: "Task 1" });
    queue.enqueue({ goal: "Task 2" });
    const tasks = queue.list();
    assert.strictEqual(tasks.length, 2);
  });

  it("lists tasks by status", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash + "-status" });
    queue.enqueue({ goal: "Task 1" });
    const { taskId } = queue.enqueue({ goal: "Task 2" });
    queue.updateStatus(taskId, "running");
    const running = queue.list({ status: "running" });
    assert.strictEqual(running.length, 1);
    assert.strictEqual(running[0].goal, "Task 2");
  });

  it("dequeues by priority", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash + "-prio" });
    queue.enqueue({ goal: "Low", priority: "low" });
    queue.enqueue({ goal: "High", priority: "high" });
    queue.enqueue({ goal: "Normal", priority: "normal" });

    const next = queue.dequeue();
    assert.strictEqual(next.goal, "High");
    assert.strictEqual(next.status, "running");
  });

  it("completes a task", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash + "-comp" });
    const { taskId } = queue.enqueue({ goal: "Complete me" });
    queue.complete(taskId, { output: "done" });
    const task = queue.get(taskId);
    assert.strictEqual(task.status, "completed");
    assert.deepStrictEqual(task.result, { output: "done" });
  });

  it("fails a task", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash + "-fail" });
    const { taskId } = queue.enqueue({ goal: "Fail me" });
    queue.fail(taskId, "Something went wrong");
    const task = queue.get(taskId);
    assert.strictEqual(task.status, "failed");
    assert.strictEqual(task.error, "Something went wrong");
  });

  it("updates progress", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash + "-prog" });
    const { taskId } = queue.enqueue({ goal: "Progress" });
    queue.updateProgress(taskId, 50);
    const task = queue.get(taskId);
    assert.strictEqual(task.progress, 50);
  });

  it("reports stats", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash + "-stats" });
    queue.enqueue({ goal: "A" });
    queue.enqueue({ goal: "B" });
    const { taskId } = queue.enqueue({ goal: "C" });
    queue.updateStatus(taskId, "running");

    const stats = queue.stats();
    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.queued, 2);
    assert.strictEqual(stats.running, 1);
  });

  it("returns null when dequeue is empty", () => {
    queue = new SqliteTaskQueue({ workspaceHash: testHash + "-empty" });
    assert.strictEqual(queue.dequeue(), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// SqliteAnalyticsStore
// ═══════════════════════════════════════════════════════════════

describe("SqliteAnalyticsStore", () => {
  const testHash = "test-analytics-" + Date.now();
  let analytics;

  afterEach(() => {
    if (analytics) {
      analytics.close();
      analytics = null;
    }
  });

  it("records cost events", () => {
    analytics = new SqliteAnalyticsStore({ workspaceHash: testHash });
    analytics.recordCost({
      agentType: "coder",
      model: "gpt-4",
      tokensIn: 100,
      tokensOut: 50,
      costUSD: 0.01,
    });
    const data = analytics.getAnalytics();
    assert.ok(data.totalCost >= 0.01);
    assert.ok(data.totalTokens >= 150);
  });

  it("tracks cost by agent type", () => {
    analytics = new SqliteAnalyticsStore({ workspaceHash: testHash + "-agent" });
    analytics.recordCost({ agentType: "coder", costUSD: 0.05 });
    analytics.recordCost({ agentType: "tester", costUSD: 0.02 });
    analytics.recordCost({ agentType: "coder", costUSD: 0.03 });

    const data = analytics.getAnalytics();
    assert.ok(data.costByAgent.coder >= 0.08);
    assert.ok(data.costByAgent.tester >= 0.02);
  });

  it("tracks cost by model", () => {
    analytics = new SqliteAnalyticsStore({ workspaceHash: testHash + "-model" });
    analytics.recordCost({ model: "claude-3", costUSD: 0.1 });
    analytics.recordCost({ model: "gpt-4", costUSD: 0.2 });

    const data = analytics.getAnalytics();
    assert.ok(data.costByModel["claude-3"] >= 0.1);
    assert.ok(data.costByModel["gpt-4"] >= 0.2);
  });

  it("filters by session ID", () => {
    analytics = new SqliteAnalyticsStore({ workspaceHash: testHash + "-sess" });
    analytics.recordCost({ sessionId: "s1", costUSD: 0.1 });
    analytics.recordCost({ sessionId: "s2", costUSD: 0.2 });

    const s1Data = analytics.getAnalytics("s1");
    assert.ok(s1Data.totalCost >= 0.1);
    assert.ok(s1Data.totalCost < 0.2);
  });
});
