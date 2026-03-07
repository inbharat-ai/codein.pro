/**
 * CodIn MAS — Batch Engine
 *
 * Groups operations by type and dependency for efficient execution.
 * Rules:
 *   - Group reads, searches, memory ops, safe MCP calls → parallel
 *   - NEVER group dependent writes
 *   - NEVER parallelize same-file edits
 *   - Serialize destructive ops
 *   - Log all decisions to the event stream
 */
"use strict";

const { EVENT_TYPE, createSwarmEvent, createBatchGroup } = require("./types");

// ─── Operation Types ─────────────────────────────────────────
const BATCH_TYPE = Object.freeze({
  READ: "read",
  SEARCH: "search",
  MEMORY: "memory",
  MCP_SAFE: "mcp_safe",
  WRITE: "write",
  DESTRUCTIVE: "destructive",
  COMMAND: "command",
});

// Safe for parallel execution
const PARALLEL_SAFE = new Set([
  BATCH_TYPE.READ,
  BATCH_TYPE.SEARCH,
  BATCH_TYPE.MEMORY,
  BATCH_TYPE.MCP_SAFE,
]);

// ═══════════════════════════════════════════════════════════════
// BATCH PLANNER
// ═══════════════════════════════════════════════════════════════

class BatchPlanner {
  /**
   * Analyze a list of operations and group them into BatchGroups.
   *
   * @param {object[]} operations — Each has { type, target, action, dependencies?, data? }
   * @returns {object[]} BatchGroup[]
   */
  analyze(operations) {
    if (!Array.isArray(operations) || operations.length === 0) return [];

    // Step 1: Classify each operation
    const classified = operations.map((op, i) => ({
      index: i,
      op,
      type: this._classifyType(op),
      target: op.target || null,
      dependencies: op.dependencies || [],
    }));

    // Step 2: Group parallel-safe ops (no same-file conflicts, no dependencies)
    const groups = [];
    const processed = new Set();

    // First pass: batch all safe reads/searches/memory ops
    for (const batchType of [
      BATCH_TYPE.READ,
      BATCH_TYPE.SEARCH,
      BATCH_TYPE.MEMORY,
      BATCH_TYPE.MCP_SAFE,
    ]) {
      const matching = classified.filter(
        (c) => !processed.has(c.index) && c.type === batchType,
      );
      if (matching.length === 0) continue;

      // Split by dependency — items with unprocessed dependencies must wait
      const ready = matching.filter((c) =>
        c.dependencies.every((d) => processed.has(d)),
      );
      if (ready.length > 0) {
        groups.push(
          createBatchGroup({
            type: batchType,
            operations: ready.map((c) => c.op),
            parallel: true,
          }),
        );
        for (const c of ready) processed.add(c.index);
      }
    }

    // Second pass: writes — group by target file (no same-file parallel)
    const writeOps = classified.filter(
      (c) => !processed.has(c.index) && c.type === BATCH_TYPE.WRITE,
    );
    const writesByFile = new Map();
    for (const c of writeOps) {
      const key = c.target || `_idx_${c.index}`;
      if (!writesByFile.has(key)) writesByFile.set(key, []);
      writesByFile.get(key).push(c);
    }

    // Different files can be written in parallel, same file must be sequential
    const parallelWrites = [];
    for (const [, fileOps] of writesByFile) {
      if (
        fileOps.length === 1 &&
        fileOps[0].dependencies.every((d) => processed.has(d))
      ) {
        parallelWrites.push(fileOps[0]);
      } else {
        // Sequential: each op in this file is its own group
        for (const c of fileOps) {
          groups.push(
            createBatchGroup({
              type: BATCH_TYPE.WRITE,
              operations: [c.op],
              parallel: false,
            }),
          );
          processed.add(c.index);
        }
      }
    }

    if (parallelWrites.length > 0) {
      groups.push(
        createBatchGroup({
          type: BATCH_TYPE.WRITE,
          operations: parallelWrites.map((c) => c.op),
          parallel: parallelWrites.length > 1,
        }),
      );
      for (const c of parallelWrites) processed.add(c.index);
    }

    // Third pass: destructive and commands — always sequential
    for (const batchType of [BATCH_TYPE.DESTRUCTIVE, BATCH_TYPE.COMMAND]) {
      const remaining = classified.filter(
        (c) => !processed.has(c.index) && c.type === batchType,
      );
      for (const c of remaining) {
        groups.push(
          createBatchGroup({
            type: batchType,
            operations: [c.op],
            parallel: false,
          }),
        );
        processed.add(c.index);
      }
    }

    // Final pass: anything not yet grouped
    const ungrouped = classified.filter((c) => !processed.has(c.index));
    for (const c of ungrouped) {
      groups.push(
        createBatchGroup({
          type: c.type,
          operations: [c.op],
          parallel: false,
        }),
      );
      processed.add(c.index);
    }

    return groups;
  }

