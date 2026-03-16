/**
 * BaseAgent — Behavioral Tests
 *
 * Tests agent lifecycle, LLM interaction, tool-use loops,
 * circuit breaker integration, frequency tracking, and error handling.
 */
"use strict";
const { describe, it } = require("node:test");

const assert = require("node:assert/strict");

const { BaseAgent } = require("../src/mas/agents/base-agent");
const { AGENT_TYPE, AGENT_STATUS } = require("../src/mas/types");

// ─── Mock helper ────────────────────────────────────────────

function createMock(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl ? impl(...args) : fn._returnValue; };
  fn.calls = [];
  fn._returnValue = undefined;
  fn.mockReturnValue = (v) => { fn._returnValue = v; return fn; };
  fn.mockImplementation = (i) => { impl = i; return fn; };
  fn.mockReset = () => { fn.calls = []; fn._returnValue = undefined; };
  return fn;
}

// ─── Helpers ─────────────────────────────────────────────────

function makeOpts(overrides = {}) {
  return {
    type: AGENT_TYPE.CODER,
    modelHint: "test-model",
    constraints: {},
    ...overrides,
  };
}

function makeDeps(overrides = {}) {
  return {
    permissionGate: {
      requestPermission: async () => ({ decision: "approved", reason: "test" }),
      cancelAllPending: () => {},
    },
    memory: {
      shortTerm: {
        set: createMock(),
        get: createMock(() => undefined),
      },
      working: {
        set: createMock(),
        get: createMock(() => undefined),
        recordDecision: createMock(),
      },
    },
    emitEvent: createMock(),
    runLLM: createMock(async () => "LLM response text"),
    ...overrides,
  };
}

/** Create an agent with a mock LLM that returns structured JSON tool calls. */
function agentWithToolLLM(responses) {
  let callIndex = 0;
  const deps = makeDeps({
    runLLM: createMock(async () => {
      const resp = responses[callIndex] || '{"answer":"done"}';
      callIndex++;
      return typeof resp === "string" ? resp : JSON.stringify(resp);
    }),
  });
  return { agent: new BaseAgent(makeOpts(), deps), deps };
}

// ─── Tests ───────────────────────────────────────────────────

describe("BaseAgent — Lifecycle", () => {
  it("initializes in IDLE status with a unique id", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    assert.equal(agent.status, AGENT_STATUS.IDLE);
    assert.match(agent.id, /^agent_/);
    assert.equal(agent.type, AGENT_TYPE.CODER);
  });

  it("activate transitions to BUSY and emits AGENT_SPAWN", () => {
    const deps = makeDeps();
    const agent = new BaseAgent(makeOpts(), deps);
    agent.activate();
    assert.equal(agent.status, AGENT_STATUS.BUSY);
    assert.ok(deps.emitEvent.calls.length > 0);
    const call = deps.emitEvent.calls.find(c => c[0] && c[0].type === "agent_spawn");
    assert.ok(call, "Should have emitted agent_spawn event");
    assert.equal(call[0].data.agentId, agent.id);
  });

  it("deactivate transitions back to IDLE", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    agent.activate();
    agent.deactivate();
    assert.equal(agent.status, AGENT_STATUS.IDLE);
  });

  it("markFailed transitions to ERROR and emits AGENT_REMOVE", () => {
    const deps = makeDeps();
    const agent = new BaseAgent(makeOpts(), deps);
    agent.markFailed("test failure");
    assert.equal(agent.status, AGENT_STATUS.ERROR);
    const call = deps.emitEvent.calls.find(c => c[0] && c[0].type === "agent_remove");
    assert.ok(call, "Should have emitted agent_remove event");
    assert.equal(call[0].data.reason, "test failure");
  });

  it("terminate transitions to SHUTDOWN", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    agent.terminate();
    assert.equal(agent.status, AGENT_STATUS.SHUTDOWN);
  });
});

