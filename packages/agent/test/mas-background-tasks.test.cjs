/**
 * MAS — Background Tasks Smoke Tests
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

let bgTasks;
try {
  bgTasks = require("../src/mas/background-tasks");
} catch (err) {
  console.error("background-tasks import failed:", err.message);
}

test("background-tasks module loads without error", () => {
  assert.ok(bgTasks, "Module should load");
});

test("module exports expected items", () => {
  if (!bgTasks) return;
  const exports = Object.keys(bgTasks);
  assert.ok(exports.length > 0, `Module exports: ${exports.join(", ")}`);
});

test("PRIORITY enum has expected levels", () => {
  if (!bgTasks || !bgTasks.PRIORITY) return;
  assert.equal(bgTasks.PRIORITY.low, 0);
  assert.equal(bgTasks.PRIORITY.normal, 1);
  assert.equal(bgTasks.PRIORITY.high, 2);
  assert.equal(bgTasks.PRIORITY.critical, 3);
});

test("TASK_STATUS enum has expected values", () => {
  if (!bgTasks || !bgTasks.TASK_STATUS) return;
  assert.ok(bgTasks.TASK_STATUS.QUEUED);
  assert.ok(bgTasks.TASK_STATUS.RUNNING);
  assert.ok(bgTasks.TASK_STATUS.COMPLETED);
  assert.ok(bgTasks.TASK_STATUS.FAILED);
  assert.ok(bgTasks.TASK_STATUS.CANCELLED);
});
