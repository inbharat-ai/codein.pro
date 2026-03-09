/**
 * CodIn MAS — Coder Agent
 *
 * Writes, edits, and creates code files.
 * Requests file_write permission before modifying anything.
 */
"use strict";

const pathModule = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");

const execFileAsync = promisify(execFile);
const SAFE_COMMANDS = new Set([
  "npm",
  "npm.cmd",
  "npx",
  "npx.cmd",
  "node",
  "node.exe",
  "pnpm",
  "pnpm.cmd",
  "yarn",
  "yarn.cmd",
  "python",
  "python.exe",
  "python3",
  "go",
  "cargo",
  "git",
  "git.exe",
]);

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

    // Get tools from MCP manager if available
    const toolRegistry = await this._getToolRegistry(context, node);

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
  async _getToolRegistry(context, node) {
    const registry = {};
    const workspaceRoot = this._resolveWorkspaceRoot(context);

    // Add file reading tool
    registry.read_file = {
      description: "Read the contents of a file",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string") {
          throw new Error("path is required");
        }
        const targetPath = this._resolveSafePath(workspaceRoot, path);
        const content = await fs.readFile(targetPath, "utf8");
        return content.slice(0, 120000);
      },
    };

    // Add file writing tool
    registry.write_file = {
      description: "Write content to a file (requests permission)",
      execute: async (args) => {
        const { path, content } = args || {};
        if (!path || typeof path !== "string") {
          throw new Error("path is required");
        }
        if (typeof content !== "string") {
          throw new Error("content must be a string");
        }

        const perm = await this.requestPermission(
          node.id,
          PERMISSION_TYPE.FILE_WRITE,
          `Coder tool write_file: ${path}`,
        );
        if (perm.decision !== PERMISSION_DECISION.APPROVED) {
          throw new Error(`Write denied: ${perm.reason}`);
        }

        const targetPath = this._resolveSafePath(workspaceRoot, path);
        await fs.mkdir(pathModule.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, "utf8");
        return `Wrote ${path} (${content.length} chars)`;
      },
    };

    // Add bash execution tool
    registry.run_bash = {
      description: "Run a bash command (requests permission)",
      execute: async (args) => {
        const { command } = args || {};
        if (!command || typeof command !== "string") {
          throw new Error("command is required");
        }

        const parsed = this._parseCommand(command);
        if (!SAFE_COMMANDS.has(parsed.cmd)) {
          throw new Error(`Command not allowed: ${parsed.cmd}`);
        }

        const perm = await this.requestPermission(
          node.id,
          PERMISSION_TYPE.COMMAND_RUN,
          `Coder tool run_bash: ${command}`,
        );
        if (perm.decision !== PERMISSION_DECISION.APPROVED) {
          throw new Error(`Command denied: ${perm.reason}`);
        }

        const { stdout, stderr } = await execFileAsync(
          parsed.cmd,
          parsed.args,
          {
            cwd: workspaceRoot,
            timeout: 60000,
            maxBuffer: 512 * 1024,
            windowsHide: true,
          },
        );
        const output = `${stdout || ""}${stderr ? `\n${stderr}` : ""}`;
        return output.trim().slice(0, 120000);
      },
    };

    return registry;
  }

  _resolveWorkspaceRoot(context) {
    const candidate =
      context?.workspaceRoot || context?.workspacePath || process.cwd();
    return pathModule.resolve(candidate);
  }

  _resolveSafePath(workspaceRoot, relativePath) {
    const resolved = pathModule.resolve(workspaceRoot, relativePath);
    const rootWithSep = workspaceRoot.endsWith(pathModule.sep)
      ? workspaceRoot
      : workspaceRoot + pathModule.sep;
    if (resolved !== workspaceRoot && !resolved.startsWith(rootWithSep)) {
      throw new Error("Path traversal detected");
    }
    return resolved;
  }

  _parseCommand(command) {
    // Minimal parser: supports quoted args and spaces without invoking a shell.
    const tokens = [];
    let current = "";
    let quote = null;
    for (let i = 0; i < command.length; i++) {
      const ch = command[i];
      if ((ch === '"' || ch === "'") && quote === null) {
        quote = ch;
        continue;
      }
      if (quote && ch === quote) {
        quote = null;
        continue;
      }
      if (!quote && /\s/.test(ch)) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        continue;
      }
      current += ch;
    }
    if (current) tokens.push(current);
    if (tokens.length === 0) throw new Error("Command is empty");
    return { cmd: tokens[0], args: tokens.slice(1) };
  }
}

module.exports = { CoderAgent };
