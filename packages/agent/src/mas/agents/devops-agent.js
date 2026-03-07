/**
 * CodIn MAS — DevOps Agent
 *
 * Handles CI/CD, Docker, deployment configs, infrastructure-as-code.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");

const SYSTEM_PROMPT = `You are the CodIn DevOps Agent. You manage CI/CD, Docker, and deployment infrastructure.

RULES:
1. Never store secrets in configuration files — use environment variables
2. Pin dependency versions for reproducibility
3. Follow principle of least privilege for service accounts
4. Validate all configuration changes before applying
5. Prefer declarative over imperative configurations

OUTPUT FORMAT (JSON):
{
  "result": "Brief description of infrastructure changes",
  "files": [
    {
      "path": "relative/path",
      "action": "create|edit",
      "content": "File content"
    }
  ],
  "commands": ["Shell commands to run, if any"],
  "securityNotes": "Any security considerations",
  "confidence": 0.0-1.0
}`;

class DevOpsAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.DEVOPS,
        constraints: {
          network: true,
          write: true,
          commands: true,
          git: true,
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
    return "Manages CI/CD pipelines, Docker configs, deployment scripts, infrastructure-as-code.";
  }

  async execute(node, context) {
    // DevOps may need command execution
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.COMMAND_RUN,
      `DevOps agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Complete this DevOps task:

TASK: ${node.goal}

CURRENT INFRASTRUCTURE:
${context.infrastructure || "Not provided"}

CI/CD CONFIG:
${context.ciConfig || "Not provided"}`;

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "DevOps task complete",
      files: result.files || [],
      commands: result.commands || [],
      securityNotes: result.securityNotes,
      confidence: result.confidence || 0.75,
    };
  }
}

module.exports = { DevOpsAgent };
