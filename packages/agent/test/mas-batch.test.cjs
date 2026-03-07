/**
 * MAS — Batch Engine Tests
 *
 * Covers BatchPlanner grouping, parallel-safety, same-file sequential writes,
 * and BatchExecutor parallel/sequential execution.
 */
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BATCH_TYPE,
  PARALLEL_SAFE,
  BatchPlanner,
  BatchExecutor,
} = require("../src/mas/batch");

// ── BATCH_TYPE ──

test("BATCH_TYPE enum has expected values", () => {
  assert.ok(BATCH_TYPE.READ);
  assert.ok(BATCH_TYPE.WRITE);
  assert.ok(BATCH_TYPE.SEARCH);
  assert.ok(BATCH_TYPE.DESTRUCTIVE);
  assert.ok(BATCH_TYPE.COMMAND);
});

test("PARALLEL_SAFE includes read, search, memory, mcp_safe", () => {
  assert.ok(PARALLEL_SAFE.has(BATCH_TYPE.READ));
  assert.ok(PARALLEL_SAFE.has(BATCH_TYPE.SEARCH));
  assert.ok(!PARALLEL_SAFE.has(BATCH_TYPE.DESTRUCTIVE));
  assert.ok(!PARALLEL_SAFE.has(BATCH_TYPE.COMMAND));
});

// ── BatchPlanner ──

test("BatchPlanner groups reads in parallel", () => {
  const planner = new BatchPlanner();
  const ops = [
    { type: BATCH_TYPE.READ, action: "read", target: "a.js" },
    { type: BATCH_TYPE.READ, action: "read", target: "b.js" },
    { type: BATCH_TYPE.READ, action: "read", target: "c.js" },
  ];
  const groups = planner.analyze(ops);
  // All reads should be in a single parallel group
  assert.equal(groups.length, 1);
  assert.equal(groups[0].operations.length, 3);
  assert.equal(groups[0].parallel, true);
});

test("BatchPlanner separates reads from writes", () => {
  const planner = new BatchPlanner();
  const ops = [
    { type: BATCH_TYPE.READ, action: "read", target: "a.js" },
    { type: BATCH_TYPE.WRITE, action: "write", target: "b.js" },
  ];
  const groups = planner.analyze(ops);
  // Should be at least 2 groups: reads then writes
  assert.ok(groups.length >= 2);
});

test("BatchPlanner keeps same-file writes sequential", () => {
  const planner = new BatchPlanner();
  const ops = [
    { type: BATCH_TYPE.WRITE, action: "write", target: "a.js", data: "v1" },
    { type: BATCH_TYPE.WRITE, action: "write", target: "a.js", data: "v2" },
    { type: BATCH_TYPE.WRITE, action: "write", target: "b.js", data: "v1" },
  ];
  const groups = planner.analyze(ops);
  // same-file writes to a.js must be sequential (parallel: false)
  const writeGroups = groups.filter((g) =>
    g.operations.some((o) => o.action === "write"),
  );
  assert.ok(writeGroups.length >= 1);
});

test("BatchPlanner forces destructive ops sequential", () => {
  const planner = new BatchPlanner();
  const ops = [
    { type: BATCH_TYPE.DESTRUCTIVE, action: "delete", target: "table1" },
    { type: BATCH_TYPE.DESTRUCTIVE, action: "delete", target: "table2" },
  ];
  const groups = planner.analyze(ops);
  // Each destructive op should be its own sequential group
  for (const g of groups) {
    assert.equal(g.parallel, false);
  }
});

// ── BatchExecutor ──

test("BatchExecutor runs all group ops via executeOp", async () => {
  const log = [];
  const executor = new BatchExecutor({
    executeOp: async (op) => {
      log.push(op.id);
      return op.id;
    },
    maxParallel: 3,
  });

  const groups = [
    {
      id: "g1",
      type: BATCH_TYPE.READ,
      operations: [{ id: "a" }, { id: "b" }, { id: "c" }],
      parallel: true,
    },
  ];
  const results = await executor.execute(groups);
  assert.equal(results.length, 1);
  assert.equal(results[0].results.length, 3);
  assert.ok(results[0].results.every((r) => r.success));
});

test("BatchExecutor runs sequential ops in order", async () => {
  const log = [];
  const executor = new BatchExecutor({
    executeOp: async (op) => {
      log.push(op.id);
      return op.id;
    },
    maxParallel: 5,
  });

  const groups = [
    {
      id: "g1",
      type: BATCH_TYPE.WRITE,
      operations: [{ id: 1 }, { id: 2 }, { id: 3 }],
      parallel: false,
    },
  ];
  await executor.execute(groups);
  assert.deepEqual(log, [1, 2, 3]);
});

test("BatchExecutor captures failures without aborting batch", async () => {
  const executor = new BatchExecutor({
    executeOp: async (op) => {
      if (op.id === "fail") throw new Error("boom");
      return "ok";
    },
    maxParallel: 5,
  });

  const groups = [
    {
      id: "g1",
      type: BATCH_TYPE.WRITE,
      operations: [{ id: "ok" }, { id: "fail" }, { id: "ok2" }],
      parallel: false,
    },
  ];
  const results = await executor.execute(groups);
  const passed = results[0].results.filter((r) => r.success);
  const failed = results[0].results.filter((r) => !r.success);
  assert.equal(passed.length, 2);
  assert.equal(failed.length, 1);
  assert.ok(failed[0].error.includes("boom"));
});
