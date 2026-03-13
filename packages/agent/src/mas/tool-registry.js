/**
 * CodIn MAS — Central Tool Registry
 *
 * Single source of truth for all agent tools (read_file, write_file, run_bash, run_tests).
 * Agents call `buildToolRegistry(agent, context, node, opts)` to get their tool map.
 * No more copy-pasting tool implementations across 7+ agent files.
 */
"use strict";

const pathModule = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { PERMISSION_TYPE, PERMISSION_DECISION } = require("./types");
const {
  ToolValidationError,
  PermissionDeniedError,
  PathTraversalError,
  CommandNotAllowedError,
  SecretDetectedError,
} = require("./errors");
const { createLogger } = require("./logger");

const execFileAsync = promisify(execFile);
const log = createLogger("ToolRegistry");

// ═══════════════════════════════════════════════════════════════
// Command allowlists — per capability profile
// ═══════════════════════════════════════════════════════════════

const COMMANDS = Object.freeze({
  /** Standard dev commands: npm/node/python/go/cargo/git */
  DEV: new Set([
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
  ]),
  /** Test runners only */
  TEST: new Set([
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
  ]),
  /** DevOps / infrastructure */
  DEVOPS: new Set([
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
  ]),
  /** Security audit tools */
  AUDIT: new Set([
    "npm",
    "npm.cmd",
    "npx",
    "npx.cmd",
    "pnpm",
    "pnpm.cmd",
    "yarn",
    "yarn.cmd",
  ]),
});

/** Dangerous subcommands that require elevated permission */
const DANGEROUS_SUBCOMMANDS = new Set(["rm", "rmi", "prune", "system", "push"]);

