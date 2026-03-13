/**
 * CodIn MAS — Tester Agent
 *
 * Writes tests, runs test suites, validates coverage.
 * Uses tool registry for file I/O and test execution.
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

const SAFE_TEST_COMMANDS = new Set([
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

const SYSTEM_PROMPT = `You are the CodIn Tester Agent. You write and run tests.

RULES:
1. Write tests that cover edge cases and error paths
2. Use the project's existing test framework and patterns
3. Each test should test ONE behavior
4. Avoid implementation-coupled tests — test behavior, not internals
5. Include both positive and negative test cases

You have the following tools:
- read_file(path): Read a file's contents
- write_file(path, content): Write a test file (creates directories as needed)
- run_tests(command): Run a test command (npm test, npx vitest, node --test, etc.)

WORKFLOW:
1. Read the source files to understand what needs testing
2. Read any existing test files to understand patterns and framework
3. Write new test files using write_file
4. Run the tests using run_tests to verify they pass
5. Report structured results

OUTPUT FORMAT (JSON):
{
  "result": "Brief summary of tests written/run",
  "tests": [
    {
      "path": "test/file.test.js",
      "action": "create|edit",
      "content": "Full test file content"
    }
  ],
  "testResults": {
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "details": "Test output summary"
  },
  "confidence": 0.0-1.0
}`;

class TesterAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.TESTER,
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
    return "Writes test suites, runs tests, validates coverage, covers edge cases.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `Tester agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Write and run tests for this task:

TASK: ${node.goal}

CODE UNDER TEST:
${context.codeUnderTest || "Not provided — use read_file to examine the workspace"}

EXISTING TESTS:
${context.existingTests || "Not provided — use read_file to look for test files"}

TEST FRAMEWORK: ${context.testFramework || "node:test with assert"}

WORKSPACE ROOT: ${this._resolveWorkspaceRoot(context)}

Use the tools to read source files, write test files, then run them.`;

    const toolRegistry = this._getToolRegistry(context, node);

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry);
      // Extract structured test results from tool log if available
      const testResults = this._extractTestResults(result.toolLog);
      return {
        result: result.answer,
        toolLog: result.toolLog,
        testResults,
        confidence: testResults && testResults.failed === 0 ? 0.9 : 0.6,
      };
    }

    // Fallback: no tools available, use direct LLM
    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Tests written",
      tests: result.tests || [],
      testResults: result.testResults || null,
      confidence: result.confidence || 0.75,
    };
  }

  /**
   * Build tool registry for test operations.
   * @private
   */
  _getToolRegistry(context, node) {
    const registry = {};
    const workspaceRoot = this._resolveWorkspaceRoot(context);

    // --- read_file ---
    registry.read_file = {
      description:
        "Read the contents of a file. Args: { path: string (relative to workspace) }",
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

    // --- write_file ---
    registry.write_file = {
      description:
        "Write content to a file. Args: { path: string, content: string }",
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
          `Tester tool write_file: ${path}`,
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

    // --- run_tests ---
    registry.run_tests = {
      description:
        'Run a test command. Args: { command: string (e.g. "npm test", "npx vitest run", "node --test test/") }',
      execute: async (args) => {
        const { command } = args || {};
        if (!command || typeof command !== "string") {
          throw new Error("command is required");
        }

        const parsed = this._parseCommand(command);
        if (!SAFE_TEST_COMMANDS.has(parsed.cmd)) {
          throw new Error(
            `Command not allowed: ${parsed.cmd}. Allowed: ${[...SAFE_TEST_COMMANDS].join(", ")}`,
          );
        }

        const perm = await this.requestPermission(
          node.id,
          PERMISSION_TYPE.COMMAND_RUN,
          `Tester tool run_tests: ${command}`,
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
          // Test runners exit non-zero on failure — capture output anyway
          stdout = err.stdout || "";
          stderr = err.stderr || "";
          exitCode = err.code || 1;
        }

        const rawOutput = `${stdout}${stderr ? `\nSTDERR:\n${stderr}` : ""}`;
        const parsed_ = this._parseTestOutput(rawOutput);
        const summary = [
          `Exit code: ${exitCode}`,
          `Passed: ${parsed_.passed}`,
          `Failed: ${parsed_.failed}`,
          `Skipped: ${parsed_.skipped}`,
          parsed_.coverage ? `Coverage: ${parsed_.coverage}` : null,
          `\n--- Output (truncated) ---\n${rawOutput.slice(0, 8000)}`,
        ]
          .filter(Boolean)
          .join("\n");

        return summary;
      },
    };

    return registry;
  }

  /**
   * Parse raw test output to extract pass/fail counts.
   * Handles common formats: TAP, Jest, Vitest, node:test.
   * @private
   */
  _parseTestOutput(output) {
    const result = { passed: 0, failed: 0, skipped: 0, coverage: null };
    if (!output) return result;

    // Jest / Vitest format: "Tests: 3 passed, 1 failed, 4 total"
    const jestMatch = output.match(
      /Tests:\s*(?:(\d+)\s*passed)?[,\s]*(?:(\d+)\s*failed)?[,\s]*(?:(\d+)\s*skipped)?/i,
    );
    if (jestMatch) {
      result.passed = parseInt(jestMatch[1] || "0", 10);
      result.failed = parseInt(jestMatch[2] || "0", 10);
      result.skipped = parseInt(jestMatch[3] || "0", 10);
    }

    // TAP format: "# pass 5" / "# fail 2"
    const tapPass = output.match(/# pass\s+(\d+)/i);
    const tapFail = output.match(/# fail\s+(\d+)/i);
    const tapSkip = output.match(/# skip\s+(\d+)/i);
    if (tapPass)
      result.passed = Math.max(result.passed, parseInt(tapPass[1], 10));
    if (tapFail)
      result.failed = Math.max(result.failed, parseInt(tapFail[1], 10));
    if (tapSkip)
      result.skipped = Math.max(result.skipped, parseInt(tapSkip[1], 10));

    // node:test format: "# tests 10" / "# pass 8" / "# fail 2"
    const nodePass = output.match(/✓|ok \d+/g);
    const nodeFail = output.match(/✗|not ok \d+/g);
    if (nodePass && result.passed === 0) result.passed = nodePass.length;
    if (nodeFail && result.failed === 0) result.failed = nodeFail.length;

    // Generic "X passing" / "Y failing"
    const genericPass = output.match(/(\d+)\s+passing/i);
    const genericFail = output.match(/(\d+)\s+failing/i);
    if (genericPass)
      result.passed = Math.max(result.passed, parseInt(genericPass[1], 10));
    if (genericFail)
      result.failed = Math.max(result.failed, parseInt(genericFail[1], 10));

    // Coverage: "Stmts : 85.5%" or "All files | 85.5"
    const coverageMatch = output.match(
      /(?:Stmts|Statements|All files)\s*[:|]\s*([\d.]+)%?/i,
    );
    if (coverageMatch) {
      result.coverage = `${coverageMatch[1]}%`;
    }

    return result;
  }

  /**
   * Extract structured test results from tool log entries.
   * @private
   */
  _extractTestResults(toolLog) {
    if (!Array.isArray(toolLog)) return null;

    for (let i = toolLog.length - 1; i >= 0; i--) {
      const entry = toolLog[i];
      if (entry.tool === "run_tests" && entry.result && !entry.error) {
        const parsed = this._parseTestOutput(entry.result);
        return {
          passed: parsed.passed,
          failed: parsed.failed,
          skipped: parsed.skipped,
          coverage: parsed.coverage,
          details: String(entry.result).slice(0, 2000),
        };
      }
    }
    return null;
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

module.exports = { TesterAgent };
