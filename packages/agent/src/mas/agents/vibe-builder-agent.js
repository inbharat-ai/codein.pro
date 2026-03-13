/**
 * CodIn MAS — Vibe Builder Agent
 *
 * Rapidly scaffolds projects and prototypes with focus on aesthetics,
 * UX polish, and getting a working demo fast.
 * Reuses the CoderAgent tool registry pattern (read_file, write_file, run_bash).
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

const SYSTEM_PROMPT = `You are the CodIn Vibe Builder Agent. You rapidly scaffold beautiful, functional prototypes.

RULES:
1. Prioritize speed and visual appeal — get something working and good-looking fast
2. Use modern UI patterns (responsive, accessible, dark mode friendly)
3. Include sensible defaults and placeholder content
4. Wire up basic interactivity — buttons click, forms submit, nav works
5. Keep dependencies minimal — prefer CSS over heavy UI libraries when possible

You have tools to read files, write files, and run commands. Use them to scaffold
real files and install dependencies. Work iteratively: read existing code, write new
files, run setup commands.

OUTPUT FORMAT (JSON):
{
  "result": "Summary of what was scaffolded",
  "files": [
    {
      "path": "relative/path/to/file",
      "action": "create|edit",
      "content": "Full file content"
    }
  ],
  "stack": "react|vue|vanilla|etc",
  "confidence": 0.0-1.0,
  "nextSteps": "What to do next to make it production-ready"
}`;

class VibeBuilderAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.VIBE_BUILDER,
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
    return "Rapidly scaffolds projects and prototypes with focus on aesthetics and UX.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `Vibe Builder: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Scaffold/prototype task:

TASK: ${node.goal}

CONTEXT:
${context.workspaceSummary || "No workspace context."}
${context.repoContext?.context ? `REPO CONTEXT:\n${String(context.repoContext.context).slice(0, 6000)}` : ""}
${context.plan ? `PLAN: ${JSON.stringify(context.plan).slice(0, 1000)}` : ""}
${context.previousResults ? `PREVIOUS RESULTS:\n${context.previousResults.slice(0, 1000)}` : ""}

Create a working, visually appealing prototype. Focus on speed and aesthetics.
Use the available tools to read existing files, write new ones, and run setup commands.`;

    const toolRegistry = this._getToolRegistry(context, node);

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry, {
        maxIterations: 8,
      });
      return {
        result: result.answer,
        toolLog: result.toolLog,
        confidence: 0.8,
      };
    } else {
      const result = await this.callLLMJson(prompt);
      return {
        result: result.result || "Prototype scaffolded",
        files: result.files || [],
        stack: result.stack || "unknown",
        confidence: result.confidence || 0.8,
        nextSteps: result.nextSteps || "",
      };
    }
  }

  /**
   * Build tool registry — mirrors CoderAgent's read_file, write_file, run_bash.
   * @private
   */
  _getToolRegistry(context, node) {
    const registry = {};
    const workspaceRoot = this._resolveWorkspaceRoot(context);

    // ─── read_file ─────────────────────────────────────────
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

    // ─── write_file ────────────────────────────────────────
    registry.write_file = {
      description:
        "Write content to a file (creates parent dirs). Args: { path: string, content: string }",
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
          `Vibe Builder tool write_file: ${path}`,
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

    // ─── run_bash ──────────────────────────────────────────
    registry.run_bash = {
      description:
        "Run a shell command (whitelisted commands only). Args: { command: string }",
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
          `Vibe Builder tool run_bash: ${command}`,
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

  // ─── Path safety (same pattern as CoderAgent) ──────────

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

  /**
   * Minimal command parser: supports quoted args and spaces without invoking a shell.
   * @private
   */
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

module.exports = { VibeBuilderAgent };