  _classifyType(op) {
    const action = (op.action || op.type || "").toLowerCase();
    if (
      action.includes("read") ||
      action.includes("get") ||
      action.includes("list")
    )
      return BATCH_TYPE.READ;
    if (
      action.includes("search") ||
      action.includes("find") ||
      action.includes("grep")
    )
      return BATCH_TYPE.SEARCH;
    if (
      action.includes("memory") ||
      action.includes("recall") ||
      action.includes("remember")
    )
      return BATCH_TYPE.MEMORY;
    if (
      action.includes("mcp") &&
      !action.includes("write") &&
      !action.includes("delete")
    )
      return BATCH_TYPE.MCP_SAFE;
    if (
      action.includes("delete") ||
      action.includes("remove") ||
      action.includes("drop")
    )
      return BATCH_TYPE.DESTRUCTIVE;
    if (
      action.includes("command") ||
      action.includes("exec") ||
      action.includes("run") ||
      action.includes("shell")
    )
      return BATCH_TYPE.COMMAND;
    if (
      action.includes("write") ||
      action.includes("create") ||
      action.includes("edit") ||
      action.includes("update")
    )
      return BATCH_TYPE.WRITE;
    return BATCH_TYPE.WRITE; // Default to write (fail-safe: sequential)
  }
}

// ═══════════════════════════════════════════════════════════════
// BATCH EXECUTOR
// ═══════════════════════════════════════════════════════════════

class BatchExecutor {
  /**
   * @param {object} opts
   * @param {function} opts.executeOp — (operation) => Promise<result>
   * @param {function} [opts.emitEvent]
   * @param {number} [opts.maxParallel] — Max concurrent parallel ops (default 5)
   */
  constructor({ executeOp, emitEvent = null, maxParallel = 5 }) {
    this._executeOp = executeOp;
    this._emitEvent = emitEvent;
    this._maxParallel = maxParallel;
  }

  /**
   * Execute all batch groups in sequence (groups are ordered by dependency).
   * Within each parallel group, execute ops concurrently (up to maxParallel).
   *
   * @param {object[]} groups — BatchGroup[]
   * @returns {Promise<object[]>} Results per group
   */
  async execute(groups) {
    const groupResults = [];

    for (const group of groups) {
      this._emit(EVENT_TYPE.BATCH_START, {
        groupId: group.id,
        type: group.type,
        opCount: group.operations.length,
        parallel: group.parallel,
      });

      const start = Date.now();
      let results;

      if (group.parallel && group.operations.length > 1) {
        results = await this._executeParallel(group.operations);
      } else {
        results = await this._executeSequential(group.operations);
      }

      const elapsed = Date.now() - start;
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      this._emit(EVENT_TYPE.BATCH_COMPLETE, {
        groupId: group.id,
        type: group.type,
        succeeded,
        failed,
        durationMs: elapsed,
      });

      groupResults.push({
        groupId: group.id,
        type: group.type,
        results,
        elapsed,
      });
    }

    return groupResults;
  }

  async _executeParallel(operations) {
    const results = [];
    // Process in chunks of maxParallel
    for (let i = 0; i < operations.length; i += this._maxParallel) {
      const chunk = operations.slice(i, i + this._maxParallel);
      const chunkResults = await Promise.allSettled(
        chunk.map((op) => this._executeSingle(op)),
      );
      for (const r of chunkResults) {
        results.push(
          r.status === "fulfilled"
            ? r.value
            : { success: false, error: r.reason?.message || "Unknown error" },
        );
      }
    }
    return results;
  }

  async _executeSequential(operations) {
    const results = [];
    for (const op of operations) {
      results.push(await this._executeSingle(op));
    }
    return results;
  }

  async _executeSingle(op) {
    try {
      const result = await this._executeOp(op);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  _emit(type, data) {
    if (this._emitEvent) {
      this._emitEvent(createSwarmEvent({ type, data }));
    }
  }
}

module.exports = {
  BATCH_TYPE,
  PARALLEL_SAFE,
  BatchPlanner,
  BatchExecutor,
};
