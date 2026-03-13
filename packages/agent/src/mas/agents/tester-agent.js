/**
 * CodIn MAS — Tester Agent
 *
 * Writes tests, runs test suites, validates coverage.
 * Uses central tool registry for file I/O and test execution.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");
const { buildToolRegistry, resolveWorkspaceRoot } = require("../tool-registry");

const SYSTEM_PROMPT = `You are the CodIn Tester Agent. You write and run tests.

RULES:
1. Write tests that cover edge cases and error paths
2. Use the project's existing test framework and patterns
3. Each test should test ONE behavior
4. Avoid implementation-coupled tests — test behavior, not internals
5. Include both positive and negative test cases

You have the following tools:
- read_file(path): Read a file's contents
- write_file(path, content): Write a test file (creates directories as needed)
- run_tests(command): Run a test command (npm test, npx vitest, node --test, etc.)

WORKFLOW:
1. Read the source files to understand what needs testing
2. Read any existing test files to understand patterns and framework
3. Write new test files using write_file
4. Run the tests using run_tests to verify they pass
5. Report structured results

OUTPUT FORMAT (JSON):
{
  "result": "Brief summary of tests written/run",
  "tests": [
    {
      "path": "test/file.test.js",
      "action": "create|edit",
      "content": "Full test file content"
    }
  ],
  "testResults": {
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "details": "Test output summary"
  },
  "confidence": 0.0-1.0
}`;

class TesterAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.TESTER,
        constraints: {
          network: false,
          write: true,
          commands: true,
          git: false,
          mcp: false,
        },
      },
      deps,
    );
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  describeCapabilities() {
    return "Writes test suites, runs tests, validates coverage, covers edge cases.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `Tester agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Write and run tests for this task:

TASK: ${node.goal}

CODE UNDER TEST:
${context.codeUnderTest || "Not provided — use read_file to examine the workspace"}

EXISTING TESTS:
${context.existingTests || "Not provided — use read_file to look for test files"}

TEST FRAMEWORK: ${context.testFramework || "node:test with assert"}

WORKSPACE ROOT: ${resolveWorkspaceRoot(context)}

Use the tools to read source files, write test files, then run them.`;

    const toolRegistry = buildToolRegistry(this, context, node, {
      tools: ["read_file", "write_file", "run_tests"],
      agentLabel: "Tester",
      commandProfile: "TEST",
    });

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry);
      // Extract structured test results from tool log if available
      const testResults = this._extractTestResults(result.toolLog);
      return {
        result: result.answer,
        toolLog: result.toolLog,
        testResults,
        confidence: testResults && testResults.failed === 0 ? 0.9 : 0.6,
      };
    }

    // Fallback: no tools available, use direct LLM
    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Tests written",
      tests: result.tests || [],
      testResults: result.testResults || null,
      confidence: result.confidence || 0.75,
    };
  }

  /**
   * Parse raw test output to extract pass/fail counts.
   * Handles common formats: TAP, Jest, Vitest, node:test.
   * @private
   */
  _parseTestOutput(output) {
    const result = { passed: 0, failed: 0, skipped: 0, coverage: null };
    if (!output) return result;

    // Jest / Vitest format: "Tests: 3 passed, 1 failed, 4 total"
    const jestMatch = output.match(
      /Tests:\s*(?:(\d+)\s*passed)?[,\s]*(?:(\d+)\s*failed)?[,\s]*(?:(\d+)\s*skipped)?/i,
    );
    if (jestMatch) {
      result.passed = parseInt(jestMatch[1] || "0", 10);
      result.failed = parseInt(jestMatch[2] || "0", 10);
      result.skipped = parseInt(jestMatch[3] || "0", 10);
    }

    // TAP format: "# pass 5" / "# fail 2"
    const tapPass = output.match(/# pass\s+(\d+)/i);
    const tapFail = output.match(/# fail\s+(\d+)/i);
    const tapSkip = output.match(/# skip\s+(\d+)/i);
    if (tapPass)
      result.passed = Math.max(result.passed, parseInt(tapPass[1], 10));
    if (tapFail)
      result.failed = Math.max(result.failed, parseInt(tapFail[1], 10));
    if (tapSkip)
      result.skipped = Math.max(result.skipped, parseInt(tapSkip[1], 10));

    // node:test format
    const nodePass = output.match(/✓|ok \d+/g);
    const nodeFail = output.match(/✗|not ok \d+/g);
    if (nodePass && result.passed === 0) result.passed = nodePass.length;
    if (nodeFail && result.failed === 0) result.failed = nodeFail.length;

    // Generic "X passing" / "Y failing"
    const genericPass = output.match(/(\d+)\s+passing/i);
    const genericFail = output.match(/(\d+)\s+failing/i);
    if (genericPass)
      result.passed = Math.max(result.passed, parseInt(genericPass[1], 10));
    if (genericFail)
      result.failed = Math.max(result.failed, parseInt(genericFail[1], 10));

    // Coverage: "Stmts : 85.5%" or "All files | 85.5"
    const coverageMatch = output.match(
      /(?:Stmts|Statements|All files)\s*[:|]\s*([\d.]+)%?/i,
    );
    if (coverageMatch) {
      result.coverage = `${coverageMatch[1]}%`;
    }

    return result;
  }

  /**
   * Extract structured test results from tool log entries.
   * @private
   */
  _extractTestResults(toolLog) {
    if (!Array.isArray(toolLog)) return null;

    for (let i = toolLog.length - 1; i >= 0; i--) {
      const entry = toolLog[i];
      if (entry.tool === "run_tests" && entry.result && !entry.error) {
        const parsed = this._parseTestOutput(entry.result);
        return {
          passed: parsed.passed,
          failed: parsed.failed,
          skipped: parsed.skipped,
          coverage: parsed.coverage,
          details: String(entry.result).slice(0, 2000),
        };
      }
    }
    return null;
  }
}

module.exports = { TesterAgent };
