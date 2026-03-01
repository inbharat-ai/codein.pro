/**
 * CodeIn Compute — Sandbox
 *
 * Isolated execution environment for compute jobs.
 * Each job gets its own workspace folder with strict access controls.
 * All tool calls and file operations are gated through PolicyEnforcer.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { PolicyEnforcer } = require("./policy");

class ComputeSandbox {
  /**
   * @param {object} options
   * @param {string} options.workspaceDir - Job workspace directory
   * @param {object} options.policy - Job permission policy
   * @param {object} [options.validator] - Existing Validator instance
   */
  constructor({ workspaceDir, policy, validator = null }) {
    if (!workspaceDir) throw new Error("workspaceDir is required");
    if (!policy) throw new Error("policy is required");

    this.workspaceDir = path.resolve(workspaceDir);
    this.policy = policy;
    this.policyEnforcer = new PolicyEnforcer();
    this.validator = validator;
    this._operations = [];
    this._active = true;

    // Ensure workspace exists
    fs.mkdirSync(this.workspaceDir, { recursive: true });
    fs.mkdirSync(path.join(this.workspaceDir, "artifacts"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(this.workspaceDir, "tmp"), { recursive: true });
  }

  /**
   * Read a file within the sandbox workspace.
   * @param {string} relativePath - Path relative to workspace
   * @returns {string} File content
   */
  readFile(relativePath) {
    this._checkActive();
    const fullPath = this._resolveSafe(relativePath);

    const check = this.policyEnforcer.checkFileAccess(
      fullPath,
      this.workspaceDir,
      this.policy,
      "read",
    );
    if (!check.allowed) throw new Error(`Permission denied: ${check.reason}`);

    this._logOperation("readFile", relativePath);
    return fs.readFileSync(fullPath, "utf8");
  }

  /**
   * Write a file within the sandbox workspace.
   * @param {string} relativePath - Path relative to workspace
   * @param {string} content - File content
   */
  writeFile(relativePath, content) {
    this._checkActive();
    const fullPath = this._resolveSafe(relativePath);

    const check = this.policyEnforcer.checkFileAccess(
      fullPath,
      this.workspaceDir,
      this.policy,
      "write",
    );
    if (!check.allowed) throw new Error(`Permission denied: ${check.reason}`);

    // Ensure parent directory exists (within workspace only)
    const dir = path.dirname(fullPath);
    const dirCheck = this.policyEnforcer.checkFileAccess(
      dir,
      this.workspaceDir,
      this.policy,
      "write",
    );
    if (!dirCheck.allowed)
      throw new Error(`Permission denied for directory: ${dirCheck.reason}`);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
    this._logOperation("writeFile", relativePath, { size: content.length });
  }

  /**
   * List files in a directory within the sandbox.
   * @param {string} [relativePath="."] - Path relative to workspace
   * @returns {string[]} File and directory names
   */
  listDir(relativePath = ".") {
    this._checkActive();
    const fullPath = this._resolveSafe(relativePath);

    const check = this.policyEnforcer.checkFileAccess(
      fullPath,
      this.workspaceDir,
      this.policy,
      "read",
    );
    if (!check.allowed) throw new Error(`Permission denied: ${check.reason}`);

    this._logOperation("listDir", relativePath);
    return fs.readdirSync(fullPath);
  }

  /**
   * Check if a file exists in the sandbox.
   * @param {string} relativePath
   * @returns {boolean}
   */
  exists(relativePath) {
    try {
      const fullPath = this._resolveSafe(relativePath);
      const check = this.policyEnforcer.checkFileAccess(
        fullPath,
        this.workspaceDir,
        this.policy,
        "read",
      );
      if (!check.allowed) return false;
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  /**
   * Delete a file in the sandbox.
   */
  deleteFile(relativePath) {
    this._checkActive();
    const fullPath = this._resolveSafe(relativePath);

    const check = this.policyEnforcer.checkFileAccess(
      fullPath,
      this.workspaceDir,
      this.policy,
      "write",
    );
    if (!check.allowed) throw new Error(`Permission denied: ${check.reason}`);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    this._logOperation("deleteFile", relativePath);
  }

  /**
   * Execute a tool call with permission gating.
   * @param {string} toolName - Tool to call
   * @param {object} toolInput - Tool input parameters
   * @param {Function} toolExecutor - Function that actually runs the tool
   * @returns {Promise<object>} Tool output
   */
  async executeTool(toolName, toolInput, toolExecutor) {
    this._checkActive();

    // Check tool permission
    const toolCheck = this.policyEnforcer.checkToolPermission(
      this.policy,
      toolName,
    );
    if (!toolCheck.allowed) {
      throw new Error(
        `Permission denied for tool '${toolName}': ${toolCheck.reason}`,
      );
    }

    // For file tools: ensure paths are within workspace
    if (toolInput.path || toolInput.filePath || toolInput.filepath) {
      const filePath =
        toolInput.path || toolInput.filePath || toolInput.filepath;
      const operation = [
        "createNewFile",
        "editFile",
        "write-file",
        "singleFindAndReplace",
        "multiEdit",
      ].includes(toolName)
        ? "write"
        : "read";

      // Resolve relative to workspace
      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.workspaceDir, filePath);
      const fileCheck = this.policyEnforcer.checkFileAccess(
        absPath,
        this.workspaceDir,
        this.policy,
        operation,
      );
      if (!fileCheck.allowed) {
        throw new Error(
          `Permission denied for file access: ${fileCheck.reason}`,
        );
      }

      // Rewrite path to be within workspace
      if (!path.isAbsolute(filePath)) {
        const key = toolInput.path
          ? "path"
          : toolInput.filePath
            ? "filePath"
            : "filepath";
        toolInput[key] = absPath;
      }
    }

    // For command tools: validate command
    if (toolName === "runTerminalCommand" || toolName === "run-command") {
      const cmd = toolInput.command || toolInput.cmd || "";
      // We don't allow arbitrary shell commands in sandbox
      throw new Error(
        "Shell commands are not allowed in compute sandbox. Use specific tools instead.",
      );
    }

    const startTime = Date.now();
    try {
      const result = await toolExecutor(toolName, toolInput);
      this._logOperation("executeTool", toolName, {
        durationMs: Date.now() - startTime,
        success: true,
      });
      return result;
    } catch (err) {
      this._logOperation("executeTool", toolName, {
        durationMs: Date.now() - startTime,
        success: false,
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Execute a safe subprocess within the sandbox.
   * Uses spawn with args array — no shell injection.
   * @param {string} command - Command to run
   * @param {string[]} args - Arguments array
   * @param {object} [options]
   * @param {number} [options.timeoutMs=30000]
   * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
   */
  async executeProcess(command, args = [], options = {}) {
    this._checkActive();
    const { timeoutMs = 30000 } = options;

    // Validate command through policy
    const cmdCheck = this.policyEnforcer.checkCommand(command, args);
    if (!cmdCheck.allowed) {
      throw new Error(`Permission denied: ${cmdCheck.reason}`);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: this.workspaceDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Restrict environment
          HOME: this.workspaceDir,
          USERPROFILE: this.workspaceDir,
          TMPDIR: path.join(this.workspaceDir, "tmp"),
          TEMP: path.join(this.workspaceDir, "tmp"),
          TMP: path.join(this.workspaceDir, "tmp"),
          // Remove sensitive env vars
          JWT_SECRET: undefined,
          AWS_SECRET_ACCESS_KEY: undefined,
          OPENAI_API_KEY: undefined,
          ANTHROPIC_API_KEY: undefined,
          GOOGLE_API_KEY: undefined,
        },
        shell: false, // CRITICAL: no shell interpretation
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        proc.kill("SIGKILL");
      }, timeoutMs);

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
        // Cap output size
        if (stdout.length > 1_000_000) {
          killed = true;
          proc.kill("SIGKILL");
        }
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        if (stderr.length > 1_000_000) {
          killed = true;
          proc.kill("SIGKILL");
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (killed && code !== 0) {
          reject(
            new Error(
              `Process killed: ${stdout.length > 1_000_000 ? "output too large" : "timeout"}`,
            ),
          );
        } else {
          resolve({ stdout, stderr, exitCode: code });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Copy a file from the user's repo into the sandbox workspace.
   * Used for reading user files safely.
   * @param {string} sourcePath - Absolute path in user's repo
   * @param {string} destRelative - Relative path in sandbox
   */
  importFile(sourcePath, destRelative) {
    this._checkActive();
    const destPath = this._resolveSafe(destRelative);

    // Source must exist
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    // Dest must be in workspace
    const check = this.policyEnforcer.checkFileAccess(
      destPath,
      this.workspaceDir,
      this.policy,
      "write",
    );
    if (!check.allowed) throw new Error(`Permission denied: ${check.reason}`);

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(sourcePath, destPath);
    this._logOperation("importFile", `${sourcePath} → ${destRelative}`);
  }

  /**
   * Seal the sandbox — no more operations allowed.
   */
  seal() {
    this._active = false;
    this._logOperation("seal", "Sandbox sealed");
  }

  /**
   * Get all operations performed in this sandbox.
   */
  getOperationLog() {
    return [...this._operations];
  }

  /**
   * Get workspace disk usage.
   */
  getDiskUsage() {
    return this._getDirSize(this.workspaceDir);
  }

  // ─── Internal ──────────────────────────────────────────────

  _checkActive() {
    if (!this._active) {
      throw new Error(
        "Sandbox has been sealed — no further operations allowed",
      );
    }
  }

  _resolveSafe(relativePath) {
    // Prevent path traversal
    if (typeof relativePath !== "string") {
      throw new Error("Path must be a string");
    }

    // Normalize and resolve
    const normalized = path.normalize(relativePath);

    // Block explicit traversal
    if (normalized.includes("..")) {
      throw new Error("Path traversal (..) is not allowed in sandbox");
    }

    const fullPath = path.resolve(this.workspaceDir, normalized);

    // Must be within workspace
    if (
      !fullPath.startsWith(this.workspaceDir + path.sep) &&
      fullPath !== this.workspaceDir
    ) {
      throw new Error(
        `Path '${relativePath}' resolves outside the sandbox workspace`,
      );
    }

    return fullPath;
  }

  _logOperation(type, target, details = {}) {
    this._operations.push({
      timestamp: new Date().toISOString(),
      type,
      target,
      ...details,
    });
  }

  _getDirSize(dirPath) {
    let size = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += this._getDirSize(fullPath);
        } else {
          size += fs.statSync(fullPath).size;
        }
      }
    } catch {
      /* ignore */
    }
    return size;
  }
}

module.exports = {
  ComputeSandbox,
};
