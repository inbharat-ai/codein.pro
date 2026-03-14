/**
 * CodIn MAS — Docker Sandbox
 *
 * Provides isolated Docker containers for safe code execution.
 * Supports multiple language runtimes with resource limits.
 * Falls back gracefully when Docker is unavailable.
 */
"use strict";

const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const execFileAsync = promisify(execFile);

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

/** Default resource limits per container */
const DEFAULT_LIMITS = Object.freeze({
  cpus: "0.5", // Half a CPU core
  memoryMb: 256, // 256 MB RAM
  diskMb: 100, // 100 MB writable layer
  networkDisabled: true, // No network access by default
  pidsLimit: 64, // Max 64 processes
  timeoutMs: 30000, // 30 second execution timeout
});

/** Supported language runtimes and their Docker images */
const RUNTIME_IMAGES = Object.freeze({
  node: {
    image: "node:20-alpine",
    cmd: (file) => ["node", file],
    ext: ".js",
    label: "Node.js 20",
  },
  python: {
    image: "python:3.12-alpine",
    cmd: (file) => ["python3", file],
    ext: ".py",
    label: "Python 3.12",
  },
  go: {
    image: "golang:1.22-alpine",
    cmd: (file) => ["go", "run", file],
    ext: ".go",
    label: "Go 1.22",
  },
});

/** Container name prefix for easy identification and cleanup */
const CONTAINER_PREFIX = "codin-sandbox-";

// ═══════════════════════════════════════════════════════════════
// DockerSandbox
// ═══════════════════════════════════════════════════════════════

class DockerSandbox {
  /**
   * @param {object} [opts]
   * @param {object} [opts.limits] — Override default resource limits
   * @param {number} [opts.maxContainers=5] — Max concurrent containers
   * @param {number} [opts.cleanupIntervalMs=60000] — Stale container cleanup interval
   */
  constructor(opts = {}) {
    this._limits = { ...DEFAULT_LIMITS, ...opts.limits };
    this._maxContainers = opts.maxContainers || 5;
    this._cleanupIntervalMs = opts.cleanupIntervalMs || 60000;

    /** @type {Map<string, { containerId: string, runtime: string, createdAt: number, timeoutHandle: NodeJS.Timeout|null }>} */
    this._activeContainers = new Map();

    this._dockerAvailable = null; // Lazy-checked
    this._cleanupTimer = null;
  }

  // ─── Lifecycle ───────────────────────────────────────────

  /**
   * Initialize the sandbox system.
   * Checks Docker availability and starts cleanup timer.
   */
  async initialize() {
    this._dockerAvailable = await this._checkDocker();

    if (this._dockerAvailable) {
      // Pull runtime images in background (non-blocking)
      this._pullImagesInBackground();

      // Start periodic cleanup of stale containers
      this._cleanupTimer = setInterval(
        () => this._cleanupStaleContainers(),
        this._cleanupIntervalMs,
      );
      // Prevent timer from keeping Node.js alive
      if (this._cleanupTimer.unref) {
        this._cleanupTimer.unref();
      }
    }

    return { available: this._dockerAvailable };
  }

