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
${context.plan ? `PLAN: ${JSON.stringify(context.plan).slice(0, 1000)}` : ""}
${context.previousResults ? `PREVIOUS RESULTS:\n${context.previousResults.slice(0, 1000)}` : ""}`;

    // Get tools from MCP manager if available
    const toolRegistry = await this._getToolRegistry();

    // Use tool-use loop if tools are available, otherwise fall back to direct LLM
    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry);
      return {
        result: result.answer,
        toolLog: result.toolLog,
        confidence: 0.8,
      };
    } else {
      // Fallback: no tools available, use direct LLM
      const result = await this.callLLMJson(prompt);
      return {
        result: result.result || "Code written",
        files: result.files || [],
        confidence: result.confidence || 0.8,
        notes: result.notes,
      };
    }
  }

  /**
   * Build tool registry from MCP tools
   * @private
   */
  async _getToolRegistry() {
    const registry = {};

    // Add file reading tool
    registry.read_file = {
      description: "Read the contents of a file",
      execute: async (args) => {
        const { path } = args;
        if (!path) throw new Error("path is required");
        // This would call actual file system API
        return `[File would be read: ${path}]`;
      },
    };

    // Add file writing tool
    registry.write_file = {
      description: "Write content to a file (requests permission)",
      execute: async (args) => {
        const { path, content } = args;
        if (!path || !content) throw new Error("path and content are required");
        // This would call actual file system API
        return `[File would be written: ${path}]`;
      },
    };

    // Add bash execution tool
    registry.run_bash = {
      description: "Run a bash command (requests permission)",
      execute: async (args) => {
        const { command } = args;
        if (!command) throw new Error("command is required");
        // This would call actual shell API
        return `[Command would run: ${command}]`;
      },
    };

    return registry;
  }
}

module.exports = { CoderAgent };