describe("BaseAgent — LLM Interaction", () => {
  it("callLLM delegates to runLLM with system prompt and user prompt", async () => {
    const deps = makeDeps();
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLM("Hello agent");

    assert.ok(deps.runLLM.calls.length > 0);
    assert.equal(deps.runLLM.calls[0][0], agent.getSystemPrompt());
    assert.equal(deps.runLLM.calls[0][1], "Hello agent");
    assert.ok(deps.runLLM.calls[0][2]);
    assert.equal(deps.runLLM.calls[0][2].model, "test-model");
    assert.equal(deps.runLLM.calls[0][2].maxTokens, 4096);
    assert.equal(result, "LLM response text");
  });

  it("callLLM tracks metrics on success", async () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    await agent.callLLM("test");

    assert.equal(agent.metrics.tasksCompleted, 1);
    assert.equal(agent.metrics.toolCalls, 1);
    assert.ok(agent.metrics.totalTimeMs >= 0);
  });

  it("callLLM extracts text from {text, usage} response objects", async () => {
    const deps = makeDeps({
      runLLM: createMock(async () => ({
        text: "extracted text",
        usage: { input_tokens: 100, output_tokens: 50 },
        model: "claude-sonnet",
      })),
    });
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLM("test");

    assert.equal(result, "extracted text");
    assert.equal(agent.metrics.tokensUsed, 150);
    assert.ok(agent.metrics.costUSD > 0);
  });

  it("callLLM throws and increments toolCalls on LLM failure", async () => {
    const deps = makeDeps({
      runLLM: createMock(async () => {
        throw new Error("LLM provider down");
      }),
    });
    const agent = new BaseAgent(makeOpts(), deps);

    await assert.rejects(
      () => agent.callLLM("test", { maxRetries: 0 }),
      /LLM provider down/
    );
    assert.equal(agent.metrics.toolCalls, 1);
  });

  it("callLLMJson parses JSON from LLM response", async () => {
    const deps = makeDeps({
      runLLM: createMock(async () => '{"key":"value"}'),
    });
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLMJson("give me json");
    assert.deepStrictEqual(result, { key: "value" });
  });

  it("callLLMJson retries on parse failure then succeeds", async () => {
    let calls = 0;
    const deps = makeDeps({
      runLLM: createMock(async () => {
        calls++;
        if (calls === 1) return "not json at all";
        return '{"retried":true}';
      }),
    });
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLMJson("give me json");
    assert.deepStrictEqual(result, { retried: true });
    assert.equal(calls, 2);
  });

  it("callLLMJson extracts JSON from markdown code blocks", async () => {
    const deps = makeDeps({
      runLLM: createMock(async () => '```json\n{"code_block":true}\n```'),
    });
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLMJson("test");
    assert.deepStrictEqual(result, { code_block: true });
  });
});

