/**
 * Multi-Session Manager
 *
 * Manages isolated sessions for concurrent users
 * - Session creation & lifecycle
 * - Workspace isolation
 * - Resource tracking per session
 * - Session persistence
 * - Cleanup policies
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const { getDataDir } = require("../store");

/**
 * Session Manager
 * Handles multiple concurrent user sessions with isolated workspaces
 */
class SessionManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} [options.baseWorkspaceDir] - Base directory for session workspaces
   * @param {number} [options.maxSessions=100] - Maximum concurrent sessions
   * @param {number} [options.sessionTTL=3600000] - Session TTL in ms (default 1 hour)
   * @param {number} [options.cleanupInterval=300000] - Cleanup check interval (5 min)
   * @param {Function} [options.onSessionExpired] - Callback when session expires
   */
  constructor(options = {}) {
    super();

    this.baseWorkspaceDir =
      options.baseWorkspaceDir || path.join(process.cwd(), "sessions");
    this.maxSessions = options.maxSessions || 100;
    this.sessionTTL = options.sessionTTL || 3600000; // 1 hour
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 min
    this.onSessionExpired = options.onSessionExpired || null;
    this.stateFile =
      options.stateFile ||
      path.join(getDataDir(), "sessions", "sessions-state.json");

    // Session storage: sessionId → Session object
    this.sessions = new Map();

    this._ensureStateDir();
    this._loadPersistedSessions();

    // Start cleanup timer
    this._startCleanupTimer();
  }

  _ensureStateDir() {
    fsSync.mkdirSync(path.dirname(this.stateFile), { recursive: true });
  }

  _serializeSession(session) {
    return {
      ...session,
      tasks: Array.from(session.tasks.entries()),
    };
  }

  _persistState() {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      sessions: Array.from(this.sessions.values()).map((s) =>
        this._serializeSession(s),
      ),
    };
    const tempPath = `${this.stateFile}.tmp`;
    fsSync.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    fsSync.renameSync(tempPath, this.stateFile);
  }

  _loadPersistedSessions() {
    if (!fsSync.existsSync(this.stateFile)) return;
    try {
      const raw = fsSync.readFileSync(this.stateFile, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.sessions)) return;
      const now = Date.now();
      for (const item of parsed.sessions) {
        if (!item?.sessionId || now > (item.expiresAt || 0)) {
          continue;
        }
        this.sessions.set(item.sessionId, {
          sessionId: item.sessionId,
          userId: item.userId || null,
          workspaceDir: item.workspaceDir,
          workspacePath: item.workspaceDir,
          createdAt: item.createdAt || now,
          lastAccessedAt: item.lastAccessedAt || now,
          expiresAt: item.expiresAt || now + this.sessionTTL,
          metadata: item.metadata || {},
          tasks: new Map(Array.isArray(item.tasks) ? item.tasks : []),
          resources: item.resources || {
            memoryBytes: 0,
            diskBytes: 0,
            cpuSeconds: 0,
            costUSD: 0,
          },
          state: item.state || "active",
        });
      }
    } catch {
      // Ignore corrupted state file and continue with empty sessions
    }
  }

  /**
   * Create new session
   * @param {Object} options
   * @param {string} [options.userId] - User identifier
   * @param {Object} [options.metadata] - Custom session metadata
   * @returns {Promise<Object>} Session object
   */
  async createSession(options = {}) {
    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Session limit reached (${this.maxSessions}). Try again later.`,
      );
    }

    const sessionId = crypto.randomUUID();
    const workspaceDir = path.join(this.baseWorkspaceDir, sessionId);

    // Create workspace directory
    await fs.mkdir(workspaceDir, { recursive: true });

    const session = {
      sessionId,
      userId: options.userId || null,
      workspaceDir,
      workspacePath: workspaceDir,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      expiresAt: Date.now() + this.sessionTTL,
      metadata: options.metadata || {},
      tasks: new Map(),
      resources: {
        memoryBytes: 0,
        diskBytes: 0,
        cpuSeconds: 0,
        costUSD: 0,
      },
      state: "active", // active, idle, expired, terminated
    };

    this.sessions.set(sessionId, session);
    this._persistState();
    this.emit("session-created", { sessionId, userId: session.userId });

    return session;
  }

  /**
   * Get session by ID
   * @param {string} sessionId
   * @returns {Object|null} Session object or null
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Update last accessed time
    session.lastAccessedAt = Date.now();
    session.state = "active";

    // Check if expired
    if (Date.now() > session.expiresAt) {
      this._expireSession(sessionId);
      return null;
    }

    this._persistState();

    return session;
  }

  /**
   * Update session metadata
   * @param {string} sessionId
   * @param {Object} updates - Partial session updates
   * @returns {boolean} Success
   */
  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Merge updates
    Object.assign(session, updates);
    session.lastAccessedAt = Date.now();
    session.state = "active";

    this._persistState();
    this.emit("session-updated", { sessionId, updates });
    return true;
  }

  updateActivity(sessionId, activity = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.lastAccessedAt = Date.now();
    session.state = "active";
    session.metadata = {
      ...session.metadata,
      ...(activity && typeof activity === "object" ? activity : {}),
    };
    this._persistState();
    this.emit("session-activity", { sessionId, activity });
    return true;
  }

  listSessions(filters = {}) {
    const { userId, status } = filters;
    let sessions = Array.from(this.sessions.values());
    if (userId) {
      sessions = sessions.filter((s) => s.userId === userId);
    }
    if (status) {
      sessions = sessions.filter((s) => s.state === status);
    }
    return sessions.map((s) => ({
      ...s,
      tasks: Array.from(s.tasks.values()),
    }));
  }

  /**
   * Track resource usage for session
   * @param {string} sessionId
   * @param {Object} usage - Resource usage delta
   */
  trackResourceUsage(sessionId, usage) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (usage.memoryBytes) session.resources.memoryBytes += usage.memoryBytes;
    if (usage.diskBytes) session.resources.diskBytes += usage.diskBytes;
    if (usage.cpuSeconds) session.resources.cpuSeconds += usage.cpuSeconds;
    if (usage.costUSD) session.resources.costUSD += usage.costUSD;

    this._persistState();
    this.emit("resource-tracked", { sessionId, usage });
  }

  /**
   * Add task to session
   * @param {string} sessionId
   * @param {string} taskId
   * @param {Object} taskData
   */
  addTask(sessionId, taskId, taskData) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.tasks.set(taskId, {
      ...taskData,
      createdAt: Date.now(),
      sessionId,
    });

    this._persistState();

    return true;
  }

  /**
   * Get all tasks for session
   * @param {string} sessionId
   * @returns {Array<Object>} Task list
   */
  getSessionTasks(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.tasks.values());
  }

  /**
   * Extend session TTL
   * @param {string} sessionId
   * @param {number} [additionalMs] - Additional time in ms
   * @returns {boolean} Success
   */
  extendSession(sessionId, additionalMs = null) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const extension = additionalMs || this.sessionTTL;
    session.expiresAt = Math.max(session.expiresAt, Date.now()) + extension;

    this._persistState();
    this.emit("session-extended", { sessionId, expiresAt: session.expiresAt });
    return true;
  }

  /**
   * Terminate session manually
   * @param {string} sessionId
   * @returns {Promise<boolean>} Success
   */
  async terminateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    await this._cleanupSession(sessionId);
    this.sessions.delete(sessionId);
    this._persistState();

    this.emit("session-terminated", { sessionId, userId: session.userId });
    return true;
  }

  /**
   * Get all active sessions
   * @returns {Array<Object>} Session list
   */
  getActiveSessions() {
    return Array.from(this.sessions.values()).filter(
      (s) => s.state === "active",
    );
  }

  /**
   * Get session statistics
   * @returns {Object} Stats
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());

    return {
      total: sessions.length,
      active: sessions.filter((s) => s.state === "active").length,
      idle: sessions.filter((s) => s.state === "idle").length,
      maxSessions: this.maxSessions,
      utilization:
        ((sessions.length / this.maxSessions) * 100).toFixed(1) + "%",
      totalResources: {
        memoryBytes: sessions.reduce(
          (sum, s) => sum + s.resources.memoryBytes,
          0,
        ),
        diskBytes: sessions.reduce((sum, s) => sum + s.resources.diskBytes, 0),
        cpuSeconds: sessions.reduce(
          (sum, s) => sum + s.resources.cpuSeconds,
          0,
        ),
        costUSD: sessions.reduce((sum, s) => sum + s.resources.costUSD, 0),
      },
    };
  }

  /**
   * Expire session
   * @private
   */
  async _expireSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = "expired";
    this.emit("session-expired", { sessionId, userId: session.userId });

    if (this.onSessionExpired) {
      this.onSessionExpired(session);
    }

    await this._cleanupSession(sessionId);
    this.sessions.delete(sessionId);
    this._persistState();
  }

  /**
   * Cleanup session resources
   * @private
   */
  async _cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // Delete workspace directory
      await fs.rm(session.workspaceDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to cleanup session ${sessionId}:`, error);
    }
  }

  /**
   * Start periodic cleanup timer
   * @private
   */
  _startCleanupTimer() {
    this._cleanupTimer = setInterval(() => {
      this._runCleanup();
    }, this.cleanupInterval);
  }

  /**
   * Run cleanup pass
   * @private
   */
  async _runCleanup() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        expiredSessions.push(sessionId);
      } else if (now - session.lastAccessedAt > this.sessionTTL / 2) {
        // Mark as idle if not accessed for half TTL
        session.state = "idle";
      }
    }

    // Expire old sessions
    for (const sessionId of expiredSessions) {
      await this._expireSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      this.emit("cleanup-complete", { expired: expiredSessions.length });
    }
    this._persistState();
  }

  /**
   * Shutdown session manager
   */
  async shutdown() {
    clearInterval(this._cleanupTimer);

    // Terminate all sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.terminateSession(sessionId);
    }

    this.emit("shutdown");
  }
}

