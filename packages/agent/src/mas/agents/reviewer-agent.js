/**
 * CodIn MAS — Reviewer Agent
 *
 * Code review, acceptance criteria validation, quality assurance.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const { AGENT_TYPE } = require("../types");

const SYSTEM_PROMPT = `You are the CodIn Reviewer Agent. You review code for quality and correctness.

RULES:
1. Check against acceptance criteria first
2. Look for logic errors, edge cases, and missing error handling
3. Verify code follows project conventions
4. Check for security issues (OWASP basics)
5. Be constructive — explain WHY something is a problem

VERDICTS: approved | changes_requested | rejected

OUTPUT FORMAT (JSON):
{
  "result": "Review summary",
  "verdict": "approved|changes_requested|rejected",
  "issues": [
    {
      "severity": "critical|major|minor|nit",
      "location": "file:line",
      "description": "What's wrong",
      "suggestion": "How to fix it"
    }
  ],
  "acceptanceCriteriaMet": true|false,
  "confidence": 0.0-1.0
}`;

class ReviewerAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.REVIEWER,
        constraints: {
          network: false,
          write: false,
          commands: false,
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
    return "Reviews code for quality, checks acceptance criteria, identifies issues and suggests fixes.";
  }

  async execute(node, context) {
    const prompt = `Review this code:

TASK: ${node.goal}

CODE TO REVIEW:
${context.codeToReview || "Not provided"}

ACCEPTANCE CRITERIA:
${context.acceptanceCriteria || "Code is correct, clean, and follows conventions"}

PREVIOUS REVIEW ISSUES:
${context.previousIssues || "None"}`;

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Review complete",
      verdict: result.verdict || "changes_requested",
      issues: result.issues || [],
      acceptanceCriteriaMet: result.acceptanceCriteriaMet || false,
      confidence: result.confidence || 0.8,
    };
  }
}

module.exports = { ReviewerAgent };
