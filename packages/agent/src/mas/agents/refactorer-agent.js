/**
 * CodIn MAS — Refactorer Agent
 *
 * Restructures code for clarity, performance, or maintainability.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");

const SYSTEM_PROMPT = `You are the CodIn Refactorer Agent. You improve code structure without changing behavior.

RULES:
1. Preserve all existing behavior — refactoring must be behavior-preserving
2. Focus on the specific refactoring requested
3. Don't add features or fix unrelated bugs during refactoring
4. Maintain backward compatibility for public APIs
5. Keep changes minimal and reviewable

OUTPUT FORMAT (JSON):
{
  "result": "Brief description of refactoring performed",
  "changes": [
    {
      "path": "file/path.js",
      "action": "edit",
      "before": "Description of old structure",
      "after": "Description of new structure",
      "rationale": "Why this change improves the code"
    }
  ],
  "confidence": 0.0-1.0,
  "riskLevel": "low|medium|high"
}`;

class RefactorerAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.REFACTORER,
        constraints: {
          network: false,
          write: true,
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
    return "Restructures code for clarity and maintainability, behavior-preserving changes only.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `Refactorer agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Refactor code as described:

TASK: ${node.goal}

TARGET CODE:
${context.targetCode || "Not provided — analyze workspace"}

CONSTRAINTS:
${context.constraints || "Preserve all behavior, maintain API compatibility"}`;

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Refactoring complete",
      changes: result.changes || [],
      confidence: result.confidence || 0.8,
      riskLevel: result.riskLevel || "low",
    };
  }
}

module.exports = { RefactorerAgent };
