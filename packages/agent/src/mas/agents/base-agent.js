/**
 * CodIn Multi-Agent Swarm — Base Agent
 *
 * Abstract base class for all specialist agents.
 * Provides: identity, lifecycle, LLM interaction,
 * permission requests, metric tracking, event emission.
 */
"use strict";

const {
  AGENT_STATUS,
  EVENT_TYPE,
  createSwarmEvent,
  createAgentDescriptor,
} = require("../types");
const {
  retryWithBackoff,
  withTimeout,
  CircuitBreaker,
} = require("../../utils/reliability");

class BaseAgent {
  /**
   * @param {object} opts
   * @param {string} opts.type — AGENT_TYPE value
   * @param {string} [opts.modelHint] — Preferred model
   * @param {object} [opts.constraints] — network/write/commands/git/mcp
   * @param {object} deps
   * @param {import("../permissions").PermissionGate} deps.permissionGate
   * @param {import("../memory").MemoryManager} deps.memory
   * @param {function} [deps.emitEvent]
   * @param {function} deps.runLLM — (systemPrompt, userPrompt, opts) => Promise<string>
   */
  constructor(opts, deps) {
    this.descriptor = createAgentDescriptor({
      type: opts.type,
      modelHint: opts.modelHint || null,
      constraints: opts.constraints || {},
    });

    this._permissionGate = deps.permissionGate;
    this._memory = deps.memory;
    this._emitEvent = deps.emitEvent || null;
    this._runLLM = deps.runLLM;

    this.descriptor.status = AGENT_STATUS.IDLE;

    // Initialize circuit breaker for LLM calls
    // Reset timeout (90s) > LLM call timeout (30s) to allow in-flight calls to finish
    // Half-open attempts = 2 for smoother recovery
    this._llmCircuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      timeout: 90000, // 90 seconds — aligned with LLM timeout (30s) + retry window
      successThreshold: 2,
      halfOpenAttempts: 2,
      windowSize: 10,
    });
  }

  get id() {
    return this.descriptor.id;
  }
  get type() {
    return this.descriptor.type;
  }
  get status() {
    return this.descriptor.status;
  }
  get metrics() {
    return this.descriptor.metrics;
  }

  // ─── Lifecycle ───────────────────────────────────────────

  activate() {
    this.descriptor.status = AGENT_STATUS.BUSY;
    this._emit(EVENT_TYPE.AGENT_SPAWN, { agentId: this.id, type: this.type });
  }

  deactivate() {
    this.descriptor.status = AGENT_STATUS.IDLE;
  }

  markFailed(reason) {
    this.descriptor.status = AGENT_STATUS.ERROR;
    this._emit(EVENT_TYPE.AGENT_REMOVE, { agentId: this.id, reason });
  }

  terminate() {
    this.descriptor.status = AGENT_STATUS.SHUTDOWN;
    this._emit(EVENT_TYPE.AGENT_REMOVE, { agentId: this.id });
  }

  // ─── LLM Interaction ────────────────────────────────────

  /**
   * Execute an LLM call with this agent's system prompt.
   * Tracks metrics (tokens, cost, time).
   * Now includes: circuit breaker, retry logic, timeout protection
   *
   * @param {string} userPrompt
   * @param {object} [opts]
   * @param {string} [opts.model]
   * @param {number} [opts.maxTokens]
   * @param {number} [opts.timeout=30000] - Timeout in ms
   * @param {number} [opts.maxRetries=2] - Max retry attempts
   * @returns {Promise<string>}
   */
  async callLLM(userPrompt, opts = {}) {
    const start = Date.now();
    const timeout = opts.timeout || 30000; // 30 second default
    const maxRetries = opts.maxRetries || 2;

    try {
      // Execute with circuit breaker, retry, and timeout protection
      const result = await this._llmCircuitBreaker.execute(async () => {
        return await retryWithBackoff(
          async () => {
            return await withTimeout(
              this._runLLM(this.getSystemPrompt(), userPrompt, {
                model: opts.model || this.descriptor.modelHint,
                maxTokens: opts.maxTokens || 4096,
              }),
              timeout,
            );
          },
          {
            maxRetries,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            jitter: true,
            shouldRetry: (error) => {
              // Retry on network errors, rate limits, timeouts
              return (
                error.message.includes("timeout") ||
                error.message.includes("ECONNRESET") ||
                error.message.includes("rate limit") ||
                error.message.includes("429")
              );
            },
          },
        );
      });

      const elapsed = Date.now() - start;
      this.descriptor.metrics.tasksCompleted++;
      this.descriptor.metrics.toolCalls++;
      this.descriptor.metrics.totalTimeMs += elapsed;
      return result;
    } catch (err) {
      this.descriptor.metrics.toolCalls++;
      throw err;
    }
  }

  /**
   * Parse a JSON response from the LLM, with one retry on parse failure.
   * @param {string} userPrompt
   * @param {object} [opts]
   * @returns {Promise<object>}
   */
  async callLLMJson(userPrompt, opts = {}) {
    const raw = await this.callLLM(userPrompt, opts);
    try {
      return this._extractJson(raw);
    } catch {
      // Retry once asking for valid JSON
      const retryPrompt = `Your previous response was not valid JSON. Please respond with ONLY valid JSON.\n\nOriginal request:\n${userPrompt}`;
      const raw2 = await this.callLLM(retryPrompt, opts);
      return this._extractJson(raw2);
    }
  }

  /**
   * Iterative tool-use loop: LLM proposes tool calls, we execute them,
   * feed observations back, and repeat until the LLM returns a final answer
   * or the max iteration limit is reached.
   *
   * NOW WITH SAFEGUARDS:
   * - Per-iteration timeout (30s default)
   * - Global loop timeout (5 min default)
   * - Rate limiting between iterations
   * - Tool call frequency tracking
   *
   * @param {string} userPrompt — Initial task prompt
   * @param {object} toolRegistry — Map of tool names to { description, execute(args) => Promise<string> }
   * @param {object} [opts]
   * @param {number} [opts.maxIterations=5] — Max tool-use rounds
   * @param {number} [opts.iterationTimeout=30000] — Timeout per iteration (ms)
   * @param {number} [opts.totalTimeout=300000] — Total loop timeout (ms)
   * @param {string} [opts.model]
   * @param {number} [opts.maxTokens]
   * @returns {Promise<{ answer: string, toolLog: Array<{ tool: string, args: object, result: string }> }>}
   */
  async callLLMWithTools(userPrompt, toolRegistry, opts = {}) {
    const maxIter = opts.maxIterations || 5;
    const iterationTimeout = opts.iterationTimeout || 30000; // 30s per iteration
    const totalTimeout = opts.totalTimeout || 300000; // 5 min total
    const loopStartTime = Date.now();

    const toolNames = Object.keys(toolRegistry);
    const toolDescriptions = toolNames
      .map((name) => `- ${name}: ${toolRegistry[name].description}`)
      .join("\n");

    const toolPromptSuffix = `

You have access to these tools:
${toolDescriptions}

To use a tool, respond with JSON: {"tool": "<name>", "args": {<arguments>}}
When you have the final answer, respond with JSON: {"answer": "<your final answer>"}
Always respond with ONLY valid JSON.`;

    let conversation = userPrompt + toolPromptSuffix;
    const toolLog = [];
    const toolCallCounts = new Map(); // Track calls per tool to detect loops

    for (let i = 0; i < maxIter; i++) {
      // Check total timeout
      if (Date.now() - loopStartTime > totalTimeout) {
        throw new Error(
          `Tool-use loop exceeded total timeout of ${totalTimeout}ms`,
        );
      }

      // Add delay between iterations to prevent runaway loops
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Execute LLM call with per-iteration timeout
      const raw = await withTimeout(
        this.callLLM(conversation, opts),
        iterationTimeout,
      );

      let parsed;
      try {
        parsed = this._extractJson(raw);
      } catch {
        // LLM returned non-JSON — treat as final answer
        return { answer: raw, toolLog };
      }

      // Final answer
      if (parsed.answer !== undefined) {
        return { answer: parsed.answer, toolLog };
      }

      // Tool call
      if (parsed.tool && toolRegistry[parsed.tool]) {
        const toolName = parsed.tool;
        const args = parsed.args || {};

        // Track tool call frequency to detect loops
        const callCount = (toolCallCounts.get(toolName) || 0) + 1;
        toolCallCounts.set(toolName, callCount);

        // Detect infinite loop: same tool called 3+ times
        if (callCount >= 3) {
          return {
            answer: `Error: Tool "${toolName}" called ${callCount} times. Possible infinite loop detected. Aborting.`,
            toolLog,
          };
        }

        try {
          const result = await withTimeout(
            toolRegistry[toolName].execute(args),
            iterationTimeout,
          );
          toolLog.push({ tool: toolName, args, result });
          conversation = `Tool "${toolName}" returned:\n${result}\n\nContinue with the task. Use another tool or provide your final answer as {"answer": "..."}`;
        } catch (err) {
          const errMsg = err.message || String(err);
          toolLog.push({ tool: toolName, args, result: `ERROR: ${errMsg}` });
          conversation = `Tool "${toolName}" failed with error: ${errMsg}\n\nContinue with the task. Try a different approach or provide your final answer as {"answer": "..."}`;
        }
      } else if (parsed.tool) {
        // Unknown tool
        conversation = `Unknown tool "${parsed.tool}". Available tools: ${toolNames.join(", ")}. Try again.`;
      } else {
        // Unrecognized response structure — treat as final answer
        return { answer: JSON.stringify(parsed), toolLog };
      }
    }

    // Max iterations reached — ask for final answer
    const finalRaw = await withTimeout(
      this.callLLM(
        'You have reached the tool-use limit. Provide your final answer now as {"answer": "..."}',
        opts,
      ),
      iterationTimeout,
    );
    try {
      const finalParsed = this._extractJson(finalRaw);
      return {
        answer: finalParsed.answer || JSON.stringify(finalParsed),
        toolLog,
      };
    } catch {
      return { answer: finalRaw, toolLog };
    }
  }

  _extractJson(text) {
    // Try direct parse
    try {
      return JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code block
      const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) {
        return JSON.parse(match[1].trim());
      }
      // Try to find first { ... } or [ ... ]
      const braceMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (braceMatch) {
        return JSON.parse(braceMatch[1]);
      }
      throw new Error("Could not extract JSON from LLM response");
    }
  }

  // ─── Permissions ─────────────────────────────────────────

  /**
   * Request permission for an action through the PermissionGate.
   * @param {string} permissionType — PERMISSION_TYPE value
   * @param {string} action — Description
   * @param {number} [costEstimate]
   * @returns {Promise<{ decision: string, reason: string }>}
   */
  async requestPermission(nodeId, permissionType, action, costEstimate = 0) {
    return this._permissionGate.requestPermission({
      nodeId,
      agentId: this.id,
      permissionType,
      action,
      costEstimate,
    });
  }

  // ─── Memory Helpers ──────────────────────────────────────

  remember(key, value) {
    this._memory.shortTerm.set(`agent:${this.id}:${key}`, value);
  }

  recall(key) {
    return this._memory.shortTerm.get(`agent:${this.id}:${key}`);
  }

  // ─── Inter-Agent Communication ───────────────────────────

  /**
   * Send a message to another agent (or broadcast to all).
   * Requires the blackboard from execution context.
   * @param {object} context — Execution context (must contain blackboard)
   * @param {string|null} toAgentId — Target agent ID, or null for broadcast
   * @param {string} topic — Message topic
   * @param {any} payload — Message data
   */
  sendMessage(context, toAgentId, topic, payload) {
    if (context.blackboard) {
      context.blackboard.post(this.id, toAgentId, topic, payload);
    }
  }

  /**
   * Read messages from the blackboard addressed to this agent.
   * @param {object} context — Execution context (must contain blackboard)
   * @param {string} [topic] — Optional topic filter
   * @returns {Array}
   */
  readMessages(context, topic) {
    if (context.blackboard) {
      return context.blackboard.read(this.id, topic);
    }
    return [];
  }

  // ─── Event Emission ──────────────────────────────────────

  _emit(type, data) {
    if (this._emitEvent) {
      this._emitEvent(createSwarmEvent({ type, data }));
    }
  }

  // ─── Confidence Scoring ─────────────────────────────────

  /**
   * Compute a dynamic confidence score based on result quality.
   * @param {any} result — The result from LLM or tool-use loop
   * @param {object} [context={}] — Execution context hints
   * @returns {number} Confidence between 0.7 and 0.95
   */
  computeConfidence(result, context = {}) {
    let score = 0.7; // base
    // Boost if LLM returned structured data
    if (result && typeof result === "object") score += 0.05;
    // Boost if tool calls succeeded (no errors in result)
    if (!result?.error && !result?.errors) score += 0.05;
    // Boost if context had relevant files
    if (context.filesRead > 0) score += 0.05;
    // Cap at 0.95
    return Math.min(score, 0.95);
  }

  // ─── Abstract Methods (must override) ────────────────────

  /**
   * Return the system prompt for this specialist agent.
   * @returns {string}
   */
  getSystemPrompt() {
    return "You are a CodIn specialist agent. Follow instructions precisely.";
  }

  /**
   * Execute a task node and return the result.
   * @param {object} _node — TaskNode from the graph
   * @param {object} _context — Shared context from working memory
   * @returns {Promise<{ result: string, artifacts?: object[], confidence?: number }>}
   */
  async execute(_node, _context) {
    throw new Error(`${this.constructor.name}.execute() not implemented`);
  }

  /** Return a short description of this agent's capabilities. */
  describeCapabilities() {
    return "Base agent with no specialization.";
  }
}

module.exports = { BaseAgent };
