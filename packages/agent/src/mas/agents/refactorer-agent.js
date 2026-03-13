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
const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");
const {
  createRunTestsTool,
  resolveWorkspaceRoot,
  resolveSafePath,
} = require("../tool-registry");

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
- rollback_file(path): Revert a file to its original content

WORKFLOW:
1. Read the target files to understand the current code
2. Run tests BEFORE refactoring to establish a passing baseline
3. Write the refactored code using write_file
4. Run tests AFTER refactoring to verify behavior is preserved
5. If tests fail after refactoring, use rollback_file to revert
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

    const workspaceRoot = resolveWorkspaceRoot(context);

    const prompt = `Refactor code as described:

TASK: ${node.goal}

TARGET CODE:
${context.targetCode || "Not provided — use read_file to examine the workspace"}

CONSTRAINTS:
${context.constraints || "Preserve all behavior, maintain API compatibility"}

WORKSPACE ROOT: ${workspaceRoot}

IMPORTANT: Follow this workflow:
1. Read the files you need to refactor
2. Run tests BEFORE making changes (use run_tests)
3. Refactor the code using write_file
4. Run tests AFTER refactoring (use run_tests)
5. If post-refactoring tests fail, ROLLBACK by using rollback_file
6. Use generate_diff to show what changed`;

    const toolRegistry = this._getToolRegistry(context, node, workspaceRoot);

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry);
      const diffs = this._collectDiffs();
      const rolledBack = this._originals.size > 0;
      return {
        result: result.answer,
        toolLog: result.toolLog,
        diffs,
        rolledBack,
        confidence: rolledBack ? 0.4 : 0.85,
        riskLevel: rolledBack ? "high" : "low",
      };
    }

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Refactoring complete",
      changes: result.changes || [],
      confidence: result.confidence || 0.8,
      riskLevel: result.riskLevel || "low",
    };
  }

  /**
   * Build tool registry. Uses central run_tests; custom read/write with snapshotting.
   * @private
   */
  _getToolRegistry(context, node, workspaceRoot) {
    // Track original file contents for rollback and diff
    this._originals = new Map();
    this._diffs = [];

    const registry = {};

    // Custom read_file with snapshotting
    registry.read_file = {
      description: "Read the contents of a file. Args: { path: string }",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string")
          throw new Error("path is required");
        const targetPath = resolveSafePath(workspaceRoot, path);
        const content = await fs.readFile(targetPath, "utf8");
        // Snapshot original content for rollback (only first read)
        if (!this._originals.has(targetPath)) {
          this._originals.set(targetPath, content);
        }
        return content.slice(0, 120000);
      },
    };

    // Custom write_file with snapshotting
    registry.write_file = {
      description:
        "Write content to a file. Snapshots the original for rollback. Args: { path: string, content: string }",
      execute: async (args) => {
        const { path, content } = args || {};
        if (!path || typeof path !== "string")
          throw new Error("path is required");
        if (typeof content !== "string")
          throw new Error("content must be a string");

        const perm = await this.requestPermission(
          node.id,
          PERMISSION_TYPE.FILE_WRITE,
          `Refactorer tool write_file: ${path}`,
        );
        if (perm.decision !== PERMISSION_DECISION.APPROVED) {
          throw new Error(`Write denied: ${perm.reason}`);
        }

        const targetPath = resolveSafePath(workspaceRoot, path);

        // Snapshot original if not already captured
        if (!this._originals.has(targetPath)) {
          try {
            const existing = await fs.readFile(targetPath, "utf8");
            this._originals.set(targetPath, existing);
          } catch {
            // File doesn't exist yet
          }
        }

        await fs.mkdir(pathModule.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content, "utf8");
        return `Wrote ${path} (${content.length} chars)`;
      },
    };

    // run_tests from central registry
    registry.run_tests = createRunTestsTool(this, node.id, workspaceRoot, {
      agentLabel: "Refactorer",
    });

    // generate_diff — Refactorer-specific
    registry.generate_diff = {
      description:
        "Generate a unified diff showing changes made to a file. Args: { path: string }",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string")
          throw new Error("path is required");
        const targetPath = resolveSafePath(workspaceRoot, path);
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
        if (original === current) return "No changes detected.";
        const diff = this._generateUnifiedDiff(path, original, current);
        this._diffs.push({ path, diff });
        return diff;
      },
    };

    // rollback_file — Refactorer-specific
    registry.rollback_file = {
      description:
        "Rollback a file to its original content (before refactoring). Args: { path: string }",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string")
          throw new Error("path is required");
        const targetPath = resolveSafePath(workspaceRoot, path);
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

  /** @private */
  _generateUnifiedDiff(filePath, original, modified) {
    const origLines = original.split("\n");
    const modLines = modified.split("\n");
    const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
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
        if (chunk.length > 0) {
          chunk.push(` ${origLine}`);
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

  /** @private */
  _collectDiffs() {
    return this._diffs || [];
  }
}

module.exports = { RefactorerAgent };