/** Patterns that indicate secrets in content */
const SECRET_PATTERNS = [
  /password\s*[:=]\s*[^\s{$]/i,
  /secret_?key\s*[:=]\s*[^\s{$]/i,
  /api_?key\s*[:=]\s*[^\s{$]/i,
  /private_?key\s*[:=]\s*[^\s{$]/i,
  /AWS_SECRET/i,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
];

// ═══════════════════════════════════════════════════════════════
// Shared Utilities (formerly duplicated across all agents)
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve workspace root from context.
 * @param {object} context
 * @returns {string} Absolute path
 */
function resolveWorkspaceRoot(context) {
  const candidate =
    context?.workspaceRoot || context?.workspacePath || process.cwd();
  return pathModule.resolve(candidate);
}

/**
 * Resolve a relative path safely within workspace bounds.
 * Throws PathTraversalError if the path escapes the workspace.
 * @param {string} workspaceRoot
 * @param {string} relativePath
 * @returns {string} Absolute resolved path
 */
function resolveSafePath(workspaceRoot, relativePath) {
  const resolved = pathModule.resolve(workspaceRoot, relativePath);
  const rootWithSep = workspaceRoot.endsWith(pathModule.sep)
    ? workspaceRoot
    : workspaceRoot + pathModule.sep;
  if (resolved !== workspaceRoot && !resolved.startsWith(rootWithSep)) {
    throw new PathTraversalError(relativePath, workspaceRoot);
  }
  return resolved;
}

/**
 * Parse a command string into cmd + args without invoking a shell.
 * Supports simple quoting.
 * @param {string} command
 * @returns {{ cmd: string, args: string[] }}
 */
function parseCommand(command) {
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
  if (tokens.length === 0) {
    throw new ToolValidationError("run_bash", "Command is empty");
  }
  return { cmd: tokens[0], args: tokens.slice(1) };
}

// ═══════════════════════════════════════════════════════════════
// Tool Factories — each returns a { description, execute } object
// ═══════════════════════════════════════════════════════════════

/**
 * Create the read_file tool.
 * @param {string} workspaceRoot
 * @param {object} [opts]
 * @param {number} [opts.maxChars=120000]
 * @returns {object}
 */
function createReadFileTool(workspaceRoot, opts = {}) {
  const maxChars = opts.maxChars || 120000;
  return {
    description: "Read the contents of a file. Args: { path: string }",
    execute: async (args) => {
      const { path } = args || {};
      if (!path || typeof path !== "string") {
        throw new ToolValidationError("read_file", "path is required");
      }
      const targetPath = resolveSafePath(workspaceRoot, path);
      const content = await fs.readFile(targetPath, "utf8");
      return content.slice(0, maxChars);
    },
  };
}

/**
 * Create the write_file tool.
 * @param {object} agent — Agent instance (for requestPermission)
 * @param {string} nodeId — Current task node ID
 * @param {string} workspaceRoot
 * @param {object} [opts]
 * @param {string} [opts.agentLabel] — Label for permission messages (e.g. "Coder")
 * @param {boolean} [opts.checkSecrets=false] — Reject writes containing secrets
 * @param {Set<string>} [opts.allowedExtensions] — Restrict to specific file extensions
 * @returns {object}
 */
function createWriteFileTool(agent, nodeId, workspaceRoot, opts = {}) {
  const agentLabel = opts.agentLabel || agent.type;
  return {
    description:
      "Write content to a file (requests permission). Args: { path: string, content: string }",
    execute: async (args) => {
      const { path, content } = args || {};
      if (!path || typeof path !== "string") {
        throw new ToolValidationError("write_file", "path is required");
      }
      if (typeof content !== "string") {
        throw new ToolValidationError("write_file", "content must be a string");
      }

      // Optional: reject secrets
      if (opts.checkSecrets) {
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(content)) {
            throw new SecretDetectedError(path, pattern.source);
          }
        }
      }

      // Optional: restrict file extensions
      if (opts.allowedExtensions) {
        const ext = pathModule.extname(path).toLowerCase();
        const basename = pathModule.basename(path).toLowerCase();
        const isAllowed =
          opts.allowedExtensions.has(ext) ||
          basename === "dockerfile" ||
          basename === "makefile" ||
          basename === "jenkinsfile" ||
          basename === "procfile" ||
          basename.startsWith(".");
        if (!isAllowed && ext !== ".js" && ext !== ".ts" && ext !== ".md") {
          throw new ToolValidationError(
            "write_file",
            `${agentLabel} agent should only write allowed file types. Got: ${path}`,
          );
        }
      }

      const perm = await agent.requestPermission(
        nodeId,
        PERMISSION_TYPE.FILE_WRITE,
        `${agentLabel} tool write_file: ${path}`,
      );
      if (perm.decision !== PERMISSION_DECISION.APPROVED) {
        throw new PermissionDeniedError(`write_file: ${path}`, perm.reason);
      }

      const targetPath = resolveSafePath(workspaceRoot, path);
      await fs.mkdir(pathModule.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content, "utf8");
      log.debug("File written", {
        path,
        chars: content.length,
        agent: agentLabel,
      });
      return `Wrote ${path} (${content.length} chars)`;
    },
  };
}

/**
 * Create the run_bash tool.
 * @param {object} agent — Agent instance
 * @param {string} nodeId
 * @param {string} workspaceRoot
 * @param {object} [opts]
 * @param {Set<string>} [opts.allowedCommands] — Command allowlist (default: COMMANDS.DEV)
 * @param {string} [opts.agentLabel]
 * @param {number} [opts.timeout=60000]
 * @param {number} [opts.maxBuffer=524288]
 * @param {boolean} [opts.checkDangerousSubcommands=false]
 * @returns {object}
 */
function createRunBashTool(agent, nodeId, workspaceRoot, opts = {}) {
  const allowedCommands = opts.allowedCommands || COMMANDS.DEV;
  const agentLabel = opts.agentLabel || agent.type;
  const timeout = opts.timeout || 60000;
  const maxBuffer = opts.maxBuffer || 512 * 1024;

  return {
    description:
      "Run a shell command (requests permission). Args: { command: string }",
    execute: async (args) => {
      const { command } = args || {};
      if (!command || typeof command !== "string") {
        throw new ToolValidationError("run_bash", "command is required");
      }

      const parsed = parseCommand(command);
      if (!allowedCommands.has(parsed.cmd)) {
        throw new CommandNotAllowedError(parsed.cmd, [...allowedCommands]);
      }

      // Check for dangerous subcommands if enabled
      if (
        opts.checkDangerousSubcommands &&
        DANGEROUS_SUBCOMMANDS.has(parsed.args[0])
      ) {
        const perm = await agent.requestPermission(
          nodeId,
          PERMISSION_TYPE.COMMAND_RUN,
          `${agentLabel} tool run_bash (destructive): ${command}`,
        );
        if (perm.decision !== PERMISSION_DECISION.APPROVED) {
          throw new PermissionDeniedError(
            `destructive command: ${command}`,
            perm.reason,
          );
        }
      } else {
        const perm = await agent.requestPermission(
          nodeId,
          PERMISSION_TYPE.COMMAND_RUN,
          `${agentLabel} tool run_bash: ${command}`,
        );
        if (perm.decision !== PERMISSION_DECISION.APPROVED) {
          throw new PermissionDeniedError(`run_bash: ${command}`, perm.reason);
        }
      }

      let stdout = "";
      let stderr = "";
      let exitCode = 0;
      try {
        const result = await execFileAsync(parsed.cmd, parsed.args, {
          cwd: workspaceRoot,
          timeout,
          maxBuffer,
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
      const trimmed = output.trim().slice(0, 120000);
      if (exitCode !== 0) {
        return `Exit code: ${exitCode}\n${trimmed}`;
      }
      return trimmed;
    },
  };
}

/**
 * Create the run_tests tool (used by TesterAgent and RefactorerAgent).
 * Only allows test runner commands.
 * @param {object} agent
 * @param {string} nodeId
 * @param {string} workspaceRoot
 * @param {object} [opts]
 * @param {string} [opts.agentLabel]
 * @returns {object}
 */
function createRunTestsTool(agent, nodeId, workspaceRoot, opts = {}) {
  const agentLabel = opts.agentLabel || agent.type;
  return {
    description:
      "Run a test command (npm test, npx jest, etc.). Args: { command: string }",
    execute: async (args) => {
      const { command } = args || {};
      if (!command || typeof command !== "string") {
        throw new ToolValidationError("run_tests", "command is required");
      }

      const parsed = parseCommand(command);
      if (!COMMANDS.TEST.has(parsed.cmd)) {
        throw new CommandNotAllowedError(parsed.cmd, [...COMMANDS.TEST]);
      }

      const perm = await agent.requestPermission(
        nodeId,
        PERMISSION_TYPE.COMMAND_RUN,
        `${agentLabel} tool run_tests: ${command}`,
      );
      if (perm.decision !== PERMISSION_DECISION.APPROVED) {
        throw new PermissionDeniedError(`run_tests: ${command}`, perm.reason);
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
      return `Exit code: ${exitCode}\n${output.trim().slice(0, 120000)}`;
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Build a tool registry for an agent's execute() method.
 * Agents specify which tools they need via `opts.tools`.
 *
 * @param {object} agent — Agent instance
 * @param {object} context — Execution context (contains workspaceRoot)
 * @param {object} node — TaskNode
 * @param {object} [opts]
 * @param {string[]} [opts.tools] — Tool names to include: "read_file", "write_file", "run_bash", "run_tests"
 * @param {string} [opts.agentLabel] — Human label for permission messages
 * @param {string} [opts.commandProfile] — Key into COMMANDS: "DEV", "TEST", "DEVOPS", "AUDIT"
 * @param {boolean} [opts.checkSecrets] — Enable secret detection on writes
 * @param {boolean} [opts.checkDangerousSubcommands] — Enable dangerous subcommand check
 * @param {Set<string>} [opts.allowedExtensions] — Restrict write_file to specific extensions
 * @returns {object} Tool registry map { toolName: { description, execute } }
 */
function buildToolRegistry(agent, context, node, opts = {}) {
  const workspaceRoot = resolveWorkspaceRoot(context);
  const nodeId = node.id;
  const agentLabel = opts.agentLabel || agent.type;
  const tools = opts.tools || ["read_file", "write_file", "run_bash"];
  const commandProfile = opts.commandProfile || "DEV";

  const registry = {};

  for (const tool of tools) {
    switch (tool) {
      case "read_file":
        registry.read_file = createReadFileTool(workspaceRoot);
        break;

      case "write_file":
        registry.write_file = createWriteFileTool(
          agent,
          nodeId,
          workspaceRoot,
          {
            agentLabel,
            checkSecrets: opts.checkSecrets || false,
            allowedExtensions: opts.allowedExtensions,
          },
        );
        break;

      case "run_bash":
        registry.run_bash = createRunBashTool(agent, nodeId, workspaceRoot, {
          allowedCommands: COMMANDS[commandProfile] || COMMANDS.DEV,
          agentLabel,
          checkDangerousSubcommands: opts.checkDangerousSubcommands || false,
        });
        break;

      case "run_tests":
        registry.run_tests = createRunTestsTool(agent, nodeId, workspaceRoot, {
          agentLabel,
        });
        break;

      default:
        log.warn("Unknown tool requested", { tool, agent: agentLabel });
    }
  }

  return registry;
}

module.exports = {
  buildToolRegistry,
  // Export individual factories for agents that need custom tools alongside standard ones
  createReadFileTool,
  createWriteFileTool,
  createRunBashTool,
  createRunTestsTool,
  // Export utilities for agents that need them directly
  resolveWorkspaceRoot,
  resolveSafePath,
  parseCommand,
  // Export command sets for reference
  COMMANDS,
  SECRET_PATTERNS,
  DANGEROUS_SUBCOMMANDS,
};
