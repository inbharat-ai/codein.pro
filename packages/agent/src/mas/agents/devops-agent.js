/**
 * CodIn MAS — DevOps Agent
 *
 * Handles CI/CD, Docker, deployment configs, infrastructure-as-code.
 * Validates config files and runs linting checks.
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
  "docker",
  "docker.exe",
  "docker-compose",
  "docker-compose.exe",
  "kubectl",
  "kubectl.exe",
  "helm",
  "helm.exe",
  "terraform",
  "terraform.exe",
  "git",
  "git.exe",
  "pnpm",
  "pnpm.cmd",
  "yarn",
  "yarn.cmd",
]);

/** File extensions considered safe for DevOps config editing */
const SAFE_CONFIG_EXTENSIONS = new Set([
  ".yml",
  ".yaml",
  ".json",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env.example",
  ".env.template",
  ".dockerfile",
  ".dockerignore",
  ".gitignore",
  ".editorconfig",
  ".eslintrc",
  ".prettierrc",
  ".babelrc",
  ".tf",
  ".tfvars",
  ".hcl",
  ".sh",
  ".bash",
  ".zsh",
]);

/** Patterns that suggest secrets — block writing these */
const SECRET_PATTERNS = [
  /password\s*[:=]\s*[^\s{$]/i,
  /secret_?key\s*[:=]\s*[^\s{$]/i,
  /api_?key\s*[:=]\s*[^\s{$]/i,
  /private_?key\s*[:=]\s*[^\s{$]/i,
  /AWS_SECRET/i,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
];

const SYSTEM_PROMPT = `You are the CodIn DevOps Agent. You manage CI/CD, Docker, and deployment infrastructure.

RULES:
1. Never store secrets in configuration files — use environment variables
2. Pin dependency versions for reproducibility
3. Follow principle of least privilege for service accounts
4. Validate all configuration changes before applying
5. Prefer declarative over imperative configurations

You have the following tools:
- read_file(path): Read a config or infrastructure file
- write_file(path, content): Write/update a config file (blocked if secrets detected)
- run_bash(command): Run a shell command (docker, kubectl, npm, npx, etc.)
- validate_config(path): Validate YAML/JSON syntax and check for common issues

WORKFLOW:
1. Read existing infrastructure/config files
2. Validate current configs with validate_config
3. Write improved configs with write_file
4. Validate new configs with validate_config
5. Run any necessary commands (linting, building, etc.) with run_bash

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
${context.infrastructure || "Not provided — use read_file to examine the workspace"}

CI/CD CONFIG:
${context.ciConfig || "Not provided — use read_file to look for config files"}

WORKSPACE ROOT: ${this._resolveWorkspaceRoot(context)}

Use the tools to read configs, validate them, write improvements, and run commands as needed.`;

    const toolRegistry = this._getToolRegistry(context, node);

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry);
      return {
        result: result.answer,
        toolLog: result.toolLog,
        validationResults: this._validationResults || [],
        confidence: this.computeConfidence(result, context),
      };
    }

    // Fallback: no tools
    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "DevOps task complete",
      files: result.files || [],
      commands: result.commands || [],
      securityNotes: result.securityNotes,
      confidence: result.confidence || 0.75,
    };
  }

  /**
   * Build tool registry for DevOps operations.
   * @private
   */
  _getToolRegistry(context, node) {
    const registry = {};
    const workspaceRoot = this._resolveWorkspaceRoot(context);
    this._validationResults = [];

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
        return content.slice(0, 120000);
      },
    };

    // --- write_file ---
    registry.write_file = {
      description:
        "Write content to a config/infrastructure file. Rejects if secrets are detected. Args: { path: string, content: string }",
      execute: async (args) => {
        const { path, content } = args || {};
        if (!path || typeof path !== "string") {
          throw new Error("path is required");
        }
        if (typeof content !== "string") {
          throw new Error("content must be a string");
        }

        // Check for secrets in content
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(content)) {
            throw new Error(
              `Security: content appears to contain secrets (matched ${pattern.source}). Use environment variables instead.`,
            );
          }
        }

        // Warn if writing non-config files
        const ext = pathModule.extname(path).toLowerCase();
        const basename = pathModule.basename(path).toLowerCase();
        const isConfig =
          SAFE_CONFIG_EXTENSIONS.has(ext) ||
          basename === "dockerfile" ||
          basename === "makefile" ||
          basename === "jenkinsfile" ||
          basename === "procfile" ||
          basename.startsWith(".");
        if (!isConfig && ext !== ".js" && ext !== ".ts" && ext !== ".md") {
          throw new Error(
            `DevOps agent should only write config/infrastructure files. Got: ${path}`,
          );
        }

        const perm = await this.requestPermission(
          node.id,
          PERMISSION_TYPE.FILE_WRITE,
          `DevOps tool write_file: ${path}`,
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

    // --- run_bash ---
    registry.run_bash = {
      description:
        'Run a shell command (docker, kubectl, npm, npx, git, etc.). Args: { command: string (e.g. "docker build --check .", "npx yaml-lint config.yml") }',
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

        // Block dangerous subcommands
        const dangerous = ["rm", "rmi", "prune", "system", "push"];
        if (dangerous.includes(parsed.args[0])) {
          const perm = await this.requestPermission(
            node.id,
            PERMISSION_TYPE.COMMAND_RUN,
            `DevOps tool run_bash (destructive): ${command}`,
          );
          if (perm.decision !== PERMISSION_DECISION.APPROVED) {
            throw new Error(`Destructive command denied: ${perm.reason}`);
          }
        } else {
          const perm = await this.requestPermission(
            node.id,
            PERMISSION_TYPE.COMMAND_RUN,
            `DevOps tool run_bash: ${command}`,
          );
          if (perm.decision !== PERMISSION_DECISION.APPROVED) {
            throw new Error(`Command denied: ${perm.reason}`);
          }
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
        return `Exit code: ${exitCode}\n${output.trim().slice(0, 10000)}`;
      },
    };

    // --- validate_config ---
    registry.validate_config = {
      description:
        "Validate a YAML or JSON configuration file for syntax errors and common issues. Args: { path: string }",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string") {
          throw new Error("path is required");
        }
        const targetPath = this._resolveSafePath(workspaceRoot, path);
        const content = await fs.readFile(targetPath, "utf8");
        const ext = pathModule.extname(path).toLowerCase();

        const issues = [];
        let valid = true;

        // JSON validation
        if (ext === ".json") {
          try {
            JSON.parse(content);
          } catch (err) {
            valid = false;
            issues.push(`JSON syntax error: ${err.message}`);
          }
        }

        // YAML validation (basic structural checks without external deps)
        if (ext === ".yml" || ext === ".yaml") {
          // Check for tabs (YAML forbids tabs for indentation)
          const tabLines = [];
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (/^\t/.test(lines[i])) {
              tabLines.push(i + 1);
            }
          }
          if (tabLines.length > 0) {
            valid = false;
            issues.push(
              `YAML uses tabs for indentation on line(s): ${tabLines.slice(0, 5).join(", ")}${tabLines.length > 5 ? "..." : ""}`,
            );
          }

          // Check for inconsistent indentation
          const indents = new Set();
          for (const line of lines) {
            const match = line.match(/^( +)\S/);
            if (match) indents.add(match[1].length);
          }
          const indentArr = [...indents].sort((a, b) => a - b);
          if (indentArr.length > 1) {
            const step = indentArr[1] - indentArr[0];
            const inconsistent = indentArr.some(
              (v, i) =>
                i > 0 && v - indentArr[i - 1] !== step && v % step !== 0,
            );
            if (inconsistent) {
              issues.push(
                `YAML indentation may be inconsistent. Found indent levels: ${indentArr.join(", ")}`,
              );
            }
          }

          // Check for duplicate keys (simple check — top-level only)
          const topKeys = [];
          for (const line of lines) {
            const keyMatch = line.match(/^(\w[\w.-]*):\s/);
            if (keyMatch) topKeys.push(keyMatch[1]);
          }
          const dupes = topKeys.filter((k, i) => topKeys.indexOf(k) !== i);
          if (dupes.length > 0) {
            issues.push(
              `Possible duplicate keys: ${[...new Set(dupes)].join(", ")}`,
            );
          }
        }

        // Security checks (all file types)
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(content)) {
            issues.push(
              `Security warning: file may contain hardcoded secrets (matched ${pattern.source})`,
            );
            break;
          }
        }

        // Check for .env files that should not be committed
        const basename = pathModule.basename(path);
        if (basename === ".env" || basename === ".env.local") {
          issues.push(
            "Warning: .env files should not be committed. Use .env.example with placeholder values.",
          );
        }

        const result = {
          path,
          valid:
            valid &&
            issues.filter((i) => !i.startsWith("Warning")).length === 0,
          issues,
        };

        this._validationResults.push(result);

        if (issues.length === 0) {
          return `${path}: Valid (no issues found)`;
        }
        return `${path}: ${valid ? "Valid with warnings" : "INVALID"}\n${issues.map((i) => `  - ${i}`).join("\n")}`;
      },
    };

    return registry;
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

module.exports = { DevOpsAgent };
