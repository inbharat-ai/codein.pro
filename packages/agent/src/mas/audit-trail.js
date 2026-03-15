/**
 * CodeIn Multi-Agent Swarm — Audit Trail
 *
 * Structured audit logging for every significant MAS action:
 * skill executions, permission decisions, plan lifecycle, file writes,
 * command runs, and git operations.
 *
 * Buffers entries in memory and periodically flushes to persistence
 * (SqliteMemoryStore) when available. Works fully in-memory otherwise.
 */
"use strict";

// ═══════════════════════════════════════════════════════════════
// 1. AUDIT ACTION ENUM
// ═══════════════════════════════════════════════════════════════

const AUDIT_ACTION = Object.freeze({
  SKILL_EXECUTE: "skill_execute",
  PERMISSION_REQUEST: "permission_request",
  PERMISSION_RESPONSE: "permission_response",
  STEP_START: "step_start",
  STEP_COMPLETE: "step_complete",
  STEP_FAIL: "step_fail",
  STEP_ROLLBACK: "step_rollback",
  SKILL_GENERATED: "skill_generated",
  PLAN_CREATED: "plan_created",
  PLAN_COMPLETED: "plan_completed",
  PLAN_FAILED: "plan_failed",
  FILE_WRITE: "file_write",
  COMMAND_RUN: "command_run",
  GIT_OP: "git_op",
});

const VALID_ACTIONS = new Set(Object.values(AUDIT_ACTION));

// ═══════════════════════════════════════════════════════════════
// 2. AUDIT TRAIL CLASS
// ═══════════════════════════════════════════════════════════════

class AuditTrail {
  /**
   * @param {object} [opts]
   * @param {object} [opts.persistence] — SqliteMemoryStore instance (optional)
   * @param {number} [opts.maxInMemory] — Max entries kept in memory (default 5000)
   */
  constructor({ persistence = null, maxInMemory = 5000 } = {}) {
    /** @type {object|null} */
    this._persistence = persistence;

    /** @type {number} */
    this._maxInMemory = maxInMemory;

    /** @type {Array<object>} All entries (in-memory ring) */
    this._entries = [];

    /** @type {Array<object>} Buffer of entries not yet flushed to persistence */
    this._buffer = [];

    /** @type {number} Flush every N buffered entries */
    this._flushThreshold = 100;

    /** @type {ReturnType<typeof setInterval>|null} */
    this._flushTimer = null;

    // Start periodic flush (every 10s) if persistence is available
    if (this._persistence) {
      this._flushTimer = setInterval(() => this.flush(), 10000);
      if (this._flushTimer.unref) this._flushTimer.unref();
    }

    // Load existing entries from persistence on construction
    this._loadFromPersistence();
  }

  // ─── Core API ────────────────────────────────────────────

  /**
   * Record an audit entry.
   *
   * @param {object} entry
   * @param {string} entry.action — One of AUDIT_ACTION values
   * @param {string} [entry.planId]
   * @param {string} [entry.stepId]
   * @param {string} [entry.agentId]
   * @param {string} [entry.skillName]
   * @param {*}      [entry.input]
   * @param {*}      [entry.output]
   * @param {string} [entry.error]
   * @param {number} [entry.durationMs]
   * @param {number} [entry.costUSD]
   * @param {object} [entry.metadata]
   * @returns {object} The recorded entry (with timestamp + id)
   */
  record(entry) {
    if (!entry || !entry.action) {
      throw new Error("Audit entry must include an action");
    }
    if (!VALID_ACTIONS.has(entry.action)) {
      throw new Error(`Invalid audit action: ${entry.action}`);
    }

    const record = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action: entry.action,
      planId: entry.planId || null,
      stepId: entry.stepId || null,
      agentId: entry.agentId || null,
      skillName: entry.skillName || null,
      input: entry.input !== undefined ? entry.input : null,
      output: entry.output !== undefined ? entry.output : null,
      error: entry.error || null,
      durationMs:
        typeof entry.durationMs === "number" ? entry.durationMs : null,
      costUSD: typeof entry.costUSD === "number" ? entry.costUSD : null,
      metadata: entry.metadata || null,
      timestamp: Date.now(),
    };

    // Add to in-memory store
    this._entries.push(record);
    if (this._entries.length > this._maxInMemory) {
      this._entries = this._entries.slice(-this._maxInMemory);
    }

