/**
 * CodIn MAS — Debugger Agent
 *
 * Diagnoses and fixes bugs, analyzes stack traces, identifies root causes.
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

    const toolRegistry = await this._getToolRegistry(context, node);

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry);
      return {
        result: result.answer || "Diagnosis complete",
        toolLog: result.toolLog,
        confidence: this.computeConfidence(result, context),
      };
    }

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Diagnosis complete",
      rootCause: result.rootCause,
      fix: result.fix,
      confidence: result.confidence || 0.7,
      notes: result.notes,
    };
  }

  async _getToolRegistry(context, node) {
    const registry = {};
    const workspaceRoot = this._resolveWorkspaceRoot(context);

    registry.read_file = {
      description: "Read a file to inspect failing code",
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

    registry.write_file = {
      description: "Apply a bug fix by writing updated file content",
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
          `Debugger tool write_file: ${path}`,
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

    registry.run_bash = {
      description: "Run project diagnostics or tests while debugging",
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
          `Debugger tool run_bash: ${command}`,
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

module.exports = { DebuggerAgent };
