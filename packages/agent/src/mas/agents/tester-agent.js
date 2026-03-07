/**
 * CodIn MAS — Tester Agent
 *
 * Writes tests, runs test suites, validates coverage.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");

const SYSTEM_PROMPT = `You are the CodIn Tester Agent. You write and run tests.

RULES:
1. Write tests that cover edge cases and error paths
2. Use the project's existing test framework and patterns
3. Each test should test ONE behavior
4. Avoid implementation-coupled tests — test behavior, not internals
5. Include both positive and negative test cases

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

    const prompt = `Write/run tests for this task:

TASK: ${node.goal}

CODE UNDER TEST:
${context.codeUnderTest || "Not provided — analyze the workspace"}

EXISTING TESTS:
${context.existingTests || "Not provided"}

TEST FRAMEWORK: ${context.testFramework || "node:test with assert"}`;

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Tests written",
      tests: result.tests || [],
      testResults: result.testResults || null,
      confidence: result.confidence || 0.75,
    };
  }
}

module.exports = { TesterAgent };