describe("BaseAgent — Tool-Use Loop (callLLMWithTools)", () => {
  it("executes a tool and returns final answer", async () => {
    const { agent } = agentWithToolLLM([
      '{"tool":"read_file","args":{"path":"test.js"}}',
      '{"answer":"File content is: hello"}',
    ]);

    const toolExecute = createMock(async (args) => `content of ${args.path}`);
    const toolRegistry = {
      read_file: {
        description: "Read a file",
        execute: toolExecute,
      },
    };

    const result = await agent.callLLMWithTools("Read test.js", toolRegistry, {
      maxIterations: 5,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    assert.ok(toolExecute.calls.length > 0);
    assert.deepStrictEqual(toolExecute.calls[0][0], { path: "test.js" });
    assert.equal(result.answer, "File content is: hello");
    assert.equal(result.toolLog.length, 1);
    assert.equal(result.toolLog[0].tool, "read_file");
  });

  it("chains multiple tool calls before final answer", async () => {
    const { agent } = agentWithToolLLM([
      '{"tool":"write_file","args":{"path":"out.txt","content":"hi"}}',
      '{"tool":"read_file","args":{"path":"out.txt"}}',
      '{"answer":"verified"}',
    ]);

    const toolRegistry = {
      write_file: {
        description: "Write file",
        execute: createMock(async () => "ok"),
      },
      read_file: {
        description: "Read file",
        execute: createMock(async () => "hi"),
      },
    };

    const result = await agent.callLLMWithTools("write then read", toolRegistry, {
      maxIterations: 5,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    assert.equal(result.toolLog.length, 2);
    assert.equal(result.answer, "verified");
  });

  it("detects infinite tool loop and aborts", async () => {
    // LLM keeps calling the same tool forever
    const infiniteResponses = Array(10).fill(
      '{"tool":"search","args":{"query":"stuck"}}'
    );
    const { agent } = agentWithToolLLM(infiniteResponses);

    const searchExecute = createMock(async () => "no results");
    const toolRegistry = {
      search: {
        description: "Search",
        execute: searchExecute,
      },
    };

    const result = await agent.callLLMWithTools("find something", toolRegistry, {
      maxIterations: 10,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    assert.match(result.answer, /infinite loop/i);
    // Should have been called 6 times before loop detection triggers (default threshold)
    assert.ok(searchExecute.calls.length <= 6);
  });

  it("handles unknown tool gracefully", async () => {
    const { agent } = agentWithToolLLM([
      '{"tool":"nonexistent_tool","args":{}}',
      '{"answer":"gave up"}',
    ]);

    const result = await agent.callLLMWithTools("test", {}, {
      maxIterations: 3,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    assert.equal(result.answer, "gave up");
  });

  it("handles tool execution errors and continues", async () => {
    const { agent } = agentWithToolLLM([
      '{"tool":"failing_tool","args":{}}',
      '{"answer":"recovered"}',
    ]);

    const toolRegistry = {
      failing_tool: {
        description: "Always fails",
        execute: createMock(async () => {
          throw new Error("tool crashed");
        }),
      },
    };

    const result = await agent.callLLMWithTools("test", toolRegistry, {
      maxIterations: 5,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    assert.match(result.toolLog[0].result, /ERROR.*tool crashed/);
    assert.equal(result.answer, "recovered");
  });

  it("returns non-JSON LLM response as final answer", async () => {
    const { agent } = agentWithToolLLM(["This is just plain text"]);

    const result = await agent.callLLMWithTools("test", {}, {
      maxIterations: 3,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    assert.equal(result.answer, "This is just plain text");
  });

  it("returns answer when LLM returns null", async () => {
    const deps = makeDeps({
      runLLM: createMock(async () => null),
    });
    const agent = new BaseAgent(makeOpts(), deps);

    const result = await agent.callLLMWithTools("test", {}, {
      maxIterations: 3,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    assert.equal(result.answer, "LLM returned no response");
  });
});

describe("BaseAgent — System Prompt & Confidence", () => {
  it("getSystemPrompt returns a string", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    assert.equal(typeof agent.getSystemPrompt(), "string");
    assert.ok(agent.getSystemPrompt().length > 0);
  });

  it("computeConfidence returns base score for simple results", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    const score = agent.computeConfidence("plain string result");
    assert.ok(score >= 0.7);
    assert.ok(score <= 0.95);
  });

  it("computeConfidence boosts for structured results without errors", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    const lowScore = agent.computeConfidence("string result");
    const highScore = agent.computeConfidence(
      { data: "structured" },
      { filesRead: 3 }
    );
    assert.ok(highScore > lowScore);
  });
});

describe("BaseAgent — Memory Helpers", () => {
  it("remember/recall stores and retrieves via short-term memory", () => {
    const store = {};
    const deps = makeDeps({
      memory: {
        shortTerm: {
          set: createMock((k, v) => { store[k] = v; }),
          get: createMock((k) => store[k]),
        },
        working: { set: createMock(), get: createMock(), recordDecision: createMock() },
      },
    });
    const agent = new BaseAgent(makeOpts(), deps);

    agent.remember("task_progress", "50%");
    assert.ok(deps.memory.shortTerm.set.calls.length > 0);
    assert.equal(deps.memory.shortTerm.set.calls[0][0], `agent:${agent.id}:task_progress`);
    assert.equal(deps.memory.shortTerm.set.calls[0][1], "50%");

    const recalled = agent.recall("task_progress");
    assert.ok(deps.memory.shortTerm.get.calls.length > 0);
    assert.equal(deps.memory.shortTerm.get.calls[0][0], `agent:${agent.id}:task_progress`);
  });
});

describe("BaseAgent — Permission Delegation", () => {
  it("requestPermission delegates to permissionGate", async () => {
    const requestPermission = createMock(async () => ({
      decision: "approved",
      reason: "auto",
    }));
    const deps = makeDeps({
      permissionGate: {
        requestPermission,
      },
    });
    const agent = new BaseAgent(makeOpts(), deps);

    const result = await agent.requestPermission(
      "node_1",
      "file_write",
      "Write to config.json",
      0.5
    );

    assert.ok(requestPermission.calls.length > 0);
    const arg = requestPermission.calls[0][0];
    assert.equal(arg.nodeId, "node_1");
    assert.equal(arg.agentId, agent.id);
    assert.equal(arg.permissionType, "file_write");
    assert.equal(arg.action, "Write to config.json");
    assert.equal(arg.costEstimate, 0.5);
    assert.equal(result.decision, "approved");
  });
});

describe("BaseAgent — Cost Tracking", () => {
  it("tracks cost with persistence layer", async () => {
    const recordCost = createMock();
    const deps = makeDeps({
      runLLM: createMock(async () => ({
        text: "response",
        usage: { input_tokens: 1000, output_tokens: 500 },
        model: "claude-sonnet-4",
      })),
      persistence: { recordCost },
    });
    const agent = new BaseAgent(makeOpts(), deps);
    agent.setSessionId("session_123");

    await agent.callLLM("test");

    assert.equal(agent.metrics.tokensUsed, 1500);
    assert.ok(agent.metrics.costUSD > 0);
    assert.ok(recordCost.calls.length > 0);
    const costArg = recordCost.calls[0][0];
    assert.equal(costArg.sessionId, "session_123");
    assert.equal(costArg.agentId, agent.id);
    assert.equal(costArg.totalTokens, 1500);
  });

  it("_getModelCost returns correct pricing tiers", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    const opusCost = agent._getModelCost("claude-opus-4");
    const haikuCost = agent._getModelCost("claude-haiku");
    assert.ok(opusCost.input > haikuCost.input);
    assert.ok(opusCost.output > haikuCost.output);
  });
});

describe("BaseAgent — Abstract Methods", () => {
  it("execute() throws 'not implemented' on base class", async () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    await assert.rejects(() => agent.execute({}, {}), /not implemented/i);
  });

  it("describeCapabilities returns a string", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    assert.equal(typeof agent.describeCapabilities(), "string");
  });
});
