/**
 * Tests for Phase 0: Central Tool Registry, Error Types, and Structured Logger
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// ─── Error Types ────────────────────────────────────────────────

describe("Error Types", () => {
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

  it("SwarmError has code, context, and timestamp", () => {
    const err = new SwarmError("test message", "TEST_CODE", { key: "val" });
    assert.equal(err.message, "test message");
    assert.equal(err.code, "TEST_CODE");
    assert.deepStrictEqual(err.context, { key: "val" });
    assert.ok(err.timestamp);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof SwarmError);
  });

  it("SwarmError.toJSON() returns structured data", () => {
    const err = new SwarmError("msg", "CODE");
    const json = err.toJSON();
    assert.equal(json.name, "SwarmError");
    assert.equal(json.code, "CODE");
    assert.equal(json.message, "msg");
    assert.ok(json.stack);
    assert.ok(json.timestamp);
  });

  it("PermissionDeniedError carries action and reason", () => {
    const err = new PermissionDeniedError("write_file", "not allowed");
    assert.ok(err instanceof SwarmError);
    assert.equal(err.code, "PERMISSION_DENIED");
    assert.equal(err.context.action, "write_file");
    assert.equal(err.context.reason, "not allowed");
  });

  it("PathTraversalError carries path and root", () => {
    const err = new PathTraversalError("../../etc/passwd", "/workspace");
    assert.equal(err.code, "PATH_TRAVERSAL");
    assert.ok(err.message.includes("../../etc/passwd"));
  });

  it("CommandNotAllowedError carries command", () => {
    const err = new CommandNotAllowedError("rm", ["npm", "node"]);
    assert.equal(err.code, "COMMAND_NOT_ALLOWED");
    assert.deepStrictEqual(err.context.allowedCommands, ["npm", "node"]);
  });

  it("SecretDetectedError carries path and pattern", () => {
    const err = new SecretDetectedError("config.yml", "password\\s*=");
    assert.equal(err.code, "SECRET_DETECTED");
  });

  it("ToolValidationError carries tool name", () => {
    const err = new ToolValidationError("read_file", "path is required");
    assert.equal(err.code, "TOOL_VALIDATION");
    assert.equal(err.context.toolName, "read_file");
  });

  it("UnknownAgentError carries agent type", () => {
    const err = new UnknownAgentError("wizard");
    assert.equal(err.code, "UNKNOWN_AGENT");
    assert.equal(err.context.agentType, "wizard");
  });

  it("AgentPoolFullError carries pool info", () => {
    const err = new AgentPoolFullError(10, "coder");
    assert.equal(err.code, "AGENT_POOL_FULL");
    assert.equal(err.context.maxAgents, 10);
  });

  it("LLMCallError has correct code", () => {
    const err = new LLMCallError("timeout after 30s");
    assert.equal(err.code, "LLM_CALL_FAILED");
  });

  it("ToolLoopError has correct code", () => {
    const err = new ToolLoopError("exceeded 5 min");
    assert.equal(err.code, "TOOL_LOOP_EXCEEDED");
  });

  it("BudgetExceededError formats USD correctly", () => {
    const err = new BudgetExceededError(5.5, 2.0, "gpu");
    assert.equal(err.code, "BUDGET_EXCEEDED");
    assert.ok(err.message.includes("$5.50"));
    assert.ok(err.message.includes("$2.00"));
  });
});

// ─── Structured Logger ──────────────────────────────────────────

describe("Structured Logger", () => {
  const { createLogger, setLogLevel, LOG_LEVEL } = require("../src/mas/logger");

  it("createLogger returns object with all log methods", () => {
    const log = createLogger("Test");
    assert.equal(typeof log.debug, "function");
    assert.equal(typeof log.info, "function");
    assert.equal(typeof log.warn, "function");
    assert.equal(typeof log.error, "function");
    assert.equal(typeof log.fatal, "function");
    assert.equal(typeof log.child, "function");
  });

  it("setLogLevel accepts valid levels", () => {
    setLogLevel("DEBUG");
    setLogLevel("ERROR");
    setLogLevel("INFO"); // reset
  });

  it("setLogLevel rejects invalid levels", () => {
    assert.throws(() => setLogLevel("VERBOSE"), /Invalid log level/);
  });

  it("LOG_LEVEL enum has correct ordering", () => {
    assert.ok(LOG_LEVEL.DEBUG < LOG_LEVEL.INFO);
    assert.ok(LOG_LEVEL.INFO < LOG_LEVEL.WARN);
    assert.ok(LOG_LEVEL.WARN < LOG_LEVEL.ERROR);
    assert.ok(LOG_LEVEL.ERROR < LOG_LEVEL.FATAL);
  });
});

// ─── Central Tool Registry ─────────────────────────────────────

describe("Central Tool Registry", () => {
  const {
    buildToolRegistry,
    resolveWorkspaceRoot,
    resolveSafePath,
    parseCommand,
    COMMANDS,
  } = require("../src/mas/tool-registry");

  it("resolveWorkspaceRoot uses context.workspaceRoot", () => {
    const root = resolveWorkspaceRoot({ workspaceRoot: "/tmp/test" });
    assert.ok(root.includes("tmp"));
  });

  it("resolveWorkspaceRoot falls back to cwd", () => {
    const root = resolveWorkspaceRoot({});
    assert.ok(root.length > 0);
  });

  it("resolveSafePath allows paths within workspace", () => {
    const root = process.cwd();
    const resolved = resolveSafePath(root, "src/file.js");
    assert.ok(resolved.startsWith(root));
  });

  it("resolveSafePath blocks path traversal", () => {
    const { PathTraversalError } = require("../src/mas/errors");
    assert.throws(
      () => resolveSafePath("/workspace", "../../etc/passwd"),
      (err) => err instanceof PathTraversalError,
    );
  });

  it("parseCommand splits quoted strings correctly", () => {
    const result = parseCommand('npm run "my test"');
    assert.deepStrictEqual(result, {
      cmd: "npm",
      args: ["run", "my test"],
    });
  });

  it("parseCommand throws on empty command", () => {
    const { ToolValidationError } = require("../src/mas/errors");
    assert.throws(
      () => parseCommand(""),
      (err) => err instanceof ToolValidationError,
    );
  });

  it("COMMANDS has all profiles", () => {
    assert.ok(COMMANDS.DEV instanceof Set);
    assert.ok(COMMANDS.TEST instanceof Set);
    assert.ok(COMMANDS.DEVOPS instanceof Set);
    assert.ok(COMMANDS.AUDIT instanceof Set);
    assert.ok(COMMANDS.DEV.has("npm"));
    assert.ok(COMMANDS.DEVOPS.has("docker"));
    assert.ok(!COMMANDS.TEST.has("docker"));
  });

  it("buildToolRegistry creates requested tools", () => {
    const mockAgent = {
      type: "coder",
      requestPermission: async () => ({ decision: "approved" }),
    };
    const context = { workspaceRoot: process.cwd() };
    const node = { id: "node_test123" };

    const registry = buildToolRegistry(mockAgent, context, node, {
      tools: ["read_file", "write_file", "run_bash"],
      agentLabel: "Test",
    });

    assert.ok(registry.read_file);
    assert.ok(registry.write_file);
    assert.ok(registry.run_bash);
    assert.equal(typeof registry.read_file.execute, "function");
    assert.equal(typeof registry.read_file.description, "string");
  });

  it("buildToolRegistry only creates requested tools", () => {
    const mockAgent = { type: "test", requestPermission: async () => ({ decision: "approved" }) };
    const registry = buildToolRegistry(mockAgent, {}, { id: "node_x" }, {
      tools: ["read_file"],
    });
    assert.ok(registry.read_file);
    assert.equal(registry.write_file, undefined);
    assert.equal(registry.run_bash, undefined);
  });

  it("buildToolRegistry supports run_tests tool", () => {
    const mockAgent = { type: "tester", requestPermission: async () => ({ decision: "approved" }) };
    const registry = buildToolRegistry(mockAgent, {}, { id: "node_x" }, {
      tools: ["read_file", "run_tests"],
    });
    assert.ok(registry.read_file);
    assert.ok(registry.run_tests);
  });
});

// ─── Agent Router uses proper error types ───────────────────────

describe("AgentRouter Error Types", () => {
  const { AgentRouter } = require("../src/mas/agent-router");
  const { UnknownAgentError, AgentPoolFullError } = require("../src/mas/errors");

  const mockDeps = {
    permissionGate: { requestPermission: async () => ({ decision: "approved" }) },
    memory: { shortTerm: new Map() },
    emitEvent: () => {},
    runLLM: async () => "{}",
  };

  it("route() throws UnknownAgentError for invalid type", () => {
    const router = new AgentRouter({}, mockDeps);
    assert.throws(
      () => router.route("wizard"),
      (err) => err instanceof UnknownAgentError && err.code === "UNKNOWN_AGENT",
    );
  });

  it("route() throws AgentPoolFullError when pool is full", () => {
    const router = new AgentRouter({ maxAgents: 1 }, mockDeps);
    router.route("coder"); // fills the pool
    assert.throws(
      () => router.route("planner"),
      (err) => err instanceof AgentPoolFullError && err.code === "AGENT_POOL_FULL",
    );
  });
});
