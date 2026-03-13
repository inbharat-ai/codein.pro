/**
 * CodIn MAS — Coder Agent
 *
 * Writes, edits, and creates code files.
 * Requests file_write permission before modifying anything.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");
const { buildToolRegistry } = require("../tool-registry");

const SYSTEM_PROMPT = `You are the CodIn Coder Agent. You write production-quality code.

RULES:
1. Follow existing project conventions (language, style, patterns)
2. Write clean, readable code — no unnecessary comments or over-engineering
3. Include error handling at system boundaries only
4. Never introduce security vulnerabilities (OWASP Top 10)
5. If modifying an existing file, preserve the overall structure

OUTPUT FORMAT (JSON):
{
  "result": "Brief description of what was written",
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "create|edit|delete",
      "content": "Full file content for create, or diff description for edit"
    }
  ],
  "confidence": 0.0-1.0,
  "notes": "Any caveats"
}`;

class CoderAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.CODER,
        constraints: {
          network: false,
          write: true,
          commands: false,
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
    return "Writes production-quality code, creates/edits files, follows project conventions.";
  }

  async execute(node, context) {
    // Request write permission
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `Coder agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Complete this coding task:

TASK: ${node.goal}

CONTEXT:
${context.workspaceSummary || "No workspace context."}
  ${context.repoContext?.context ? `REPO CONTEXT:\n${String(context.repoContext.context).slice(0, 6000)}` : ""}
${context.plan ? `PLAN: ${JSON.stringify(context.plan).slice(0, 1000)}` : ""}
${context.previousResults ? `PREVIOUS RESULTS:\n${context.previousResults.slice(0, 1000)}` : ""}`;

    // Get tools from central registry
    const toolRegistry = buildToolRegistry(this, context, node, {
      tools: ["read_file", "write_file", "run_bash"],
      agentLabel: "Coder",
      commandProfile: "DEV",
    });

    // Use tool-use loop if tools are available, otherwise fall back to direct LLM
    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry);
      return {
        result: result.answer,
        toolLog: result.toolLog,
        confidence: this.computeConfidence(result, context),
      };
    } else {
      // Fallback: no tools available, use direct LLM
      const result = await this.callLLMJson(prompt);
      return {
        result: result.result || "Code written",
        files: result.files || [],
        confidence: this.computeConfidence(result, context),
        notes: result.notes,
      };
    }
  }
}

module.exports = { CoderAgent };
