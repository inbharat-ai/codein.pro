/**
 * Tests for AuditTrail module
 * Jest-compatible format with describe/it globals + require("node:assert")
 */
"use strict";
const { describe, it, afterEach } = require("node:test");

const assert = require("node:assert");
const { AuditTrail, AUDIT_ACTION } = require("../src/mas/audit-trail");

// ─── Mock persistence (mimics SqliteMemoryStore in-memory fallback) ──

function createMockPersistence() {
  const store = new Map();
  return {
    _store: store,
    get(key) {
      const entry = store.get(key);
      return entry ? entry.value : undefined;
    },
    set(key, value, opts = {}) {
      store.set(key, { value, scope: opts.scope || "long_term", createdAt: Date.now() });
      return { key, scope: opts.scope || "long_term", createdAt: Date.now() };
    },
    has(key) {
      return store.has(key);
    },
    delete(key) {
      return store.delete(key);
    },
    size() {
      return store.size;
    },
    prune(maxAgeMs) {
      const threshold = Date.now() - maxAgeMs;
      let pruned = 0;
      for (const [key, entry] of store) {
        if (entry.createdAt < threshold) {
          store.delete(key);
          pruned++;
        }
      }
      return pruned;
    },
    snapshot() {
      const result = {};
      for (const [key, entry] of store) {
        result[key] = entry;
      }
      return result;
    },
  };
}

// ═══════════════════════════════════════════════════════════════

