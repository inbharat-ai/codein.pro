/**
 * Process Manager
 * Manages running dev servers and captures logs
 */

const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { getDataDir } = require("../store");

const CODIN_DIR = path.join(os.homedir(), ".codin");
const RUN_PROFILES_DIR = path.join(CODIN_DIR, "run_profiles");

// Safe command allowlist
const SAFE_COMMANDS = [
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "python",
  "python3",
  "pip",
  "pip3",
  "go",
  "cargo",
  "rustc",
];

class ProcessManager extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map(); // runId -> { process, profile, logs, status, url }
    this.timeout = 300000; // 5 minutes default timeout
    this.maxWorkers = 5; // Max concurrent processes
    this.restartMaxAttempts = 3;
    this.restartBaseDelayMs = 800;
    this.completedRetentionMs = 60000;
    this.staleRunningTtlMs = 15 * 60 * 1000;
    this.supervisionIntervalMs = 15000;
    this.supervisionStats = {
      staleMarked: 0,
      staleRemoved: 0,
      lastSweepAt: null,
    };
    this.stateFile = path.join(getDataDir(), "run", "processes.json");
    this._supervisionTimer = null;
    this.ensureDirectories();
    this._loadPersistedState();
    this._startSupervision();
  }

  _serializeRunInfo(runInfo) {
    return {
      runId: runInfo.runId,
      ownerUserId: runInfo.ownerUserId || "local",
      profile: runInfo.profile,
      status: runInfo.status,
      url: runInfo.url || null,
      startedAt: runInfo.startedAt,
      endedAt: runInfo.endedAt || null,
      timeout: runInfo.timeout,
      timedOut: !!runInfo.timedOut,
      exitCode: runInfo.exitCode,
      error: runInfo.error || null,
      recoveredAfterRestart: !!runInfo.recoveredAfterRestart,
      logs: Array.isArray(runInfo.logs) ? runInfo.logs.slice(-200) : [],
    };
  }

  _persistState() {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      runs: Array.from(this.processes.values()).map((r) =>
        this._serializeRunInfo(r),
      ),
    };

    const dir = path.dirname(this.stateFile);
    fs.mkdirSync(dir, { recursive: true });
    const tempPath = `${this.stateFile}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tempPath, this.stateFile);
  }

  _loadPersistedState() {
    if (!fs.existsSync(this.stateFile)) return;
    try {
      const raw = fs.readFileSync(this.stateFile, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.runs)) return;

      for (const item of parsed.runs) {
        if (!item?.runId) continue;
        const recoveredStatus =
          item.status === "running" ? "failed" : item.status || "failed";
        const recovered = {
          runId: item.runId,
          ownerUserId: item.ownerUserId || "local",
          profile: item.profile || {},
          process: null,
          logs: Array.isArray(item.logs) ? item.logs : [],
          status: recoveredStatus,
          url: item.url || null,
          startedAt: item.startedAt || new Date().toISOString(),
          timeout: item.timeout || this.timeout,
          timedOut: !!item.timedOut,
          exitCode: item.exitCode,
          error:
            item.status === "running"
              ? "Recovered after process restart while still marked running"
              : item.error || null,
          endedAt: item.endedAt || Date.now(),
          recoveredAfterRestart: true,
        };
        this.processes.set(item.runId, recovered);
      }

      this._persistState();
    } catch {
      // Ignore corrupted persistence state.
    }
  }

  _startSupervision() {
    if (this._supervisionTimer) return;
    this._supervisionTimer = setInterval(() => {
      try {
        this.cleanupStaleProcesses();
      } catch {
        // Never crash supervision loop
      }
    }, this.supervisionIntervalMs);

    // Do not keep event loop alive just for supervision.
    if (typeof this._supervisionTimer.unref === "function") {
      this._supervisionTimer.unref();
    }
  }

  _stopSupervision() {
    if (this._supervisionTimer) {
      clearInterval(this._supervisionTimer);
      this._supervisionTimer = null;
    }
  }

  ensureDirectories() {
    if (!fs.existsSync(RUN_PROFILES_DIR)) {
      fs.mkdirSync(RUN_PROFILES_DIR, { recursive: true });
    }
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
  }

  /**
   * Load run profile for workspace
   */
  loadProfile(workspaceHash) {
    const profilePath = path.join(RUN_PROFILES_DIR, `${workspaceHash}.json`);

    if (!fs.existsSync(profilePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(profilePath, "utf8"));
  }

  /**
   * Save run profile for workspace
   */
  saveProfile(workspaceHash, profile) {
    const profilePath = path.join(RUN_PROFILES_DIR, `${workspaceHash}.json`);
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  }

  /**
   * Check if command is safe
   */
  isSafeCommand(command) {
    const baseCommand = command.split(" ")[0].toLowerCase();
    return SAFE_COMMANDS.includes(baseCommand);
  }

  /**
   * Start process
   */
  async start(profile, options = {}) {
    const { runCmd, cwd, env = {}, port } = profile;

    if (!runCmd) {
      throw new Error("No run command specified");
    }

    // Check command safety
    if (!this.isSafeCommand(runCmd) && !options.approved) {
      throw new Error("Command requires approval: " + runCmd);
    }

    // Check max concurrent processes (fail-closed)
    if (this.processes.size >= this.maxWorkers) {
      throw new Error(
        `Maximum concurrent processes (${this.maxWorkers}) reached. Stop a process and try again.`,
      );
    }

    const runId = `run-${Date.now()}`;
    const timeout = options.timeout || this.timeout;

    console.log(`[ProcessManager] Starting: ${runCmd} in ${cwd}`);

    // Parse command
    const parts = runCmd.split(" ");
    const command = parts[0];
    const args = parts.slice(1);

    // Setup timeout - Critical for Step 2.5
    let timeoutHandle = null;
    const timeoutError = new Error(`Process exceeded timeout of ${timeout}ms`);

    // Spawn process
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    const runInfo = {
      runId,
      ownerUserId: profile?.ownerUserId || options.userId || "local",
      process: child,
      profile,
      logs: [],
      status: "running",
      url: null,
      startedAt: new Date().toISOString(),
      timeout,
      timedOut: false,
    };

    this.processes.set(runId, runInfo);
    this._persistState();

    // Set timeout - Kill process if it takes too long
    timeoutHandle = setTimeout(() => {
      console.warn(
        `[ProcessManager] Process ${runId} exceeded timeout (${timeout}ms). Killing...`,
      );
      runInfo.timedOut = true;
      runInfo.logs.push({
        type: "system",
        text: `TIMEOUT: Process exceeded ${timeout}ms limit`,
        timestamp: Date.now(),
      });

      if (child && !child.killed) {
        child.kill("SIGTERM");
        // Force kill after 2 seconds
        setTimeout(() => {
          if (child && !child.killed) {
            child.kill("SIGKILL");
          }
        }, 2000);
      }
    }, timeout);

    // Capture stdout
    child.stdout.on("data", (data) => {
      const text = data.toString();
      runInfo.logs.push({ type: "stdout", text, timestamp: Date.now() });
      this.emit("log", { runId, type: "stdout", text });

      // Try to detect URL
      if (!runInfo.url) {
        const url = this.detectURL(text, port);
        if (url) {
          runInfo.url = url;
          this.emit("url-detected", { runId, url });
        }
      }
    });

    // Capture stderr
    child.stderr.on("data", (data) => {
      const text = data.toString();
      runInfo.logs.push({ type: "stderr", text, timestamp: Date.now() });
      this.emit("log", { runId, type: "stderr", text });
    });

    // Handle exit
    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      const exitMsg = runInfo.timedOut
        ? `Process ${runId} killed due to timeout. Exit code: ${code}`
        : `Process ${runId} exited with code ${code}`;
      console.log(`[ProcessManager] ${exitMsg}`);
      runInfo.status = code === 0 || runInfo.timedOut ? "stopped" : "failed";
      runInfo.exitCode = code;
      this.emit("exited", { runId, code, timedOut: runInfo.timedOut });
      runInfo.endedAt = Date.now();
      this._persistState();

      // Clean up process reference
      setTimeout(() => {
        this.processes.delete(runId);
        this._persistState();
      }, this.completedRetentionMs); // Keep logs briefly after process ends
    });

    child.on("error", (err) => {
      clearTimeout(timeoutHandle);
      console.error(`[ProcessManager] Process ${runId} error:`, err.message);
      runInfo.logs.push({
        type: "error",
        text: `ERROR: ${err.message}`,
        timestamp: Date.now(),
      });
      runInfo.status = "failed";
      runInfo.error = err.message;
      runInfo.endedAt = Date.now();
      this._persistState();
    });

    return {
      runId,
      url: port ? `http://localhost:${port}` : null,
    };
  }

  async _retryStart(profile, options = {}) {
    let lastError;
    const attempts = Math.max(1, options.attempts || this.restartMaxAttempts);

    for (let i = 1; i <= attempts; i++) {
      try {
        const result = await this.start(profile, options);
        return { ...result, attemptsUsed: i };
      } catch (err) {
        lastError = err;
        if (i === attempts) break;
        const delay = Math.min(this.restartBaseDelayMs * 2 ** (i - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Detect URL from logs
   */
  detectURL(text, expectedPort) {
    // Common patterns
    const patterns = [
      /https?:\/\/localhost:\d+/,
      /https?:\/\/127\.0\.0\.1:\d+/,
      /Local:\s+(https?:\/\/[^\s]+)/,
      /listening on (https?:\/\/[^\s]+)/i,
      /started server on (https?:\/\/[^\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    // Fallback: check for port mentions
    if (expectedPort) {
      const portPattern = new RegExp(`:(${expectedPort})\\b`);
      if (portPattern.test(text)) {
        return `http://localhost:${expectedPort}`;
      }
    }

    return null;
  }

  /**
   * Stop process
   */
  async stop(runId) {
    const runInfo = this.processes.get(runId);

    if (!runInfo) {
      throw new Error("Process not found");
    }

    console.log(`[ProcessManager] Stopping ${runId}...`);

    // Kill process
    if (runInfo.process && !runInfo.process.killed) {
      runInfo.process.kill("SIGTERM");

      // Force kill after 5s
      setTimeout(() => {
        if (runInfo.process && !runInfo.process.killed) {
          runInfo.process.kill("SIGKILL");
        }
      }, 5000);
    }

    runInfo.status = "stopped";
    runInfo.endedAt = Date.now();
    this._persistState();

    return { success: true };
  }

  _isProcessAlive(pid) {
    if (!pid || typeof pid !== "number") return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  cleanupStaleProcesses() {
    const now = Date.now();
    this.supervisionStats.lastSweepAt = new Date(now).toISOString();

    for (const [runId, runInfo] of this.processes.entries()) {
      const startedAt = new Date(runInfo.startedAt).getTime();
      const endedAt = runInfo.endedAt || null;

      if (runInfo.status === "running") {
        const alive = runInfo.process
          ? this._isProcessAlive(runInfo.process.pid)
          : false;
        const staleByAge = now - startedAt > this.staleRunningTtlMs;

        if (!alive || staleByAge) {
          runInfo.status = "failed";
          runInfo.error = !alive
            ? "Process became unreachable"
            : "Process exceeded stale running TTL";
          runInfo.endedAt = now;
          runInfo.logs.push({
            type: "system",
            text: `SUPERVISOR: Marked stale process (${runInfo.error})`,
            timestamp: now,
          });
          this.supervisionStats.staleMarked += 1;
          this._persistState();
        }
      }

      const isTerminal =
        runInfo.status === "stopped" || runInfo.status === "failed";
      if (isTerminal && endedAt && now - endedAt > this.completedRetentionMs) {
        this.processes.delete(runId);
        this.supervisionStats.staleRemoved += 1;
        this._persistState();
      }
    }

    return { ...this.supervisionStats };
  }

  /**
   * Restart process
   */
  async restart(runId) {
    const runInfo = this.processes.get(runId);

    if (!runInfo) {
      throw new Error("Process not found");
    }

    await this.stop(runId);

    // Wait briefly for process exit and port release
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const restarted = await this._retryStart(runInfo.profile, {
      approved: true,
      timeout: runInfo.timeout,
      attempts: this.restartMaxAttempts,
    });

    return {
      ...restarted,
      previousRunId: runId,
      restarted: true,
    };
  }

  /**
   * Get logs
   */
  getLogs(runId, options = {}) {
    const runInfo = this.processes.get(runId);

    if (!runInfo) {
      throw new Error("Process not found");
    }

    const { tail = 100, follow = false } = options;

    const logs = runInfo.logs.slice(-tail);

    if (follow) {
      // Return logs + setup listener
      return {
        logs,
        subscribe: (callback) => {
          this.on("log", (data) => {
            if (data.runId === runId) {
              callback(data);
            }
          });
        },
      };
    }

    return { logs };
  }

  /**
   * Get process status
   */
  getStatus(runId) {
    const runInfo = this.processes.get(runId);

    if (!runInfo) {
      return null;
    }

    return {
      runId: runInfo.runId,
      ownerUserId: runInfo.ownerUserId || "local",
      status: runInfo.status,
      url: runInfo.url,
      startedAt: runInfo.startedAt,
      exitCode: runInfo.exitCode,
      logsCount: runInfo.logs.length,
    };
  }

  /**
   * Get all running processes
   */
  getAllProcesses() {
    const processes = [];

    for (const [runId, runInfo] of this.processes.entries()) {
      processes.push({
        runId,
        ownerUserId: runInfo.ownerUserId || "local",
        status: runInfo.status,
        url: runInfo.url,
        startedAt: runInfo.startedAt,
        command: runInfo.profile.runCmd,
      });
    }

    return processes;
  }

  isOwnedBy(runId, userId) {
    const runInfo = this.processes.get(runId);
    if (!runInfo) return null;
    return (runInfo.ownerUserId || "local") === (userId || "local");
  }

  /**
   * Get sandbox statistics
   */
  getStats() {
    return {
      activeProcesses: this.processes.size,
      maxWorkers: this.maxWorkers,
      timeout: this.timeout,
      supervision: {
        ...this.supervisionStats,
        staleRunningTtlMs: this.staleRunningTtlMs,
        completedRetentionMs: this.completedRetentionMs,
      },
      processes: Array.from(this.processes.values()).map((p) => ({
        runId: p.runId,
        status: p.status,
        command: p.profile.runCmd,
        duration: Date.now() - new Date(p.startedAt).getTime(),
        timedOut: p.timedOut || false,
        logsCount: p.logs.length,
      })),
    };
  }

  async destroy() {
    this._stopSupervision();
    const ids = Array.from(this.processes.keys());
    for (const runId of ids) {
      try {
        await this.stop(runId);
      } catch {
        // ignore shutdown cleanup errors
      }
    }
    this.processes.clear();
    this._persistState();
  }
}

const processManager = new ProcessManager();

module.exports = { processManager, ProcessManager };
