/**
 * CodIn MAS — Terminal Manager
 *
 * Manages persistent terminal sessions for agent execution.
 * Each agent can have its own terminal session with command history,
 * environment isolation, and output streaming.
 */
"use strict";

const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");

const MAX_SESSIONS = 20;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_OUTPUT_BUFFER = 64 * 1024; // 64KB per session
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per command

class TerminalSession extends EventEmitter {
  constructor(id, opts = {}) {
    super();
    this.id = id;
    this.agentId = opts.agentId || null;
    this.cwd = opts.cwd || process.cwd();
    this.env = { ...process.env, ...(opts.env || {}) };
    this.history = [];
    this.output = "";
    this.status = "idle"; // idle | running | closed
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this._process = null;
    this._timeoutHandle = null;
  }

  /**
   * Execute a command in this session.
   * @param {string} command
   * @param {object} opts - { timeout, cwd }
   * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
   */
  async execute(command, opts = {}) {
    if (this.status === "closed") {
      throw new Error("Session is closed");
    }
    if (this.status === "running") {
      throw new Error("Session is busy — wait for current command to finish");
    }

    this.status = "running";
    this.lastActivity = Date.now();

    const timeout = opts.timeout || COMMAND_TIMEOUT_MS;
    const cwd = opts.cwd || this.cwd;

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const isWin = process.platform === "win32";
      const shell = isWin ? "cmd.exe" : "/bin/bash";
      const shellArgs = isWin ? ["/c", command] : ["-c", command];

      const child = spawn(shell, shellArgs, {
        cwd,
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      this._process = child;

      this._timeoutHandle = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5000);
      }, timeout);

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        // Trim if too large
        if (stdout.length > MAX_OUTPUT_BUFFER) {
          stdout = stdout.slice(-MAX_OUTPUT_BUFFER);
        }
        this.emit("stdout", chunk);
      });

      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        if (stderr.length > MAX_OUTPUT_BUFFER) {
          stderr = stderr.slice(-MAX_OUTPUT_BUFFER);
        }
        this.emit("stderr", chunk);
      });

      child.on("close", (code) => {
        clearTimeout(this._timeoutHandle);
        this._timeoutHandle = null;
        this._process = null;
        this.status = "idle";
        this.lastActivity = Date.now();

        const entry = {
          command,
          exitCode: code ?? 1,
          stdout: stdout.slice(0, 4096),
          stderr: stderr.slice(0, 4096),
          timestamp: Date.now(),
        };
        this.history.push(entry);

        // Keep output buffer trimmed
        this.output += `$ ${command}\n${stdout}${stderr ? `\nSTDERR: ${stderr}` : ""}\n`;
        if (this.output.length > MAX_OUTPUT_BUFFER) {
          this.output = this.output.slice(-MAX_OUTPUT_BUFFER);
        }

        resolve({ exitCode: code ?? 1, stdout, stderr });
      });

      child.on("error", (err) => {
        clearTimeout(this._timeoutHandle);
        this._timeoutHandle = null;
        this._process = null;
        this.status = "idle";
        reject(err);
      });
    });
  }

  /**
   * Kill the running process.
   */
  kill() {
    if (this._process) {
      this._process.kill("SIGTERM");
      setTimeout(() => {
        if (this._process && !this._process.killed) {
          this._process.kill("SIGKILL");
        }
      }, 3000);
    }
  }

  /**
   * Close this session permanently.
   */
  close() {
    this.kill();
    this.status = "closed";
    clearTimeout(this._timeoutHandle);
    this.removeAllListeners();
  }

  toJSON() {
    return {
      id: this.id,
      agentId: this.agentId,
      cwd: this.cwd,
      status: this.status,
      historyCount: this.history.length,
      lastActivity: this.lastActivity,
      createdAt: this.createdAt,
    };
  }
}

class TerminalManager {
  constructor() {
    this._sessions = new Map();
    this._cleanupInterval = setInterval(() => this._cleanup(), 60000);
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  /**
   * Create a new terminal session.
   */
  createSession(opts = {}) {
    if (this._sessions.size >= MAX_SESSIONS) {
      // Evict oldest idle session
      let oldest = null;
      for (const [, session] of this._sessions) {
        if (session.status === "idle") {
          if (!oldest || session.lastActivity < oldest.lastActivity) {
            oldest = session;
          }
        }
      }
      if (oldest) {
        oldest.close();
        this._sessions.delete(oldest.id);
      } else {
        throw new Error(`Maximum sessions (${MAX_SESSIONS}) reached`);
      }
    }

    const id = `term-${crypto.randomUUID().slice(0, 8)}`;
    const session = new TerminalSession(id, opts);
    this._sessions.set(id, session);
    return session;
  }

  /**
   * Get a session by ID.
   */
  getSession(id) {
    return this._sessions.get(id) || null;
  }

  /**
   * Get or create a session for a specific agent.
   */
  getAgentSession(agentId, opts = {}) {
    for (const [, session] of this._sessions) {
      if (session.agentId === agentId && session.status !== "closed") {
        return session;
      }
    }
    return this.createSession({ ...opts, agentId });
  }

  /**
   * List all sessions.
   */
  listSessions() {
    return Array.from(this._sessions.values()).map((s) => s.toJSON());
  }

  /**
   * Close a specific session.
   */
  closeSession(id) {
    const session = this._sessions.get(id);
    if (session) {
      session.close();
      this._sessions.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Close all sessions.
   */
  closeAll() {
    for (const [, session] of this._sessions) {
      session.close();
    }
    this._sessions.clear();
  }

  /**
   * Cleanup expired sessions.
   */
  _cleanup() {
    const now = Date.now();
    for (const [id, session] of this._sessions) {
      if (
        session.status === "idle" &&
        now - session.lastActivity > SESSION_TIMEOUT_MS
      ) {
        session.close();
        this._sessions.delete(id);
      }
    }
  }

  /**
   * Shutdown the manager.
   */
  shutdown() {
    clearInterval(this._cleanupInterval);
    this.closeAll();
  }
}

module.exports = { TerminalManager, TerminalSession };
