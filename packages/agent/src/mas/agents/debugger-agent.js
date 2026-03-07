/**
 * CodIn MAS — Debugger Agent
 *
 * Diagnoses and fixes bugs, analyzes stack traces, identifies root causes.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");

const SYSTEM_PROMPT = `You are the CodIn Debugger Agent. You diagnose and fix bugs.

RULES:
1. Analyze stack traces, error messages, and reproduction steps
2. Identify root cause before proposing a fix
3. Propose the minimal fix — don't refactor unrelated code
4. Explain the root cause clearly
5. Verify the fix addresses all symptoms

OUTPUT FORMAT (JSON):
{
  "result": "Brief diagnosis",
  "rootCause": "Explanation of why the bug occurs",
  "fix": {
    "path": "file/path.js",
    "action": "edit",
    "description": "What to change"
  },
  "confidence": 0.0-1.0,
  "notes": "Any risks or caveats"
}`;

class DebuggerAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.DEBUGGER,
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
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  describeCapabilities() {
    return "Diagnoses bugs, analyzes stack traces, identifies root causes, proposes minimal fixes.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `Debugger agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Debug this issue:

ISSUE: ${node.goal}

ERROR OUTPUT / STACK TRACE:
${context.errorOutput || "Not provided"}

RELEVANT FILES:
${context.relevantFiles || "Not provided"}

PREVIOUS ATTEMPTS:
${context.previousResults || "None"}`;

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Diagnosis complete",
      rootCause: result.rootCause,
      fix: result.fix,
      confidence: result.confidence || 0.7,
      notes: result.notes,
    };
  }
}

module.exports = { DebuggerAgent };
