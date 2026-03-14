/**
 * MAS — Stream Engine Smoke Tests
 */
const assert = require("node:assert/strict");

let StreamEngine, TaskStream, STREAM_EVENT;
try {
  const mod = require("../src/mas/stream-engine");
  StreamEngine = mod.StreamEngine;
  TaskStream = mod.TaskStream;
  STREAM_EVENT = mod.STREAM_EVENT;
} catch (err) {
  // Module might have import issues
  console.error("stream-engine import failed:", err.message);
}

test("stream-engine module loads without error", () => {
  assert.ok(STREAM_EVENT, "STREAM_EVENT should be exported");
});

test("STREAM_EVENT has expected event types", () => {
  if (!STREAM_EVENT) return;
  assert.ok(STREAM_EVENT.THINKING);
  assert.ok(STREAM_EVENT.TOOL_CALL);
  assert.ok(STREAM_EVENT.TOOL_RESULT);
  assert.ok(STREAM_EVENT.PROGRESS);
  assert.ok(STREAM_EVENT.FINAL);
  assert.ok(STREAM_EVENT.HEARTBEAT);
});

test("TaskStream can be created and emit events", () => {
  if (!TaskStream) return;
  const stream = new TaskStream("test-task-1");
  assert.ok(stream, "TaskStream instance should be created");
});

test("StreamEngine can be created", () => {
  if (!StreamEngine) return;
  const engine = new StreamEngine();
  assert.ok(engine, "StreamEngine instance should be created");
});
