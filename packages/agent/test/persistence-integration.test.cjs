/**
 * Persistence Integration Tests
 *
 * Verifies SQLite-backed persistence stores work correctly:
 * - SqliteTaskQueue enqueue/dequeue/complete/fail roundtrip
 * - SqliteMemoryStore set/get roundtrip
 * - Blackboard persistence integration
 * - Graceful error handling on closed connections
 */
"use strict";
const { describe, it, beforeEach, after } = require("node:test");

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");

const { SqliteTaskQueue, SqliteMemoryStore } = require("../src/mas/sqlite-store");
const { Blackboard } = require("../src/mas/memory");

// Use a unique temp workspace hash per test run to avoid collisions
const TEST_WORKSPACE_HASH = `test-${crypto.randomBytes(6).toString("hex")}`;
const TEST_BASE_PATH = path.join(os.homedir(), ".codein", "swarm", TEST_WORKSPACE_HASH);

// Cleanup helper
function cleanupTestDir() {
  try {
    if (fs.existsSync(TEST_BASE_PATH)) {
      fs.rmSync(TEST_BASE_PATH, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup
  }
}

after(() => {
  cleanupTestDir();
});

// ═══════════════════════════════════════════════════════════════
// 1. SqliteTaskQueue
// ═══════════════════════════════════════════════════════════════

describe("SqliteTaskQueue", () => {
  let queue;

  beforeEach(() => {
    if (queue) {
      try { queue.close(); } catch { /* ignore */ }
    }
    queue = new SqliteTaskQueue({ workspaceHash: TEST_WORKSPACE_HASH });
  });

  after(() => {
    if (queue) {
      try { queue.close(); } catch { /* ignore */ }
    }
  });

  it("enqueue returns a taskId and position", () => {
    const result = queue.enqueue({
      id: "task-001",
      goal: "Implement user authentication",
      priority: "high",
      mode: "implement",
    });
    assert.ok(result.taskId, "Should return a taskId");
    assert.equal(result.taskId, "task-001");
    assert.equal(typeof result.position, "number");
  });

  it("enqueue/get roundtrip preserves task data", () => {
    queue.enqueue({
      id: "task-rt-1",
      goal: "Build login page",
      priority: "normal",
      mode: "standard",
    });

    const task = queue.get("task-rt-1");
    assert.ok(task, "Task should be retrievable after enqueue");
    assert.equal(task.id, "task-rt-1");
    assert.equal(task.goal, "Build login page");
    assert.equal(task.status, "queued");
    assert.equal(task.priority, "normal");
  });

  it("dequeue returns highest-priority queued task and marks it running", () => {
    // Drain any previously queued tasks first
    while (queue.dequeue()) { /* drain */ }

    queue.enqueue({ id: "low-1", goal: "Low priority task", priority: "low" });
    queue.enqueue({ id: "high-1", goal: "High priority task", priority: "high" });
    queue.enqueue({ id: "normal-1", goal: "Normal priority task", priority: "normal" });

    const next = queue.dequeue();
    assert.ok(next, "Should dequeue a task");
    assert.equal(next.id, "high-1", "Should dequeue highest priority first");
    assert.equal(next.status, "running");
  });

  it("updateStatus changes task status", () => {
    queue.enqueue({ id: "task-status-1", goal: "Test status update" });
    queue.updateStatus("task-status-1", "running");

    const task = queue.get("task-status-1");
    assert.equal(task.status, "running");
  });

  it("complete stores result and sets status to completed", () => {
    queue.enqueue({ id: "task-complete-1", goal: "Task to complete" });
    queue.updateStatus("task-complete-1", "running");
    queue.complete("task-complete-1", { files: ["app.js"], linesChanged: 42 });

    const task = queue.get("task-complete-1");
    assert.equal(task.status, "completed");
    assert.ok(task.completedAt, "Should have a completedAt timestamp");
    assert.deepEqual(task.result, { files: ["app.js"], linesChanged: 42 });
  });

  it("fail stores error and sets status to failed", () => {
    queue.enqueue({ id: "task-fail-1", goal: "Task that will fail" });
    queue.updateStatus("task-fail-1", "running");
    queue.fail("task-fail-1", "Syntax error in generated code");

    const task = queue.get("task-fail-1");
    assert.equal(task.status, "failed");
    assert.ok(task.completedAt, "Should have a completedAt timestamp");
    assert.equal(task.error, "Syntax error in generated code");
  });

  it("stats returns correct counts for known tasks", () => {
    queue.enqueue({ id: "s1", goal: "g1" });
    queue.enqueue({ id: "s2", goal: "g2" });
    queue.enqueue({ id: "s3", goal: "g3" });
    queue.updateStatus("s2", "running");
    queue.complete("s3", { ok: true });

    const stats = queue.stats();
    // Stats include tasks from prior tests in same DB, so check relative counts
    assert.ok(stats.total >= 3, "Should have at least 3 tasks");
    assert.ok(stats.queued >= 1, "Should have at least 1 queued");
    assert.ok(stats.running >= 1, "Should have at least 1 running");
    assert.ok(stats.completed >= 1, "Should have at least 1 completed");

    // Verify individual tasks are in expected states
    assert.equal(queue.get("s1").status, "queued");
    assert.equal(queue.get("s2").status, "running");
    assert.equal(queue.get("s3").status, "completed");
  });

  it("list returns tasks ordered by creation desc", () => {
    queue.enqueue({ id: "l1", goal: "first" });
    queue.enqueue({ id: "l2", goal: "second" });
    queue.enqueue({ id: "l3", goal: "third" });

    const all = queue.list();
    assert.ok(all.length >= 3, "Should have at least 3 tasks");
    // Most recent first — verify ordering within our known tasks
    const l3Idx = all.findIndex((t) => t.id === "l3");
    const l1Idx = all.findIndex((t) => t.id === "l1");
    assert.ok(l3Idx < l1Idx, "l3 should appear before l1 (most recent first)");
  });

  it("handles operations on closed connection gracefully", () => {
    const tempQueue = new SqliteTaskQueue({ workspaceHash: TEST_WORKSPACE_HASH });
    tempQueue.close();

    // After close, operations should either use fallback or throw
    // The key point is they should not cause an unhandled crash
    try {
      tempQueue.enqueue({ id: "closed-1", goal: "Should handle gracefully" });
      // If it reaches here with fallback, that's fine
    } catch (err) {
      // Throwing is also acceptable — just shouldn't be an unhandled crash
      assert.ok(err, "Error should be truthy if thrown");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. SqliteMemoryStore
// ═══════════════════════════════════════════════════════════════

describe("SqliteMemoryStore", () => {
  let store;

  beforeEach(() => {
    if (store) {
      try { store.close(); } catch { /* ignore */ }
    }
    store = new SqliteMemoryStore({
      workspaceHash: TEST_WORKSPACE_HASH,
      enabled: true,
    });
  });

  after(() => {
    if (store) {
      try { store.close(); } catch { /* ignore */ }
    }
  });

  it("set/get roundtrip with object value", () => {
    store.set("test:key1", { name: "hello", count: 42 });
    const val = store.get("test:key1");
    assert.deepEqual(val, { name: "hello", count: 42 });
  });

  it("set/get roundtrip with string value", () => {
    store.set("test:str", "simple string value");
    const val = store.get("test:str");
    assert.equal(val, "simple string value");
  });

  it("has returns true for existing key", () => {
    store.set("test:exists", { a: 1 });
    assert.equal(store.has("test:exists"), true);
    assert.equal(store.has("test:nope"), false);
  });

  it("delete removes a key", () => {
    store.set("test:del", "to delete");
    assert.equal(store.has("test:del"), true);
    store.delete("test:del");
    assert.equal(store.has("test:del"), false);
    assert.equal(store.get("test:del"), undefined);
  });

  it("size returns correct count", () => {
    const initial = store.size();
    store.set("test:size1", "a");
    store.set("test:size2", "b");
    assert.equal(store.size(), initial + 2);
  });

  it("set with scope and tags options", () => {
    const result = store.set("test:tagged", { data: true }, {
      scope: "working",
      tags: ["blackboard", "test"],
    });
    assert.ok(result, "Should return a result object");
    assert.equal(result.key, "test:tagged");

    // Value should still be retrievable
    const val = store.get("test:tagged");
    assert.deepEqual(val, { data: true });
  });

  it("enforceLimit evicts LRU entries", () => {
    for (let i = 0; i < 10; i++) {
      store.set(`test:limit:${i}`, `value-${i}`);
    }
    const sizeBefore = store.size();
    assert.ok(sizeBefore >= 10);

    const evicted = store.enforceLimit(5);
    assert.ok(evicted > 0, "Should have evicted some entries");
    assert.ok(store.size() <= 5, "Size should be at or below limit");
  });

  it("rejects values larger than 512KB", () => {
    const largeValue = "x".repeat(600 * 1024);
    assert.throws(
      () => store.set("test:large", largeValue),
      /too large/i,
    );
  });

  it("handles operations on closed store gracefully", () => {
    const tempStore = new SqliteMemoryStore({
      workspaceHash: TEST_WORKSPACE_HASH,
      enabled: true,
    });
    tempStore.set("test:before-close", "val");
    tempStore.close();

    // After close, get should either return undefined or throw — not crash
    try {
      const val = tempStore.get("test:before-close");
      // Fallback may return undefined — that's fine
      assert.ok(val === undefined || val === "val", "Should return undefined or cached value");
    } catch (err) {
      assert.ok(err, "Error is acceptable after close");
    }
  });

  it("disabled store returns null/undefined/false for all operations", () => {
    const disabled = new SqliteMemoryStore({
      workspaceHash: TEST_WORKSPACE_HASH,
      enabled: false,
    });

    assert.equal(disabled.set("k", "v"), null);
    assert.equal(disabled.get("k"), undefined);
    assert.equal(disabled.has("k"), false);
    assert.equal(disabled.size(), 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Blackboard with persistence
// ═══════════════════════════════════════════════════════════════

describe("Blackboard with SqliteMemoryStore persistence", () => {
  let store;

  beforeEach(() => {
    if (store) {
      try { store.close(); } catch { /* ignore */ }
    }
    store = new SqliteMemoryStore({
      workspaceHash: TEST_WORKSPACE_HASH,
      enabled: true,
    });
  });

  after(() => {
    if (store) {
      try { store.close(); } catch { /* ignore */ }
    }
  });

  it("post() persists messages to SQLite store", () => {
    const bb = new Blackboard({ persistence: store });
    bb.post("agent-1", null, "status", { msg: "hello" });

    // Verify persistence store has the messages
    const saved = store.get("blackboard:messages");
    assert.ok(Array.isArray(saved), "Persisted messages should be an array");
    assert.equal(saved.length, 1);
    assert.equal(saved[0].from, "agent-1");
    assert.equal(saved[0].topic, "status");
  });

  it("setShared() persists shared state to SQLite store", () => {
    const bb = new Blackboard({ persistence: store });
    bb.setShared("buildStatus", "passing");
    bb.setShared("testCount", 42);

    const saved = store.get("blackboard:shared");
    assert.ok(saved, "Shared state should be persisted");
    assert.equal(saved.buildStatus, "passing");
    assert.equal(saved.testCount, 42);
  });

  it("constructor loads existing shared state from persistence", () => {
    // Pre-populate persistence
    store.set("blackboard:shared", { existingKey: "existingValue" });

    const bb = new Blackboard({ persistence: store });
    assert.equal(bb.getShared("existingKey"), "existingValue");
  });

  it("works without persistence (null)", () => {
    const bb = new Blackboard();
    bb.post("a1", null, "test", { x: 1 });
    bb.setShared("key", "val");

    assert.equal(bb.getShared("key"), "val");
    const msgs = bb.read("a1", "test");
    assert.equal(msgs.length, 1);
  });
});
