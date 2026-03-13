/**
 * CodIn MAS — Refactorer Agent
 *
 * Restructures code for clarity, performance, or maintainability.
 * Runs tests before and after to verify behavior preservation.
 * Rolls back changes if post-refactor tests fail.
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
]);

const SYSTEM_PROMPT = `You are the CodIn Refactorer Agent. You improve code structure without changing behavior.

RULES:
1. Preserve all existing behavior — refactoring must be behavior-preserving
2. Focus on the specific refactoring requested
3. Don't add features or fix unrelated bugs during refactoring
4. Maintain backward compatibility for public APIs
5. Keep changes minimal and reviewable

You have the following tools:
- read_file(path): Read a file's contents
- write_file(path, content): Write/overwrite a file
- run_tests(command): Run tests to verify behavior is preserved
- generate_diff(path): Show a unified diff of changes made to a file

WORKFLOW:
1. Read the target files to understand the current code
2. Run tests BEFORE refactoring to establish a passing baseline
3. Write the refactored code using write_file
4. Run tests AFTER refactoring to verify behavior is preserved
5. If tests fail after refactoring, use write_file to rollback to original content
6. Use generate_diff to show what changed

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
${context.targetCode || "Not provided — use read_file to examine the workspace"}

CONSTRAINTS:
${context.constraints || "Preserve all behavior, maintain API compatibility"}

WORKSPACE ROOT: ${this._resolveWorkspaceRoot(context)}

IMPORTANT: Follow this workflow:
1. Read the files you need to refactor
2. Run tests BEFORE making changes (use run_tests)
3. Refactor the code using write_file
4. Run tests AFTER refactoring (use run_tests)
5. If post-refactoring tests fail, ROLLBACK by writing the original content back
6. Use generate_diff to show what changed`;

    const toolRegistry = this._getToolRegistry(context, node);

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry);
      const diffs = this._collectDiffs();
      const rolledBack = this._originals.size > 0; // still have unreleased originals = rollback happened
      return {
        result: result.answer,
        toolLog: result.toolLog,
        diffs,
        rolledBack,
        confidence: rolledBack ? 0.4 : 0.85,
        riskLevel: rolledBack ? "high" : "low",
      };
    }

    // Fallback: no tools
    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Refactoring complete",
      changes: result.changes || [],
      confidence: result.confidence || 0.8,
      riskLevel: result.riskLevel || "low",
    };
  }

  /**
   * Build tool registry for refactoring operations.
   * @private
   */
  _getToolRegistry(context, node) {
    const registry = {};
    const workspaceRoot = this._resolveWorkspaceRoot(context);

    // Track original file contents for rollback and diff
    this._originals = new Map();
    this._diffs = [];

    // --- read_file ---
    registry.read_file = {
      description: "Read the contents of a file. Args: { path: string }",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string") {
          throw new Error("path is required");
        }
        const targetPath = this._resolveSafePath(workspaceRoot, path);
        const content = await fs.readFile(targetPath, "utf8");

        // Snapshot original content for rollback (only first read)
        if (!this._originals.has(targetPath)) {
          this._originals.set(targetPath, content);
        }

        return content.slice(0, 120000);
      },
    };

    // --- write_file ---
    registry.write_file = {
      description:
        "Write content to a file. Snapshots the original for rollback. Args: { path: string, content: string }",
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
          `Refactorer tool write_file: ${path}`,
        );
        if (perm.decision !== PERMISSION_DECISION.APPROVED) {
          throw new Error(`Write denied: ${perm.reason}`);
        }

        const targetPath = this._resolveSafePath(workspaceRoot, path);

        // Snapshot original if not already captured
        if (!this._originals.has(targetPath)) {
          try {
            const existing = await fs.readFile(targetPath, "utf8");
            this._originals.set(targetPath, existing);
          } catch {
            // File doesn't exist yet — no original to snapshot
          }
        }

        await fs.mkdir(pathModule.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, "utf8");
        return `Wrote ${path} (${content.length} chars)`;
      },
    };

    // --- run_tests ---
    registry.run_tests = {
      description:
        'Run a test command to verify behavior. Args: { command: string (e.g. "npm test") }',
      execute: async (args) => {
        const { command } = args || {};
        if (!command || typeof command !== "string") {
          throw new Error("command is required");
        }

        const parsed = this._parseCommand(command);
        if (!SAFE_COMMANDS.has(parsed.cmd)) {
          throw new Error(
            `Command not allowed: ${parsed.cmd}. Allowed: ${[...SAFE_COMMANDS].join(", ")}`,
          );
        }

        const perm = await this.requestPermission(
          node.id,
          PERMISSION_TYPE.COMMAND_RUN,
          `Refactorer tool run_tests: ${command}`,
        );
        if (perm.decision !== PERMISSION_DECISION.APPROVED) {
          throw new Error(`Command denied: ${perm.reason}`);
        }

        let stdout = "";
        let stderr = "";
        let exitCode = 0;
        try {
          const result = await execFileAsync(parsed.cmd, parsed.args, {
            cwd: workspaceRoot,
            timeout: 120000,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
          });
          stdout = result.stdout || "";
          stderr = result.stderr || "";
        } catch (err) {
          stdout = err.stdout || "";
          stderr = err.stderr || "";
          exitCode = err.code || 1;
        }

        const output = `${stdout}${stderr ? `\nSTDERR:\n${stderr}` : ""}`;
        return `Exit code: ${exitCode}\n${output.slice(0, 8000)}`;
      },
    };

    // --- generate_diff ---
    registry.generate_diff = {
      description:
        "Generate a unified diff showing changes made to a file. Args: { path: string }",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string") {
          throw new Error("path is required");
        }
        const targetPath = this._resolveSafePath(workspaceRoot, path);
        const original = this._originals.get(targetPath);
        if (original === undefined) {
          return "No original snapshot — file was not read before editing.";
        }

        let current;
        try {
          current = await fs.readFile(targetPath, "utf8");
        } catch {
          return "File no longer exists (was deleted).";
        }

        if (original === current) {
          return "No changes detected.";
        }

        const diff = this._generateUnifiedDiff(path, original, current);
        this._diffs.push({ path, diff });
        return diff;
      },
    };

    // --- rollback_file ---
    registry.rollback_file = {
      description:
        "Rollback a file to its original content (before refactoring). Args: { path: string }",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string") {
          throw new Error("path is required");
        }
        const targetPath = this._resolveSafePath(workspaceRoot, path);
        const original = this._originals.get(targetPath);
        if (original === undefined) {
          throw new Error(`No snapshot for ${path} — cannot rollback.`);
        }
        await fs.writeFile(targetPath, original, "utf8");
        this._originals.delete(targetPath);
        return `Rolled back ${path} to original content.`;
      },
    };

    return registry;
  }

  /**
   * Generate a simple unified diff between two strings.
   * @private
   */
  _generateUnifiedDiff(filePath, original, modified) {
    const origLines = original.split("\n");
    const modLines = modified.split("\n");
    const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];

    // Simple line-by-line diff with context
    const maxLen = Math.max(origLines.length, modLines.length);
    let chunkStart = -1;
    let chunk = [];

    const flushChunk = () => {
      if (chunk.length > 0) {
        lines.push(`@@ -${chunkStart + 1} +${chunkStart + 1} @@`);
        lines.push(...chunk);
        chunk = [];
        chunkStart = -1;
      }
    };

    for (let i = 0; i < maxLen; i++) {
      const origLine = i < origLines.length ? origLines[i] : undefined;
      const modLine = i < modLines.length ? modLines[i] : undefined;

      if (origLine === modLine) {
        // Context line — include if near a change
        if (chunk.length > 0) {
          chunk.push(` ${origLine}`);
          // Flush chunk if we've had 3 context lines with no more changes
          if (chunk.filter((l) => l.startsWith(" ")).length >= 3) {
            flushChunk();
          }
        }
        continue;
      }

      if (chunkStart === -1) chunkStart = Math.max(0, i - 1);

      if (origLine !== undefined && modLine !== undefined) {
        chunk.push(`-${origLine}`);
        chunk.push(`+${modLine}`);
      } else if (origLine !== undefined) {
        chunk.push(`-${origLine}`);
      } else {
        chunk.push(`+${modLine}`);
      }
    }

    flushChunk();

    if (lines.length === 2) return "No changes detected.";
    return lines.join("\n").slice(0, 10000);
  }

  /**
   * Collect all diffs generated during execution.
   * @private
   */
  _collectDiffs() {
    return this._diffs || [];
  }

  // --- Shared utility methods (same pattern as CoderAgent) ---

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

module.exports = { RefactorerAgent };