/**
 * Worker Pool Manager
 * Manages worker processes for parallel task execution
 */
class WorkerPoolManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.workerCount] - Number of worker processes (default: CPU count)
   * @param {string} [options.workerScript] - Path to worker script
   * @param {number} [options.maxQueueSize=1000] - Maximum queue size
   * @param {number} [options.workerTimeout=300000] - Worker task timeout (5 min)
   */
  constructor(options = {}) {
    super();

    const os = require("os");
    this.workerCount = options.workerCount || os.cpus().length;
    this.workerScript = options.workerScript || null;
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.workerTimeout = options.workerTimeout || 300000;

    this.workers = [];
    this.queue = [];
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalDurationMs: 0,
    };
  }

  /**
   * Initialize worker pool
   * @returns {Promise<void>}
   */
  async initialize() {
    const { fork } = require("child_process");

    if (!this.workerScript) {
      throw new Error("Worker script path not provided");
    }

    for (let i = 0; i < this.workerCount; i++) {
      const worker = {
        id: i,
        process: fork(this.workerScript),
        busy: false,
        currentTask: null,
        tasksCompleted: 0,
      };

      worker.process.on("message", (message) => {
        this._handleWorkerMessage(worker, message);
      });

      worker.process.on("error", (error) => {
        this.emit("worker-error", { workerId: worker.id, error });
      });

      worker.process.on("exit", (code) => {
        this.emit("worker-exit", { workerId: worker.id, code });
        // Restart worker if unexpected exit
        if (code !== 0) {
          this._restartWorker(worker);
        }
      });

      this.workers.push(worker);
    }

    this.emit("pool-initialized", { workerCount: this.workerCount });
  }

  /**
   * Submit task to worker pool
   * @param {Object} task - Task data
   * @returns {Promise<any>} Task result
   */
  async submitTask(task) {
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(
        `Worker queue full (${this.maxQueueSize}). Try again later.`,
      );
    }

    return new Promise((resolve, reject) => {
      const taskWrapper = {
        task,
        resolve,
        reject,
        submittedAt: Date.now(),
        timeout: setTimeout(() => {
          reject(new Error(`Task timeout after ${this.workerTimeout}ms`));
        }, this.workerTimeout),
      };

      this.queue.push(taskWrapper);
      this._processQueue();
    });
  }

  /**
   * Process task queue
   * @private
   */
  _processQueue() {
    // Find available worker
    const worker = this.workers.find((w) => !w.busy);
    if (!worker || this.queue.length === 0) return;

    const taskWrapper = this.queue.shift();
    worker.busy = true;
    worker.currentTask = taskWrapper;

    // Send task to worker
    worker.process.send({
      type: "task",
      data: taskWrapper.task,
      taskId: crypto.randomUUID(),
    });
  }

  /**
   * Handle worker message
   * @private
   */
  _handleWorkerMessage(worker, message) {
    if (!worker.currentTask) return;

    const { resolve, reject, timeout } = worker.currentTask;
    clearTimeout(timeout);

    if (message.type === "success") {
      resolve(message.result);
      this.stats.tasksCompleted++;
      this.stats.totalDurationMs += message.durationMs || 0;
    } else if (message.type === "error") {
      reject(new Error(message.error));
      this.stats.tasksFailed++;
    }

    worker.busy = false;
    worker.currentTask = null;
    worker.tasksCompleted++;

    // Process next task
    this._processQueue();
  }

  /**
   * Restart worker
   * @private
   */
  _restartWorker(worker) {
    const { fork } = require("child_process");
    worker.process = fork(this.workerScript);
    worker.busy = false;
    worker.currentTask = null;

    worker.process.on("message", (message) => {
      this._handleWorkerMessage(worker, message);
    });
  }

  /**
   * Get worker pool statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      workers: this.workerCount,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      queueSize: this.queue.length,
      tasksCompleted: this.stats.tasksCompleted,
      tasksFailed: this.stats.tasksFailed,
      avgDurationMs:
        this.stats.tasksCompleted > 0
          ? Math.round(this.stats.totalDurationMs / this.stats.tasksCompleted)
          : 0,
    };
  }

  /**
   * Shutdown worker pool
   * @returns {Promise<void>}
   */
  async shutdown() {
    for (const worker of this.workers) {
      worker.process.kill();
    }
    this.workers = [];
    this.queue = [];
    this.emit("pool-shutdown");
  }
}

module.exports = {
  SessionManager,
  WorkerPoolManager,
};