describe("AuditTrail", () => {
  afterEach(() => {
    // Ensure timers are cleaned up
  });

  describe("record()", () => {
    it("should record an entry and return it with timestamp and id", () => {
      const trail = new AuditTrail();
      const entry = trail.record({
        action: AUDIT_ACTION.SKILL_EXECUTE,
        planId: "plan_1",
        stepId: "step_1",
        agentId: "agent_1",
        skillName: "readFile",
      });

      assert.ok(entry.id.startsWith("audit_"));
      assert.strictEqual(entry.action, AUDIT_ACTION.SKILL_EXECUTE);
      assert.strictEqual(entry.planId, "plan_1");
      assert.strictEqual(entry.stepId, "step_1");
      assert.strictEqual(entry.agentId, "agent_1");
      assert.strictEqual(entry.skillName, "readFile");
      assert.ok(typeof entry.timestamp === "number");
      trail.destroy();
    });

    it("should throw when action is missing", () => {
      const trail = new AuditTrail();
      assert.throws(() => trail.record({}), /must include an action/);
      trail.destroy();
    });

    it("should throw when action is invalid", () => {
      const trail = new AuditTrail();
      assert.throws(
        () => trail.record({ action: "invalid_action" }),
        /Invalid audit action/,
      );
      trail.destroy();
    });

    it("should record cost and duration fields", () => {
      const trail = new AuditTrail();
      const entry = trail.record({
        action: AUDIT_ACTION.STEP_COMPLETE,
        costUSD: 0.05,
        durationMs: 1234,
      });
      assert.strictEqual(entry.costUSD, 0.05);
      assert.strictEqual(entry.durationMs, 1234);
      trail.destroy();
    });
  });

  describe("getByPlan()", () => {
    it("should return all entries for a given plan", () => {
      const trail = new AuditTrail();
      trail.record({ action: AUDIT_ACTION.PLAN_CREATED, planId: "plan_A" });
      trail.record({ action: AUDIT_ACTION.STEP_START, planId: "plan_A", stepId: "s1" });
      trail.record({ action: AUDIT_ACTION.STEP_START, planId: "plan_B", stepId: "s2" });
      trail.record({ action: AUDIT_ACTION.STEP_COMPLETE, planId: "plan_A", stepId: "s1" });

      const result = trail.getByPlan("plan_A");
      assert.strictEqual(result.length, 3);
      assert.ok(result.every((e) => e.planId === "plan_A"));
      trail.destroy();
    });

    it("should return empty array for unknown plan", () => {
      const trail = new AuditTrail();
      trail.record({ action: AUDIT_ACTION.PLAN_CREATED, planId: "plan_X" });
      assert.deepStrictEqual(trail.getByPlan("plan_unknown"), []);
      trail.destroy();
    });
  });

  describe("getByAction()", () => {
    it("should filter entries by action type", () => {
      const trail = new AuditTrail();
      trail.record({ action: AUDIT_ACTION.FILE_WRITE, planId: "p1" });
      trail.record({ action: AUDIT_ACTION.COMMAND_RUN, planId: "p1" });
      trail.record({ action: AUDIT_ACTION.FILE_WRITE, planId: "p2" });

      const writes = trail.getByAction(AUDIT_ACTION.FILE_WRITE);
      assert.strictEqual(writes.length, 2);
      assert.ok(writes.every((e) => e.action === AUDIT_ACTION.FILE_WRITE));
      trail.destroy();
    });

    it("should respect limit and offset", () => {
      const trail = new AuditTrail();
      for (let i = 0; i < 10; i++) {
        trail.record({ action: AUDIT_ACTION.GIT_OP, metadata: { index: i } });
      }

      const page1 = trail.getByAction(AUDIT_ACTION.GIT_OP, { limit: 3, offset: 0 });
      assert.strictEqual(page1.length, 3);

      const page2 = trail.getByAction(AUDIT_ACTION.GIT_OP, { limit: 3, offset: 3 });
      assert.strictEqual(page2.length, 3);

      // Entries should be different
      assert.notStrictEqual(page1[0].id, page2[0].id);
      trail.destroy();
    });
  });

  describe("getByTimeRange()", () => {
    it("should return entries within the specified time range", () => {
      const trail = new AuditTrail();
      const before = Date.now();
      trail.record({ action: AUDIT_ACTION.PLAN_CREATED });
      trail.record({ action: AUDIT_ACTION.STEP_START });
      const after = Date.now();

      const result = trail.getByTimeRange(before, after);
      assert.strictEqual(result.length, 2);
      trail.destroy();
    });

    it("should respect limit parameter", () => {
      const trail = new AuditTrail();
      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        trail.record({ action: AUDIT_ACTION.SKILL_EXECUTE });
      }
      const end = Date.now();

      const result = trail.getByTimeRange(start, end, { limit: 3 });
      assert.strictEqual(result.length, 3);
      trail.destroy();
    });
  });

  describe("getRecent()", () => {
    it("should return bounded results", () => {
      const trail = new AuditTrail();
      for (let i = 0; i < 100; i++) {
        trail.record({ action: AUDIT_ACTION.SKILL_EXECUTE, metadata: { i } });
      }

      const recent = trail.getRecent(10);
      assert.strictEqual(recent.length, 10);
      // Should be the last 10 entries
      assert.strictEqual(recent[9].metadata.i, 99);
      assert.strictEqual(recent[0].metadata.i, 90);
      trail.destroy();
    });

    it("should use default limit of 50", () => {
      const trail = new AuditTrail();
      for (let i = 0; i < 100; i++) {
        trail.record({ action: AUDIT_ACTION.SKILL_EXECUTE });
      }

      const recent = trail.getRecent();
      assert.strictEqual(recent.length, 50);
      trail.destroy();
    });
  });

  describe("getCostBreakdown()", () => {
    it("should aggregate cost per step for a plan", () => {
      const trail = new AuditTrail();
      trail.record({ action: AUDIT_ACTION.STEP_COMPLETE, planId: "p1", stepId: "s1", costUSD: 0.10 });
      trail.record({ action: AUDIT_ACTION.STEP_COMPLETE, planId: "p1", stepId: "s2", costUSD: 0.25 });
      trail.record({ action: AUDIT_ACTION.STEP_COMPLETE, planId: "p1", stepId: "s1", costUSD: 0.05 });
      trail.record({ action: AUDIT_ACTION.STEP_COMPLETE, planId: "p2", stepId: "s3", costUSD: 1.00 });

      const breakdown = trail.getCostBreakdown("p1");
      assert.ok(Math.abs(breakdown.totalCostUSD - 0.40) < 0.0001);
      assert.ok(Math.abs(breakdown.steps.s1 - 0.15) < 0.0001);
      assert.ok(Math.abs(breakdown.steps.s2 - 0.25) < 0.0001);
      assert.strictEqual(breakdown.steps.s3, undefined);
      trail.destroy();
    });

    it("should return zero total for plan with no costs", () => {
      const trail = new AuditTrail();
      trail.record({ action: AUDIT_ACTION.STEP_START, planId: "p1", stepId: "s1" });

      const breakdown = trail.getCostBreakdown("p1");
      assert.strictEqual(breakdown.totalCostUSD, 0);
      assert.deepStrictEqual(breakdown.steps, {});
      trail.destroy();
    });
  });

  describe("flush() and persistence", () => {
    it("should flush buffered entries to persistence", () => {
      const persistence = createMockPersistence();
      const trail = new AuditTrail({ persistence });

      trail.record({ action: AUDIT_ACTION.PLAN_CREATED, planId: "p1" });
      trail.record({ action: AUDIT_ACTION.STEP_START, planId: "p1" });

      // Entries should be in buffer but may or may not be flushed yet
      trail.flush();

      // After flush, persistence should have the entries
      const snapshot = persistence.snapshot();
      const auditKeys = Object.keys(snapshot).filter((k) => k.startsWith("audit:"));
      assert.strictEqual(auditKeys.length, 2);
      trail.destroy();
    });

    it("should auto-flush when buffer reaches threshold", () => {
      const persistence = createMockPersistence();
      const trail = new AuditTrail({ persistence });
      // Default flush threshold is 100
      trail._flushThreshold = 5;

      for (let i = 0; i < 6; i++) {
        trail.record({ action: AUDIT_ACTION.SKILL_EXECUTE });
      }

      // Should have auto-flushed after 5 entries
      const snapshot = persistence.snapshot();
      const auditKeys = Object.keys(snapshot).filter((k) => k.startsWith("audit:"));
      assert.ok(auditKeys.length >= 5, `Expected >= 5 flushed entries, got ${auditKeys.length}`);
      trail.destroy();
    });

    it("should load entries from persistence on construction", () => {
      const persistence = createMockPersistence();

      // Pre-populate persistence
      persistence.set("audit:test_1", {
        id: "audit_test_1",
        action: AUDIT_ACTION.PLAN_CREATED,
        planId: "p_old",
        timestamp: Date.now() - 5000,
        stepId: null,
        agentId: null,
        skillName: null,
        input: null,
        output: null,
        error: null,
        durationMs: null,
        costUSD: null,
        metadata: null,
      });

      const trail = new AuditTrail({ persistence });
      const entries = trail.getByPlan("p_old");
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].action, AUDIT_ACTION.PLAN_CREATED);
      trail.destroy();
    });
  });

  describe("prune()", () => {
    it("should remove entries older than maxAgeMs", () => {
      const trail = new AuditTrail();

      // Manually insert an old entry
      trail._entries.push({
        id: "audit_old",
        action: AUDIT_ACTION.PLAN_CREATED,
        planId: null,
        stepId: null,
        agentId: null,
        skillName: null,
        input: null,
        output: null,
        error: null,
        durationMs: null,
        costUSD: null,
        metadata: null,
        timestamp: Date.now() - 60000, // 60 seconds ago
      });
      trail.record({ action: AUDIT_ACTION.PLAN_CREATED }); // fresh entry

      const pruned = trail.prune(30000); // prune entries older than 30s
      assert.strictEqual(pruned, 1);
      assert.strictEqual(trail.size(), 1);
      trail.destroy();
    });
  });

  describe("in-memory only (no persistence)", () => {
    it("should work fully without persistence", () => {
      const trail = new AuditTrail();

      trail.record({ action: AUDIT_ACTION.SKILL_EXECUTE, planId: "p1" });
      trail.record({ action: AUDIT_ACTION.FILE_WRITE, planId: "p1" });
      trail.record({ action: AUDIT_ACTION.COMMAND_RUN, planId: "p2" });

      assert.strictEqual(trail.size(), 3);
      assert.strictEqual(trail.getByPlan("p1").length, 2);
      assert.strictEqual(trail.getByAction(AUDIT_ACTION.COMMAND_RUN).length, 1);
      assert.strictEqual(trail.getRecent(2).length, 2);

      trail.flush(); // Should be a no-op
      assert.strictEqual(trail.size(), 3);
      trail.destroy();
    });

    it("should enforce maxInMemory limit", () => {
      const trail = new AuditTrail({ maxInMemory: 10 });

      for (let i = 0; i < 25; i++) {
        trail.record({ action: AUDIT_ACTION.SKILL_EXECUTE, metadata: { i } });
      }

      assert.strictEqual(trail.size(), 10);
      // Should keep the most recent entries
      const recent = trail.getRecent(10);
      assert.strictEqual(recent[0].metadata.i, 15);
      assert.strictEqual(recent[9].metadata.i, 24);
      trail.destroy();
    });
  });

  describe("AUDIT_ACTION enum", () => {
    it("should be frozen and contain all expected keys", () => {
      assert.ok(Object.isFrozen(AUDIT_ACTION));
      const expected = [
        "SKILL_EXECUTE", "PERMISSION_REQUEST", "PERMISSION_RESPONSE",
        "STEP_START", "STEP_COMPLETE", "STEP_FAIL", "STEP_ROLLBACK",
        "SKILL_GENERATED", "PLAN_CREATED", "PLAN_COMPLETED", "PLAN_FAILED",
        "FILE_WRITE", "COMMAND_RUN", "GIT_OP",
      ];
      for (const key of expected) {
        assert.ok(key in AUDIT_ACTION, `Missing key: ${key}`);
      }
    });
  });
});
