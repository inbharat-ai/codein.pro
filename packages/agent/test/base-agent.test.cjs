/**
 * BaseAgent — Behavioral Tests
 *
 * Tests agent lifecycle, LLM interaction, tool-use loops,
 * circuit breaker integration, frequency tracking, and error handling.
 */
"use strict";

const assert = require("node:assert");

const { BaseAgent } = require("../src/mas/agents/base-agent");
const { AGENT_TYPE, AGENT_STATUS } = require("../src/mas/types");

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
        set: jest.fn(),
        get: jest.fn(() => undefined),
      },
      working: {
        set: jest.fn(),
        get: jest.fn(() => undefined),
        recordDecision: jest.fn(),
      },
    },
    emitEvent: jest.fn(),
    runLLM: jest.fn(async () => "LLM response text"),
    ...overrides,
  };
}

/** Create an agent with a mock LLM that returns structured JSON tool calls. */
function agentWithToolLLM(responses) {
  let callIndex = 0;
  const deps = makeDeps({
    runLLM: jest.fn(async () => {
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
    expect(agent.status).toBe(AGENT_STATUS.IDLE);
    expect(agent.id).toMatch(/^agent_/);
    expect(agent.type).toBe(AGENT_TYPE.CODER);
  });

  it("activate transitions to BUSY and emits AGENT_SPAWN", () => {
    const deps = makeDeps();
    const agent = new BaseAgent(makeOpts(), deps);
    agent.activate();
    expect(agent.status).toBe(AGENT_STATUS.BUSY);
    expect(deps.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent_spawn",
        data: expect.objectContaining({ agentId: agent.id }),
      })
    );
  });

  it("deactivate transitions back to IDLE", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    agent.activate();
    agent.deactivate();
    expect(agent.status).toBe(AGENT_STATUS.IDLE);
  });

  it("markFailed transitions to ERROR and emits AGENT_REMOVE", () => {
    const deps = makeDeps();
    const agent = new BaseAgent(makeOpts(), deps);
    agent.markFailed("test failure");
    expect(agent.status).toBe(AGENT_STATUS.ERROR);
    expect(deps.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent_remove",
        data: expect.objectContaining({ reason: "test failure" }),
      })
    );
  });

  it("terminate transitions to SHUTDOWN", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    agent.terminate();
    expect(agent.status).toBe(AGENT_STATUS.SHUTDOWN);
  });
});

