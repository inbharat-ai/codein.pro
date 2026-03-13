/**
 * CodIn MAS — Coder Agent (Hardened)
 *
 * The flagship agent. Writes, edits, and creates code reliably.
 * Requests file_write permission before modifying anything.
 *
 * Hardening features:
 *   - Reads target files BEFORE editing (no blind writes)
 *   - Runs tests after edits to verify correctness
 *   - Self-heals: if tests fail, reads error output and fixes
 *   - Respects project conventions from workspace memory
 *   - Streams progress events for real-time UI feedback
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");
const { buildToolRegistry } = require("../tool-registry");
const { createLogger } = require("../logger");

const log = createLogger("CoderAgent");

const SYSTEM_PROMPT = `You are the CodIn Coder Agent — an expert software engineer.

WORKFLOW (follow this order strictly):
1. READ existing files first to understand the codebase
2. PLAN your changes mentally before writing
3. WRITE code — one file at a time, complete and correct
4. RUN tests if a test command is available
5. FIX any test failures by reading the error output

RULES:
1. ALWAYS read a file before editing it — never write blind
2. Follow existing project conventions (naming, style, patterns, indentation)
3. Write clean, readable code — no unnecessary comments or over-engineering
4. Include error handling at system boundaries only
5. Never introduce security vulnerabilities (OWASP Top 10)
6. If modifying an existing file, preserve the overall structure and style
7. When creating new files, match the style of existing similar files
8. Keep changes minimal — do exactly what was asked, nothing more
9. If tests fail after your edit, READ the error output and FIX the issue
10. When done, respond with your final answer summarizing what you did

COMMON MISTAKES TO AVOID:
- Writing a file without reading it first (causes lost code)
- Overwriting an entire file when only a small edit was needed
- Adding features that weren't requested
- Ignoring test failures
- Using different coding style than the project

OUTPUT: When finished, respond with {"answer": "description of changes made"}`;

const SELF_HEAL_PROMPT = `The tests failed after your changes. Here's the error output:

{ERROR_OUTPUT}

Read the relevant file(s), diagnose the issue, and fix it. Then run the tests again.
Do NOT give up — fix the code until tests pass or explain why it's not possible.`;

class CoderAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.CODER,
        constraints: {
          network: false,
          write: true,
          commands: true,
          git: false,
          mcp: true,
        },
      },
      deps,
    );
    this._maxSelfHealAttempts = 2;
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  describeCapabilities() {
    return "Writes production-quality code, creates/edits files, runs tests, and self-heals on failures.";
  }

  async execute(node, context) {
    // Request write permission upfront
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `Coder agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    // Build rich context prompt
    const prompt = this._buildPrompt(node, context);

    // Get tools from central registry — include run_bash for test execution
    const toolRegistry = buildToolRegistry(this, context, node, {
      tools: ["read_file", "write_file", "run_bash"],
      agentLabel: "Coder",
      commandProfile: "DEV",
    });

    if (Object.keys(toolRegistry).length === 0) {
      // Fallback: no tools available, use direct LLM
      log.warn("No tools available, falling back to direct LLM", {
        nodeId: node.id,
      });
      const result = await this.callLLMJson(prompt);
      return {
        result: result.result || "Code written",
        files: result.files || [],
        confidence: 0.3, // Low confidence without tools
        notes: result.notes,
      };
    }

    // Execute with tools — more iterations for complex tasks
    const complexity = this._estimateComplexity(node.goal);
    const maxIterations =
      complexity === "high" ? 12 : complexity === "medium" ? 8 : 5;

    log.info("Starting coding task", {
      nodeId: node.id,
      complexity,
      maxIterations,
      goal: node.goal.slice(0, 100),
    });

    const result = await this.callLLMWithTools(prompt, toolRegistry, {
      maxIterations,
      iterationTimeout: 45000, // 45s per iteration (writes take longer)
      totalTimeout: 420000, // 7 minutes total
    });

    // Check if tests were run and failed — trigger self-heal
    const testFailure = this._detectTestFailure(result.toolLog);
    if (testFailure && this._maxSelfHealAttempts > 0) {
      log.info("Test failure detected, attempting self-heal", {
        nodeId: node.id,
        error: testFailure.slice(0, 200),
      });

      const healedResult = await this._selfHeal(
        testFailure,
        toolRegistry,
        node,
        context,
      );
      if (healedResult) {
        return {
          result: healedResult.answer,
          toolLog: [...result.toolLog, ...healedResult.toolLog],
          selfHealed: true,
          confidence: this._computeResultConfidence(healedResult),
        };
      }
    }

    return {
      result: result.answer,
      toolLog: result.toolLog,
      confidence: this._computeResultConfidence(result),
    };
  }

  /**
   * Build a rich context prompt with workspace info, conventions, and prior results.
   * @private
   */
  _buildPrompt(node, context) {
    const sections = [`TASK: ${node.goal}`];

    // Workspace summary (from indexer)
    if (context.workspaceSummary) {
      sections.push(
        `WORKSPACE:\n${String(context.workspaceSummary).slice(0, 3000)}`,
      );
    }

    // Project conventions (from workspace memory)
    if (context.conventions) {
      sections.push(
        `PROJECT CONVENTIONS:\n${String(context.conventions).slice(0, 1000)}`,
      );
    }

    // Repo context (existing code snippets)
    if (context.repoContext?.context) {
      sections.push(
        `RELEVANT CODE:\n${String(context.repoContext.context).slice(0, 6000)}`,
      );
    }

    // Plan from orchestrator
    if (context.plan) {
      sections.push(`PLAN:\n${JSON.stringify(context.plan).slice(0, 1500)}`);
    }

    // Results from upstream agents
    if (context.previousResults) {
      sections.push(
        `UPSTREAM RESULTS:\n${String(context.previousResults).slice(0, 2000)}`,
      );
    }

    // Language preference
    if (context.language && context.language !== "en") {
      sections.push(
        `USER LANGUAGE: ${context.language}. Add code comments in this language where helpful.`,
      );
    }

    return sections.join("\n\n");
  }

  /**
   * Estimate task complexity from the goal text.
   * @private
   * @returns {"low"|"medium"|"high"}
   */
  _estimateComplexity(goal) {
    const lower = goal.toLowerCase();
    const highKeywords = [
      "refactor",
      "migrate",
      "rewrite",
      "architect",
      "redesign",
      "performance",
      "optimize",
      "security",
      "authentication",
      "database",
      "api design",
      "full stack",
      "multiple files",
    ];
    const lowKeywords = [
      "fix typo",
      "rename",
      "add comment",
      "update import",
      "change color",
      "fix lint",
      "format",
      "small change",
    ];

    if (highKeywords.some((k) => lower.includes(k))) return "high";
    if (lowKeywords.some((k) => lower.includes(k))) return "low";
    return "medium";
  }

  /**
   * Check tool log for test failures.
   * @private
   * @returns {string|null} Error output if tests failed, null otherwise
   */
  _detectTestFailure(toolLog) {
    if (!toolLog || toolLog.length === 0) return null;

    // Look at run_bash results for test failure indicators
    for (let i = toolLog.length - 1; i >= 0; i--) {
      const entry = toolLog[i];
      if (entry.tool !== "run_bash") continue;

      const result = String(entry.result || "");
      const isTestCommand =
        entry.args?.command &&
        /\b(test|jest|vitest|mocha|pytest|cargo test)\b/i.test(
          entry.args.command,
        );

      if (!isTestCommand) continue;

      // Check for failure patterns
      const failPatterns = [
        /\d+ failed/i,
        /FAIL/,
        /AssertionError/i,
        /Error:/,
        /exit code[: ]+[1-9]/i,
        /not ok/i,
        /✗|✘|×/,
      ];

      if (failPatterns.some((p) => p.test(result))) {
        return result;
      }
    }

    return null;
  }

  /**
   * Attempt to fix code after test failure.
   * @private
   */
  async _selfHeal(errorOutput, toolRegistry, node, context) {
    for (let attempt = 0; attempt < this._maxSelfHealAttempts; attempt++) {
      log.info("Self-heal attempt", { attempt: attempt + 1, nodeId: node.id });

      const healPrompt = SELF_HEAL_PROMPT.replace(
        "{ERROR_OUTPUT}",
        errorOutput.slice(0, 4000),
      );

      try {
        const result = await this.callLLMWithTools(healPrompt, toolRegistry, {
          maxIterations: 6,
          iterationTimeout: 45000,
          totalTimeout: 180000, // 3 min for self-heal
        });

        // Check if tests pass now
        const newFailure = this._detectTestFailure(result.toolLog);
        if (!newFailure) {
          log.info("Self-heal succeeded", {
            attempt: attempt + 1,
            nodeId: node.id,
          });
          return result;
        }

        // Still failing — try again with new error
        errorOutput = newFailure;
      } catch (err) {
        log.warn("Self-heal attempt failed", {
          attempt: attempt + 1,
          error: err.message,
        });
      }
    }

    log.warn("Self-heal exhausted", { nodeId: node.id });
    return null;
  }

  /**
   * Compute confidence based on result quality signals.
   * @private
   */
  _computeResultConfidence(result) {
    let confidence = 0.5; // Base

    if (!result.toolLog || result.toolLog.length === 0) {
      return 0.3; // No tools used — low confidence
    }

    // Read before write = good practice
    const tools = result.toolLog.map((e) => e.tool);
    const firstWrite = tools.indexOf("write_file");
    const firstRead = tools.indexOf("read_file");
    if (firstRead >= 0 && (firstWrite < 0 || firstRead < firstWrite)) {
      confidence += 0.15; // Read before write
    }

    // Tests were run
    const hasTestRun = result.toolLog.some(
      (e) =>
        e.tool === "run_bash" &&
        /\b(test|jest|vitest|mocha)\b/i.test(e.args?.command || ""),
    );
    if (hasTestRun) confidence += 0.1;

    // No errors in tool results
    const hasErrors = result.toolLog.some((e) =>
      String(e.result || "").startsWith("ERROR:"),
    );
    if (!hasErrors) confidence += 0.1;

    // Files were actually written
    const hasWrites = result.toolLog.some((e) => e.tool === "write_file");
    if (hasWrites) confidence += 0.1;

    // Self-healed successfully
    if (result.selfHealed) confidence += 0.05;

    return Math.min(confidence, 0.95);
  }
}

module.exports = { CoderAgent };
