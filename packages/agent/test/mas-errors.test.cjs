/**
 * MAS — Error Types Smoke Tests
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  SwarmError,
  PermissionDeniedError,
  PathTraversalError,
  CommandNotAllowedError,
  SecretDetectedError,
  ToolValidationError,
  UnknownAgentError,
  AgentPoolFullError,
  LLMCallError,
  ToolLoopError,
  BudgetExceededError,
} = require("../src/mas/errors");

// ── Base SwarmError ──

test("SwarmError carries code, context, timestamp", () => {
  const err = new SwarmError("boom", "TEST_CODE", { foo: 1 });
  assert.ok(err instanceof Error);
  assert.ok(err instanceof SwarmError);
  assert.equal(err.message, "boom");
  assert.equal(err.code, "TEST_CODE");
  assert.deepEqual(err.context, { foo: 1 });
  assert.ok(err.timestamp);
  assert.equal(err.name, "SwarmError");
});

test("SwarmError.toJSON returns structured object", () => {
  const err = new SwarmError("msg", "CODE");
  const json = err.toJSON();
  assert.equal(json.name, "SwarmError");
  assert.equal(json.code, "CODE");
  assert.equal(json.message, "msg");
  assert.ok(json.timestamp);
  assert.ok(json.stack);
});

// ── Subclasses ──

test("PermissionDeniedError has correct code and name", () => {
  const err = new PermissionDeniedError("write_file", "not allowed");
  assert.ok(err instanceof SwarmError);
  assert.equal(err.code, "PERMISSION_DENIED");
  assert.equal(err.name, "PermissionDeniedError");
  assert.ok(err.message.includes("write_file"));
  assert.ok(err.message.includes("not allowed"));
  assert.equal(err.context.action, "write_file");
  assert.equal(err.context.reason, "not allowed");
});

test("PathTraversalError captures path and root", () => {
  const err = new PathTraversalError("../../etc/passwd", "/home/user/proj");
  assert.equal(err.code, "PATH_TRAVERSAL");
  assert.equal(err.name, "PathTraversalError");
  assert.equal(err.context.requestedPath, "../../etc/passwd");
  assert.equal(err.context.workspaceRoot, "/home/user/proj");
});

test("CommandNotAllowedError lists allowed commands", () => {
  const err = new CommandNotAllowedError("rm", ["npm", "node"]);
  assert.equal(err.code, "COMMAND_NOT_ALLOWED");
  assert.equal(err.name, "CommandNotAllowedError");
  assert.equal(err.context.command, "rm");
  assert.deepEqual(err.context.allowedCommands, ["npm", "node"]);
});

test("SecretDetectedError includes path and pattern", () => {
  const err = new SecretDetectedError(".env", "api_key");
  assert.equal(err.code, "SECRET_DETECTED");
  assert.equal(err.name, "SecretDetectedError");
  assert.equal(err.context.path, ".env");
});

test("ToolValidationError includes tool name", () => {
  const err = new ToolValidationError("read_file", "path is required");
  assert.equal(err.code, "TOOL_VALIDATION");
  assert.equal(err.name, "ToolValidationError");
  assert.ok(err.message.includes("read_file"));
});

test("UnknownAgentError includes agent type", () => {
  const err = new UnknownAgentError("hacker");
  assert.equal(err.code, "UNKNOWN_AGENT");
  assert.equal(err.context.agentType, "hacker");
});

test("AgentPoolFullError includes capacity and type", () => {
  const err = new AgentPoolFullError(10, "coder");
  assert.equal(err.code, "AGENT_POOL_FULL");
  assert.equal(err.context.maxAgents, 10);
  assert.equal(err.context.requestedType, "coder");
});

test("LLMCallError has LLM_CALL_FAILED code", () => {
  const err = new LLMCallError("timeout", { model: "gpt-4o" });
  assert.equal(err.code, "LLM_CALL_FAILED");
  assert.equal(err.context.model, "gpt-4o");
});

test("ToolLoopError has TOOL_LOOP_EXCEEDED code", () => {
  const err = new ToolLoopError("exceeded 20 loops");
  assert.equal(err.code, "TOOL_LOOP_EXCEEDED");
});

test("BudgetExceededError formats spend correctly", () => {
  const err = new BudgetExceededError(5.5, 2.0, "gpu");
  assert.equal(err.code, "BUDGET_EXCEEDED");
  assert.ok(err.message.includes("$5.50"));
  assert.ok(err.message.includes("$2.00"));
  assert.equal(err.context.spent, 5.5);
  assert.equal(err.context.cap, 2.0);
  assert.equal(err.context.resource, "gpu");
});

test("All error classes are instanceof Error", () => {
  const errors = [
    new SwarmError("a", "A"),
    new PermissionDeniedError("a", "b"),
    new PathTraversalError("a", "b"),
    new CommandNotAllowedError("a"),
    new SecretDetectedError("a", "b"),
    new ToolValidationError("a", "b"),
    new UnknownAgentError("a"),
    new AgentPoolFullError(1, "a"),
    new LLMCallError("a"),
    new ToolLoopError("a"),
    new BudgetExceededError(1, 2),
  ];
  for (const err of errors) {
    assert.ok(err instanceof Error, `${err.name} should be instanceof Error`);
    assert.ok(err instanceof SwarmError, `${err.name} should be instanceof SwarmError`);
  }
});
