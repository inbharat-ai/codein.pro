/**
 * CodIn MAS — DevOps Agent
 *
 * Handles CI/CD, Docker, deployment configs, infrastructure-as-code.
 * Validates config files and runs linting checks.
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
  buildToolRegistry,
  resolveWorkspaceRoot,
  resolveSafePath,
  SECRET_PATTERNS,
} = require("../tool-registry");

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

    const workspaceRoot = resolveWorkspaceRoot(context);
    const prompt = `Complete this DevOps task:

TASK: ${node.goal}

CURRENT INFRASTRUCTURE:
${context.infrastructure || "Not provided — use read_file to examine the workspace"}

CI/CD CONFIG:
${context.ciConfig || "Not provided — use read_file to look for config files"}

WORKSPACE ROOT: ${workspaceRoot}

Use the tools to read configs, validate them, write improvements, and run commands as needed.`;

    // Build standard tools from central registry
    const toolRegistry = buildToolRegistry(this, context, node, {
      tools: ["read_file", "write_file", "run_bash"],
      agentLabel: "DevOps",
      commandProfile: "DEVOPS",
      checkSecrets: true,
      checkDangerousSubcommands: true,
      allowedExtensions: SAFE_CONFIG_EXTENSIONS,
    });

    // Add DevOps-specific validate_config tool
    this._validationResults = [];
    toolRegistry.validate_config =
      this._createValidateConfigTool(workspaceRoot);

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
   * Create the validate_config tool (DevOps-specific).
   * @private
   */
  _createValidateConfigTool(workspaceRoot) {
    return {
      description:
        "Validate a YAML or JSON configuration file for syntax errors and common issues. Args: { path: string }",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string") {
          throw new Error("path is required");
        }
        const targetPath = resolveSafePath(workspaceRoot, path);
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

        // YAML validation (basic structural checks)
        if (ext === ".yml" || ext === ".yaml") {
          const lines = content.split("\n");
          // Check for tabs
          const tabLines = [];
          for (let i = 0; i < lines.length; i++) {
            if (/^\t/.test(lines[i])) tabLines.push(i + 1);
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

          // Check for duplicate keys (top-level only)
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
  }
}

module.exports = { DevOpsAgent };