    // Add to flush buffer
    if (this._persistence) {
      this._buffer.push(record);
      if (this._buffer.length >= this._flushThreshold) {
        this.flush();
      }
    }

    return record;
  }

  /**
   * Get all audit entries for a given plan.
   * @param {string} planId
   * @returns {Array<object>}
   */
  getByPlan(planId) {
    return this._entries.filter((e) => e.planId === planId);
  }

  /**
   * Get entries filtered by action type.
   * @param {string} action — One of AUDIT_ACTION values
   * @param {object} [opts]
   * @param {number} [opts.limit]
   * @param {number} [opts.offset]
   * @returns {Array<object>}
   */
  getByAction(action, { limit = 100, offset = 0 } = {}) {
    const filtered = this._entries.filter((e) => e.action === action);
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get entries within a time range.
   * @param {number} startMs — Start timestamp (inclusive)
   * @param {number} endMs — End timestamp (inclusive)
   * @param {object} [opts]
   * @param {number} [opts.limit]
   * @returns {Array<object>}
   */
  getByTimeRange(startMs, endMs, { limit = 100 } = {}) {
    const filtered = this._entries.filter(
      (e) => e.timestamp >= startMs && e.timestamp <= endMs,
    );
    return filtered.slice(0, limit);
  }

  /**
   * Get the most recent entries.
   * @param {number} [limit=50]
   * @returns {Array<object>}
   */
  getRecent(limit = 50) {
    return this._entries.slice(-limit);
  }

  /**
   * Aggregate cost breakdown per step for a plan.
   * @param {string} planId
   * @returns {{ totalCostUSD: number, steps: Object<string, number> }}
   */
  getCostBreakdown(planId) {
    const planEntries = this._entries.filter((e) => e.planId === planId);
    const steps = {};
    let totalCostUSD = 0;

    for (const entry of planEntries) {
      if (typeof entry.costUSD === "number" && entry.costUSD > 0) {
        totalCostUSD += entry.costUSD;
        const key = entry.stepId || "__unattributed__";
        steps[key] = (steps[key] || 0) + entry.costUSD;
      }
    }

    return { totalCostUSD, steps };
  }

  /**
   * Flush buffered entries to persistence immediately.
   */
  flush() {
    if (!this._persistence || this._buffer.length === 0) return;

    try {
      // Store each buffered entry under an "audit:" prefix key
      for (const entry of this._buffer) {
        this._persistence.set(`audit:${entry.id}`, entry, {
          scope: "long_term",
          tags: ["audit", entry.action],
        });
      }
      this._buffer = [];
    } catch {
      // Non-fatal: entries remain in the buffer for the next flush attempt
    }
  }

  /**
   * Delete entries older than maxAgeMs.
   * @param {number} maxAgeMs
   * @returns {number} Number of entries pruned
   */
  prune(maxAgeMs) {
    const threshold = Date.now() - maxAgeMs;
    const before = this._entries.length;
    this._entries = this._entries.filter((e) => e.timestamp >= threshold);
    const pruned = before - this._entries.length;

    // Also prune from persistence
    if (this._persistence && pruned > 0) {
      try {
        this._persistence.prune(maxAgeMs);
      } catch {
        // Non-fatal
      }
    }

    return pruned;
  }

  /**
   * Total number of in-memory entries.
   * @returns {number}
   */
  size() {
    return this._entries.length;
  }

  /**
   * Destroy the audit trail: stop timers, clear memory.
   */
  destroy() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    // Final flush before teardown
    this.flush();
    this._entries = [];
    this._buffer = [];
  }

  // ─── Internal ────────────────────────────────────────────

  /**
   * Load previously persisted audit entries back into memory.
   */
  _loadFromPersistence() {
    if (!this._persistence) return;
    try {
      const snapshot = this._persistence.snapshot();
      if (!snapshot || typeof snapshot !== "object") return;
      for (const [key, stored] of Object.entries(snapshot)) {
        if (!key.startsWith("audit:")) continue;
        const value = stored.value !== undefined ? stored.value : stored;
        if (value && value.action && value.timestamp) {
          this._entries.push(value);
        }
      }
      // Sort by timestamp and enforce max
      this._entries.sort((a, b) => a.timestamp - b.timestamp);
      if (this._entries.length > this._maxInMemory) {
        this._entries = this._entries.slice(-this._maxInMemory);
      }
    } catch {
      // Non-fatal: start with empty entries
    }
  }
}

module.exports = { AuditTrail, AUDIT_ACTION };