  /**
   * Shut down the sandbox system.
   * Stops all running containers and clears the cleanup timer.
   */
  async shutdown() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    // Stop all active containers
    const stopPromises = [];
    for (const [sandboxId] of this._activeContainers) {
      stopPromises.push(
        this.destroy(sandboxId).catch(() => {
          /* best-effort cleanup */
        }),
      );
    }
    await Promise.allSettled(stopPromises);
  }

  // ─── Execution ───────────────────────────────────────────

  /**
   * Execute code in an isolated Docker container.
   *
   * @param {object} params
   * @param {string} params.code — Source code to execute
   * @param {string} params.runtime — Runtime key: "node", "python", or "go"
   * @param {object} [params.limits] — Override default limits for this execution
   * @param {object} [params.env] — Environment variables (key-value pairs)
   * @param {string} [params.stdin] — Standard input to pipe to the process
   * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, durationMs: number, sandboxId: string }>}
   */
  async execute(params) {
    const { code, runtime, limits = {}, env = {}, stdin = null } = params;

    // Validate runtime
    const runtimeConfig = RUNTIME_IMAGES[runtime];
    if (!runtimeConfig) {
      throw new Error(
        `Unsupported runtime: "${runtime}". Supported: ${Object.keys(RUNTIME_IMAGES).join(", ")}`,
      );
    }

    // Validate code
    if (!code || typeof code !== "string" || code.trim().length === 0) {
      throw new Error("Code is required and must be a non-empty string");
    }

    // Check if Docker is available
    if (this._dockerAvailable === null) {
      await this.initialize();
    }

    if (!this._dockerAvailable) {
      return this._fallbackExecution(code, runtime, runtimeConfig);
    }

    // Enforce container limit
    if (this._activeContainers.size >= this._maxContainers) {
      throw new Error(
        `Container limit reached (${this._maxContainers}). Wait for existing executions to complete.`,
      );
    }

    const mergedLimits = { ...this._limits, ...limits };
    const sandboxId = this._generateSandboxId();
    const startTime = Date.now();

    try {
      // Write code to a temp file
      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), `codin-sandbox-${sandboxId}-`),
      );
      const codeFile = `main${runtimeConfig.ext}`;
      const codePath = path.join(tempDir, codeFile);
      await fs.writeFile(codePath, code, "utf8");

      // Build docker run command
      const containerName = `${CONTAINER_PREFIX}${sandboxId}`;
      const dockerArgs = this._buildDockerArgs({
        containerName,
        runtimeConfig,
        codePath,
        codeFile,
        mergedLimits,
        env,
        tempDir,
      });

      // Track the container
      this._activeContainers.set(sandboxId, {
        containerId: containerName,
        runtime,
        createdAt: Date.now(),
        timeoutHandle: null,
      });

      // Execute with timeout
      const result = await this._runContainer(
        dockerArgs,
        containerName,
        sandboxId,
        mergedLimits.timeoutMs,
        stdin,
      );

      // Cleanup temp files
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      return {
        ...result,
        durationMs: Date.now() - startTime,
        sandboxId,
      };
    } catch (err) {
      // Ensure container is cleaned up on error
      await this.destroy(sandboxId).catch(() => {});
      throw err;
    }
  }

  /**
   * Destroy a sandbox container by ID.
   * @param {string} sandboxId
   */
  async destroy(sandboxId) {
    const entry = this._activeContainers.get(sandboxId);
    if (!entry) return;

    if (entry.timeoutHandle) {
      clearTimeout(entry.timeoutHandle);
    }

    this._activeContainers.delete(sandboxId);

    try {
      await execFileAsync("docker", ["rm", "-f", entry.containerId], {
        timeout: 10000,
      });
    } catch {
      // Container may already be gone
    }
  }

  /**
   * List all active sandbox containers.
   * @returns {{ sandboxId: string, runtime: string, createdAt: number, ageMs: number }[]}
   */
  listActive() {
    const now = Date.now();
    const result = [];
    for (const [sandboxId, entry] of this._activeContainers) {
      result.push({
        sandboxId,
        runtime: entry.runtime,
        createdAt: entry.createdAt,
        ageMs: now - entry.createdAt,
      });
    }
    return result;
  }

  /**
   * Check if Docker is available on this system.
   * @returns {boolean}
   */
  isAvailable() {
    return this._dockerAvailable === true;
  }

  // ─── Private Methods ─────────────────────────────────────

  /**
   * Check if Docker is installed and the daemon is running.
   * @returns {Promise<boolean>}
   * @private
   */
  async _checkDocker() {
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["info", "--format", "{{.ServerVersion}}"],
        {
          timeout: 5000,
        },
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Pull runtime images in the background (non-blocking).
   * @private
   */
  _pullImagesInBackground() {
    for (const [, config] of Object.entries(RUNTIME_IMAGES)) {
      execFileAsync("docker", ["pull", config.image], {
        timeout: 120000,
      }).catch(() => {
        /* Image may already exist locally, or pull may fail — non-fatal */
      });
    }
  }

  /**
   * Build the docker run argument array.
   * @private
   */
  _buildDockerArgs({
    containerName,
    runtimeConfig,
    codePath,
    codeFile,
    mergedLimits,
    env,
    tempDir,
  }) {
    const args = [
      "run",
      "--name",
      containerName,
      "--rm",

      // Resource limits
      "--cpus",
      mergedLimits.cpus,
      "--memory",
      `${mergedLimits.memoryMb}m`,
      "--pids-limit",
      String(mergedLimits.pidsLimit),

      // Security: read-only root filesystem, drop all capabilities
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",

      // Temp writable directory for the runtime
      "--tmpfs",
      `/tmp:rw,noexec,nosuid,size=${mergedLimits.diskMb}m`,

      // Mount the code file read-only
      "-v",
      `${codePath}:/workspace/${codeFile}:ro`,
      "-w",
      "/workspace",
    ];

    // Network isolation
    if (mergedLimits.networkDisabled) {
      args.push("--network", "none");
    }

    // Environment variables
    for (const [key, value] of Object.entries(env)) {
      // Sanitize env var names
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    // Image and command
    args.push(runtimeConfig.image);
    args.push(...runtimeConfig.cmd(`/workspace/${codeFile}`));

    return args;
  }

  /**
   * Run a Docker container and capture its output.
   * @private
   */
  async _runContainer(dockerArgs, containerName, sandboxId, timeoutMs, stdin) {
    return new Promise((resolve, reject) => {
      const proc = spawn("docker", dockerArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: timeoutMs + 5000, // Grace period beyond the execution timeout
      });

      let stdout = "";
      let stderr = "";
      let resolved = false;

      // Enforce execution timeout
      const timeoutHandle = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Kill the container
          execFileAsync("docker", ["kill", containerName], {
            timeout: 5000,
          }).catch(() => {});
          proc.kill("SIGKILL");
          resolve({
            stdout: stdout.slice(0, 100000),
            stderr: `Execution timed out after ${timeoutMs}ms\n${stderr}`.slice(
              0,
              100000,
            ),
            exitCode: 124, // Standard timeout exit code
          });
        }
      }, timeoutMs);

      // Store timeout handle for cleanup
      const entry = this._activeContainers.get(sandboxId);
      if (entry) {
        entry.timeoutHandle = timeoutHandle;
      }

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        // Cap output size at 100KB to prevent memory issues
        if (stdout.length > 100000) {
          stdout = stdout.slice(0, 100000) + "\n[output truncated at 100KB]";
          proc.kill("SIGTERM");
        }
      });

      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 100000) {
          stderr = stderr.slice(0, 100000) + "\n[stderr truncated at 100KB]";
        }
      });

      proc.on("close", (exitCode) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutHandle);
          this._activeContainers.delete(sandboxId);
          resolve({
            stdout: stdout.slice(0, 100000),
            stderr: stderr.slice(0, 100000),
            exitCode: exitCode ?? 1,
          });
        }
      });

      proc.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutHandle);
          this._activeContainers.delete(sandboxId);
          reject(new Error(`Docker execution failed: ${err.message}`));
        }
      });

      // Pipe stdin if provided
      if (stdin) {
        proc.stdin.write(stdin);
      }
      proc.stdin.end();
    });
  }

  /**
   * Fallback execution when Docker is not available.
   * Returns a descriptive error instead of executing code unsafely.
   * @private
   */
  _fallbackExecution(code, runtime, runtimeConfig) {
    return {
      stdout: "",
      stderr: [
        `Docker is not available on this system.`,
        `Cannot safely execute ${runtimeConfig.label} code without container isolation.`,
        ``,
        `To enable code execution:`,
        `  1. Install Docker: https://docs.docker.com/get-docker/`,
        `  2. Start the Docker daemon`,
        `  3. Ensure the current user can run docker commands`,
        ``,
        `Code that would have been executed (${runtime}):`,
        `${"─".repeat(40)}`,
        code.slice(0, 2000),
        code.length > 2000 ? `\n[truncated: ${code.length} chars total]` : "",
      ].join("\n"),
      exitCode: 127,
      durationMs: 0,
      sandboxId: `fallback-${this._generateSandboxId()}`,
    };
  }

  /**
   * Clean up containers that have exceeded their timeout.
   * @private
   */
  async _cleanupStaleContainers() {
    const now = Date.now();
    const maxAge = this._limits.timeoutMs * 3; // 3x the timeout as safety margin

    for (const [sandboxId, entry] of this._activeContainers) {
      if (now - entry.createdAt > maxAge) {
        await this.destroy(sandboxId).catch(() => {});
      }
    }

    // Also clean up any orphaned CodIn containers
    try {
      const { stdout } = await execFileAsync(
        "docker",
        [
          "ps",
          "-a",
          "--filter",
          `name=${CONTAINER_PREFIX}`,
          "--format",
          "{{.Names}}",
        ],
        { timeout: 5000 },
      );
      const orphans = stdout
        .trim()
        .split("\n")
        .filter((name) => name && !this._isTracked(name));

      for (const name of orphans) {
        await execFileAsync("docker", ["rm", "-f", name], {
          timeout: 5000,
        }).catch(() => {});
      }
    } catch {
      // Docker may not be available — ignore
    }
  }

  /**
   * Check if a container name is tracked in the active map.
   * @private
   */
  _isTracked(containerName) {
    for (const [, entry] of this._activeContainers) {
      if (entry.containerId === containerName) return true;
    }
    return false;
  }

  /**
   * Generate a unique sandbox ID.
   * @private
   */
  _generateSandboxId() {
    return crypto.randomBytes(6).toString("hex");
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  DockerSandbox,
  RUNTIME_IMAGES,
  DEFAULT_LIMITS,
  CONTAINER_PREFIX,
};