describe("BaseAgent — LLM Interaction", () => {
  it("callLLM delegates to runLLM with system prompt and user prompt", async () => {
    const deps = makeDeps();
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLM("Hello agent");

    expect(deps.runLLM).toHaveBeenCalledWith(
      agent.getSystemPrompt(),
      "Hello agent",
      expect.objectContaining({ model: "test-model", maxTokens: 4096 })
    );
    expect(result).toBe("LLM response text");
  });

  it("callLLM tracks metrics on success", async () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    await agent.callLLM("test");

    expect(agent.metrics.tasksCompleted).toBe(1);
    expect(agent.metrics.toolCalls).toBe(1);
    expect(agent.metrics.totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("callLLM extracts text from {text, usage} response objects", async () => {
    const deps = makeDeps({
      runLLM: jest.fn(async () => ({
        text: "extracted text",
        usage: { input_tokens: 100, output_tokens: 50 },
        model: "claude-sonnet",
      })),
    });
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLM("test");

    expect(result).toBe("extracted text");
    expect(agent.metrics.tokensUsed).toBe(150);
    expect(agent.metrics.costUSD).toBeGreaterThan(0);
  });

  it("callLLM throws and increments toolCalls on LLM failure", async () => {
    const deps = makeDeps({
      runLLM: jest.fn(async () => {
        throw new Error("LLM provider down");
      }),
    });
    const agent = new BaseAgent(makeOpts(), deps);

    await expect(agent.callLLM("test", { maxRetries: 0 })).rejects.toThrow(
      "LLM provider down"
    );
    expect(agent.metrics.toolCalls).toBe(1);
  });

  it("callLLMJson parses JSON from LLM response", async () => {
    const deps = makeDeps({
      runLLM: jest.fn(async () => '{"key":"value"}'),
    });
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLMJson("give me json");
    expect(result).toEqual({ key: "value" });
  });

  it("callLLMJson retries on parse failure then succeeds", async () => {
    let calls = 0;
    const deps = makeDeps({
      runLLM: jest.fn(async () => {
        calls++;
        if (calls === 1) return "not json at all";
        return '{"retried":true}';
      }),
    });
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLMJson("give me json");
    expect(result).toEqual({ retried: true });
    expect(calls).toBe(2);
  });

  it("callLLMJson extracts JSON from markdown code blocks", async () => {
    const deps = makeDeps({
      runLLM: jest.fn(async () => '```json\n{"code_block":true}\n```'),
    });
    const agent = new BaseAgent(makeOpts(), deps);
    const result = await agent.callLLMJson("test");
    expect(result).toEqual({ code_block: true });
  });
});

describe("BaseAgent — Tool-Use Loop (callLLMWithTools)", () => {
  it("executes a tool and returns final answer", async () => {
    const { agent } = agentWithToolLLM([
      '{"tool":"read_file","args":{"path":"test.js"}}',
      '{"answer":"File content is: hello"}',
    ]);

    const toolRegistry = {
      read_file: {
        description: "Read a file",
        execute: jest.fn(async (args) => `content of ${args.path}`),
      },
    };

    const result = await agent.callLLMWithTools("Read test.js", toolRegistry, {
      maxIterations: 5,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    expect(toolRegistry.read_file.execute).toHaveBeenCalledWith({ path: "test.js" });
    expect(result.answer).toBe("File content is: hello");
    expect(result.toolLog).toHaveLength(1);
    expect(result.toolLog[0].tool).toBe("read_file");
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
        execute: jest.fn(async () => "ok"),
      },
      read_file: {
        description: "Read file",
        execute: jest.fn(async () => "hi"),
      },
    };

    const result = await agent.callLLMWithTools("write then read", toolRegistry, {
      maxIterations: 5,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    expect(result.toolLog).toHaveLength(2);
    expect(result.answer).toBe("verified");
  });

  it("detects infinite tool loop and aborts", async () => {
    // LLM keeps calling the same tool forever
    const infiniteResponses = Array(10).fill(
      '{"tool":"search","args":{"query":"stuck"}}'
    );
    const { agent } = agentWithToolLLM(infiniteResponses);

    const toolRegistry = {
      search: {
        description: "Search",
        execute: jest.fn(async () => "no results"),
      },
    };

    const result = await agent.callLLMWithTools("find something", toolRegistry, {
      maxIterations: 10,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    expect(result.answer).toMatch(/infinite loop/i);
    // Should have been called 6 times before loop detection triggers (default threshold)
    expect(toolRegistry.search.execute.mock.calls.length).toBeLessThanOrEqual(6);
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

    expect(result.answer).toBe("gave up");
  });

  it("handles tool execution errors and continues", async () => {
    const { agent } = agentWithToolLLM([
      '{"tool":"failing_tool","args":{}}',
      '{"answer":"recovered"}',
    ]);

    const toolRegistry = {
      failing_tool: {
        description: "Always fails",
        execute: jest.fn(async () => {
          throw new Error("tool crashed");
        }),
      },
    };

    const result = await agent.callLLMWithTools("test", toolRegistry, {
      maxIterations: 5,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    expect(result.toolLog[0].result).toMatch(/ERROR.*tool crashed/);
    expect(result.answer).toBe("recovered");
  });

  it("returns non-JSON LLM response as final answer", async () => {
    const { agent } = agentWithToolLLM(["This is just plain text"]);

    const result = await agent.callLLMWithTools("test", {}, {
      maxIterations: 3,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    expect(result.answer).toBe("This is just plain text");
  });

  it("returns answer when LLM returns null", async () => {
    const deps = makeDeps({
      runLLM: jest.fn(async () => null),
    });
    const agent = new BaseAgent(makeOpts(), deps);

    const result = await agent.callLLMWithTools("test", {}, {
      maxIterations: 3,
      iterationTimeout: 5000,
      totalTimeout: 30000,
    });

    expect(result.answer).toBe("LLM returned no response");
  });
});

describe("BaseAgent — System Prompt & Confidence", () => {
  it("getSystemPrompt returns a string", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    expect(typeof agent.getSystemPrompt()).toBe("string");
    expect(agent.getSystemPrompt().length).toBeGreaterThan(0);
  });

  it("computeConfidence returns base score for simple results", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    const score = agent.computeConfidence("plain string result");
    expect(score).toBeGreaterThanOrEqual(0.7);
    expect(score).toBeLessThanOrEqual(0.95);
  });

  it("computeConfidence boosts for structured results without errors", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    const lowScore = agent.computeConfidence("string result");
    const highScore = agent.computeConfidence(
      { data: "structured" },
      { filesRead: 3 }
    );
    expect(highScore).toBeGreaterThan(lowScore);
  });
});

describe("BaseAgent — Memory Helpers", () => {
  it("remember/recall stores and retrieves via short-term memory", () => {
    const store = {};
    const deps = makeDeps({
      memory: {
        shortTerm: {
          set: jest.fn((k, v) => { store[k] = v; }),
          get: jest.fn((k) => store[k]),
        },
        working: { set: jest.fn(), get: jest.fn(), recordDecision: jest.fn() },
      },
    });
    const agent = new BaseAgent(makeOpts(), deps);

    agent.remember("task_progress", "50%");
    expect(deps.memory.shortTerm.set).toHaveBeenCalledWith(
      `agent:${agent.id}:task_progress`,
      "50%"
    );

    const recalled = agent.recall("task_progress");
    expect(deps.memory.shortTerm.get).toHaveBeenCalledWith(
      `agent:${agent.id}:task_progress`
    );
  });
});

describe("BaseAgent — Permission Delegation", () => {
  it("requestPermission delegates to permissionGate", async () => {
    const deps = makeDeps({
      permissionGate: {
        requestPermission: jest.fn(async () => ({
          decision: "approved",
          reason: "auto",
        })),
      },
    });
    const agent = new BaseAgent(makeOpts(), deps);

    const result = await agent.requestPermission(
      "node_1",
      "file_write",
      "Write to config.json",
      0.5
    );

    expect(deps.permissionGate.requestPermission).toHaveBeenCalledWith({
      nodeId: "node_1",
      agentId: agent.id,
      permissionType: "file_write",
      action: "Write to config.json",
      costEstimate: 0.5,
    });
    expect(result.decision).toBe("approved");
  });
});

describe("BaseAgent — Cost Tracking", () => {
  it("tracks cost with persistence layer", async () => {
    const recordCost = jest.fn();
    const deps = makeDeps({
      runLLM: jest.fn(async () => ({
        text: "response",
        usage: { input_tokens: 1000, output_tokens: 500 },
        model: "claude-sonnet-4",
      })),
      persistence: { recordCost },
    });
    const agent = new BaseAgent(makeOpts(), deps);
    agent.setSessionId("session_123");

    await agent.callLLM("test");

    expect(agent.metrics.tokensUsed).toBe(1500);
    expect(agent.metrics.costUSD).toBeGreaterThan(0);
    expect(recordCost).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session_123",
        agentId: agent.id,
        totalTokens: 1500,
      })
    );
  });

  it("_getModelCost returns correct pricing tiers", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    const opusCost = agent._getModelCost("claude-opus-4");
    const haikuCost = agent._getModelCost("claude-haiku");
    expect(opusCost.input).toBeGreaterThan(haikuCost.input);
    expect(opusCost.output).toBeGreaterThan(haikuCost.output);
  });
});

describe("BaseAgent — Abstract Methods", () => {
  it("execute() throws 'not implemented' on base class", async () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    await expect(agent.execute({}, {})).rejects.toThrow(/not implemented/i);
  });

  it("describeCapabilities returns a string", () => {
    const agent = new BaseAgent(makeOpts(), makeDeps());
    expect(typeof agent.describeCapabilities()).toBe("string");
  });
});
