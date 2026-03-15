"use strict";

/**
 * CodeIn MAS — Background Task Manager
 *
 * Enables reliable multi-agent task execution that survives IDE restarts.
 * Users can start tasks, close the IDE, come back later, and see results.
 *
 * Three core components:
 *   - BackgroundTaskManager: submit, execute, track, and retrieve tasks
 *   - TaskQueue: priority-based scheduling queue
 *   - TaskRecovery: crash recovery and checkpoint/restore
 *
 * Persistence is optional — falls back to in-memory storage when null.
 */

const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");
const { createLogger } = require("./logger");

const log = createLogger("BackgroundTasks");

// ─── Constants ───────────────────────────────────────────────

/** @enum {number} Priority levels mapped to numeric weights */
const PRIORITY = Object.freeze({
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
});

/** @enum {string} Task lifecycle statuses */
const TASK_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  INTERRUPTED: "interrupted",
});

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_CLEANUP_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHECKPOINT_TABLE = "task_checkpoints";
const TASKS_TABLE = "background_tasks";

// ═══════════════════════════════════════════════════════════════
// 1. IN-MEMORY PERSISTENCE FALLBACK
// ═══════════════════════════════════════════════════════════════

/**
 * Minimal in-memory persistence that mirrors the SQLite persistence API.
 * Used when no real persistence layer is provided.
 */
class InMemoryPersistence {
  constructor() {
    /** @type {Map<string, object>} */
    this._tasks = new Map();
    /** @type {Map<string, object>} */
    this._checkpoints = new Map();
  }

  /**
   * Save a task record.
   * @param {string} table
   * @param {object} record
   */
  save(table, record) {
    if (table === TASKS_TABLE) {
      this._tasks.set(record.id, { ...record });
    } else if (table === CHECKPOINT_TABLE) {
      this._checkpoints.set(record.taskId, { ...record });
    }
  }

  /**
   * Get a single record by ID.
   * @param {string} table
   * @param {string} id
   * @returns {object|null}
   */
  get(table, id) {
    if (table === TASKS_TABLE) {
      const r = this._tasks.get(id);
      return r ? { ...r } : null;
    }
    if (table === CHECKPOINT_TABLE) {
      const r = this._checkpoints.get(id);
      return r ? { ...r } : null;
    }
    return null;
  }

  /**
   * Update fields on a record.
   * @param {string} table
   * @param {string} id
   * @param {object} fields
   */
  update(table, id, fields) {
    if (table === TASKS_TABLE) {
      const existing = this._tasks.get(id);
      if (existing) {
        Object.assign(existing, fields);
      }
    } else if (table === CHECKPOINT_TABLE) {
      const existing = this._checkpoints.get(id);
      if (existing) {
        Object.assign(existing, fields);
      }
    }
  }

  /**
   * Delete a record.
   * @param {string} table
   * @param {string} id
   */
  delete(table, id) {
    if (table === TASKS_TABLE) {
      this._tasks.delete(id);
    } else if (table === CHECKPOINT_TABLE) {
      this._checkpoints.delete(id);
    }
  }

  /**
   * Query records with optional filter.
   * @param {string} table
   * @param {object} [filter]
   * @returns {Array<object>}
   */
  query(table, filter = {}) {
    let records = [];
    if (table === TASKS_TABLE) {
      records = Array.from(this._tasks.values());
    } else if (table === CHECKPOINT_TABLE) {
      records = Array.from(this._checkpoints.values());
    }

    return records
      .filter((rec) => {
        for (const [key, value] of Object.entries(filter)) {
          if (rec[key] !== value) return false;
        }
        return true;
      })
      .map((r) => ({ ...r }));
  }

  /**
   * Delete records matching filter.
   * @param {string} table
   * @param {function} predicate
   * @returns {number} Count of deleted records
   */
  deleteWhere(table, predicate) {
    let count = 0;
    const store = table === TASKS_TABLE ? this._tasks : this._checkpoints;
    for (const [id, rec] of store) {
      if (predicate(rec)) {
        store.delete(id);
        count++;
      }
    }
    return count;
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. TASK QUEUE — Priority queue for task scheduling
// ═══════════════════════════════════════════════════════════════

/**
 * Priority queue that orders tasks by priority (descending) then by
 * submission time (ascending, FIFO within same priority).
 */
class TaskQueue {
  constructor() {
    /** @type {Array<object>} Sorted array: highest priority first, then earliest createdAt */
    this._items = [];
  }

  /**
   * Add a task to the queue in priority order.
   * @param {object} task — Must have `priority` (number) and `createdAt` (ISO string)
   */
  enqueue(task) {
    const priorityNum =
      typeof task.priority === "string"
        ? (PRIORITY[task.priority] ?? PRIORITY.normal)
        : (task.priority ?? PRIORITY.normal);

    const entry = { ...task, _priorityNum: priorityNum };

    // Binary search for insertion position
    let lo = 0;
    let hi = this._items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = this._compare(entry, this._items[mid]);
      if (cmp < 0) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    this._items.splice(lo, 0, entry);
  }

  /**
   * Compare function: higher priority first; within same priority, earlier createdAt first.
   * Returns negative if a should come BEFORE b.
   * @param {object} a
   * @param {object} b
   * @returns {number}
   */
  _compare(a, b) {
    // Higher priority number = should come first (negative return)
    if (a._priorityNum !== b._priorityNum) {
      return b._priorityNum - a._priorityNum; // descending
    }
    // Same priority: earlier timestamp first
    const tA = a.createdAt || "";
    const tB = b.createdAt || "";
    if (tA < tB) return -1;
    if (tA > tB) return 1;
    return 0;
  }

  /**
   * Remove and return the highest-priority task.
   * @returns {object|null}
   */
  dequeue() {
    if (this._items.length === 0) return null;
    const item = this._items.shift();
    delete item._priorityNum;
    return item;
  }

  /**
   * Return the highest-priority task without removing it.
   * @returns {object|null}
   */
  peek() {
    if (this._items.length === 0) return null;
    const item = { ...this._items[0] };
    delete item._priorityNum;
    return item;
  }

  /**
   * Remove a specific task by ID.
   * @param {string} taskId
   * @returns {boolean} Whether the task was found and removed
   */
  remove(taskId) {
    const idx = this._items.findIndex((item) => item.id === taskId);
    if (idx === -1) return false;
    this._items.splice(idx, 1);
    return true;
  }

  /**
   * Number of tasks in the queue.
   * @returns {number}
   */
  get size() {
    return this._items.length;
  }

  /**
   * Return all queued tasks as a sorted array (without internal fields).
   * @returns {Array<object>}
   */
  toArray() {
    return this._items.map((item) => {
      const copy = { ...item };
      delete copy._priorityNum;
      return copy;
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. TASK RECOVERY — Crash recovery and checkpoint/restore
// ═══════════════════════════════════════════════════════════════

class TaskRecovery {
  /**
   * On startup, find tasks that were "running" when the process died.
   * Mark them as "interrupted" and optionally re-queue them.
   *
   * @param {InMemoryPersistence|object} persistence — Persistence layer
   * @param {object} [options]
   * @param {boolean} [options.requeue=true] — Whether to re-queue interrupted tasks
   * @returns {{ recovered: number, requeued: number }}
   */
  static recoverTasks(persistence, options = {}) {
    const { requeue = true } = options;

    if (!persistence) {
      log.warn("No persistence layer — cannot recover tasks");
      return { recovered: 0, requeued: 0 };
    }

    let recovered = 0;
    let requeuedCount = 0;

    try {
      const runningTasks = persistence.query(TASKS_TABLE, {
        status: TASK_STATUS.RUNNING,
      });

      for (const task of runningTasks) {
        persistence.update(TASKS_TABLE, task.id, {
          status: TASK_STATUS.INTERRUPTED,
          interruptedAt: new Date().toISOString(),
          error: "Process terminated while task was running",
        });
        recovered++;
        log.info("Marked interrupted task", {
          taskId: task.id,
          goal: task.goal,
        });
      }

      if (requeue && recovered > 0) {
        const interruptedTasks = persistence.query(TASKS_TABLE, {
          status: TASK_STATUS.INTERRUPTED,
        });
        for (const task of interruptedTasks) {
          persistence.update(TASKS_TABLE, task.id, {
            status: TASK_STATUS.QUEUED,
            requeuedAt: new Date().toISOString(),
            retryCount: (task.retryCount || 0) + 1,
          });
          requeuedCount++;
        }
      }

      log.info("Task recovery complete", {
        recovered,
        requeued: requeuedCount,
      });
    } catch (err) {
      log.error("Task recovery failed", { error: err.message });
    }

    return { recovered, requeued: requeuedCount };
  }

  /**
   * Save a checkpoint of task state so it can be resumed after a crash.
   *
   * @param {InMemoryPersistence|object} persistence
   * @param {string} taskId
   * @param {object} state — Serializable task state snapshot
   */
  static createCheckpoint(persistence, taskId, state) {
    if (!persistence) return;

    try {
      const checkpoint = {
        taskId,
        state: JSON.parse(JSON.stringify(state)),
        createdAt: new Date().toISOString(),
      };

      const existing = persistence.get(CHECKPOINT_TABLE, taskId);
      if (existing) {
        persistence.update(CHECKPOINT_TABLE, taskId, checkpoint);
      } else {
        persistence.save(CHECKPOINT_TABLE, checkpoint);
      }

      log.debug("Checkpoint created", { taskId });
    } catch (err) {
      log.error("Failed to create checkpoint", { taskId, error: err.message });
    }
  }

  /**
   * Restore task state from the last checkpoint.
   *
   * @param {InMemoryPersistence|object} persistence
   * @param {string} taskId
   * @returns {object|null} The restored state, or null if no checkpoint exists
   */
  static restoreFromCheckpoint(persistence, taskId) {
    if (!persistence) return null;

    try {
      const checkpoint = persistence.get(CHECKPOINT_TABLE, taskId);
      if (!checkpoint) {
        log.debug("No checkpoint found", { taskId });
        return null;
      }

      log.info("Restored from checkpoint", {
        taskId,
        checkpointedAt: checkpoint.createdAt,
      });
      return checkpoint.state;
    } catch (err) {
      log.error("Failed to restore checkpoint", { taskId, error: err.message });
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. BACKGROUND TASK MANAGER
// ═══════════════════════════════════════════════════════════════

/**
 * Central manager for background task execution.
 *
 * Supports persistent task queuing, concurrent execution with limits,
 * progress tracking, crash recovery, and result retrieval across
 * IDE sessions.
 *
 * @extends EventEmitter
 *
 * Events emitted:
 *   - "task:submitted"  — { taskId }
 *   - "task:started"    — { taskId }
 *   - "task:progress"   — { taskId, progress }
 *   - "task:completed"  — { taskId, result }
 *   - "task:failed"     — { taskId, error }
 *   - "task:cancelled"  — { taskId }
 *   - "queue:drained"   — when queue becomes empty
 */
class BackgroundTaskManager extends EventEmitter {
  /**
   * @param {object} options
   * @param {object|null} [options.persistence] — SQLite-compatible persistence layer; null for in-memory
   * @param {number} [options.maxConcurrent=3] — Maximum tasks running simultaneously
   */
  constructor({
    persistence = null,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
  } = {}) {
    super();

    /** @type {InMemoryPersistence|object} */
    this._persistence = persistence || new InMemoryPersistence();

    /** @type {number} */
    this._maxConcurrent = maxConcurrent;

    /** @type {TaskQueue} */
    this._queue = new TaskQueue();

    /** @type {Map<string, { taskSpec: object, abortController: AbortController, promise: Promise }>} */
    this._running = new Map();

    /** @type {boolean} */
    this._destroyed = false;

    log.info("BackgroundTaskManager initialized", {
      maxConcurrent,
      hasPersistence: !!persistence,
    });
  }

  // ─── Submit ─────────────────────────────────────────────────

  /**
   * Submit a task for background execution.
   *
   * @param {object} taskSpec
   * @param {string} [taskSpec.id] — Task ID (auto-generated if omitted)
   * @param {string} taskSpec.goal — Human-readable goal description
   * @param {string} [taskSpec.mode] — Execution mode (e.g. "full-auto")
   * @param {string} [taskSpec.topology] — Swarm topology
   * @param {object} [taskSpec.context] — Additional context for the task
   * @param {string} [taskSpec.priority="normal"] — "low" | "normal" | "high" | "critical"
   * @param {string} [taskSpec.userId] — User who submitted the task
   * @returns {{ taskId: string, position: number, estimatedStart: string }}
   */
  submit(taskSpec) {
    this._assertNotDestroyed();

    const id = taskSpec.id || crypto.randomUUID();
    const priority = taskSpec.priority || "normal";
    const now = new Date().toISOString();

    const task = {
      id,
      goal: taskSpec.goal,
      mode: taskSpec.mode || null,
      topology: taskSpec.topology || null,
      context: taskSpec.context || null,
      priority,
      userId: taskSpec.userId || null,
      status: TASK_STATUS.QUEUED,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      duration: null,
      progress: {
        percent: 0,
        currentNode: null,
        totalNodes: null,
        message: "Queued",
      },
      result: null,
      error: null,
      retryCount: 0,
    };

    // Persist the task record
    try {
      this._persistence.save(TASKS_TABLE, task);
    } catch (err) {
      log.error("Failed to persist task", { taskId: id, error: err.message });
    }

    // Add to the priority queue
    this._queue.enqueue(task);

    const position = this._getQueuePosition(id);
    const estimatedStart = this._estimateStart(position);

    log.info("Task submitted", {
      taskId: id,
      goal: task.goal,
      priority,
      position,
    });
    this.emit("task:submitted", { taskId: id });

    return { taskId: id, position, estimatedStart };
  }

  // ─── Start ──────────────────────────────────────────────────

  /**
   * Start executing a queued task.
   *
   * @param {string} taskId — ID of the task to start
   * @param {function} executeFn — Async function(taskSpec) that performs the actual work
   * @returns {{ taskId: string, status: string, abort: function }|null} Handle for the running task, or null if cannot start
   */
  start(taskId, executeFn) {
    this._assertNotDestroyed();

    if (this._running.size >= this._maxConcurrent) {
      log.warn("Cannot start task — at concurrent limit", {
        taskId,
        running: this._running.size,
        max: this._maxConcurrent,
      });
      return null;
    }

    // Remove from queue
    this._queue.remove(taskId);

    // Load the task record
    let taskSpec;
    try {
      taskSpec = this._persistence.get(TASKS_TABLE, taskId);
    } catch (err) {
      log.error("Failed to load task for execution", {
        taskId,
        error: err.message,
      });
      return null;
    }

    if (!taskSpec) {
      log.error("Task not found", { taskId });
      return null;
    }

    if (
      taskSpec.status !== TASK_STATUS.QUEUED &&
      taskSpec.status !== TASK_STATUS.INTERRUPTED
    ) {
      log.warn("Task not in startable state", {
        taskId,
        status: taskSpec.status,
      });
      return null;
    }

    const startedAt = new Date().toISOString();
    const abortController = new AbortController();

    // Update status to running
    this._persistUpdate(taskId, {
      status: TASK_STATUS.RUNNING,
      startedAt,
      progress: {
        percent: 0,
        currentNode: null,
        totalNodes: null,
        message: "Starting...",
      },
    });

    log.info("Task started", { taskId, goal: taskSpec.goal });
    this.emit("task:started", { taskId });

    // Execute asynchronously
    const promise = this._executeTask(
      taskId,
      taskSpec,
      executeFn,
      abortController.signal,
    );

    this._running.set(taskId, { taskSpec, abortController, promise });

    return {
      taskId,
      status: TASK_STATUS.RUNNING,
      abort: () => abortController.abort(),
    };
  }

  /**
   * Internal: execute the task and handle completion/failure.
   * @param {string} taskId
   * @param {object} taskSpec
   * @param {function} executeFn
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   * @private
   */
  async _executeTask(taskId, taskSpec, executeFn, signal) {
    const startTime = Date.now();

    try {
      // Inject signal into taskSpec so executeFn can check for cancellation
      const specWithSignal = { ...taskSpec, signal };
      const result = await executeFn(specWithSignal);

      if (signal.aborted) {
        // Task was cancelled during execution
        return;
      }

      const duration = Date.now() - startTime;
      const completedAt = new Date().toISOString();

      this._persistUpdate(taskId, {
        status: TASK_STATUS.COMPLETED,
        completedAt,
        duration,
        result: result != null ? result : null,
        progress: {
          percent: 100,
          currentNode: null,
          totalNodes: null,
          message: "Completed",
        },
      });

      log.info("Task completed", { taskId, duration });
      this.emit("task:completed", { taskId, result });
    } catch (err) {
      if (signal.aborted) {
        // Cancelled — already handled by cancel()
        return;
      }

      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;

      this._persistUpdate(taskId, {
        status: TASK_STATUS.FAILED,
        completedAt: new Date().toISOString(),
        duration,
        error: errorMessage,
        errorStack: errorStack || null,
        progress: {
          percent: 0,
          currentNode: null,
          totalNodes: null,
          message: `Failed: ${errorMessage}`,
        },
      });

      log.error("Task failed", { taskId, error: errorMessage });
      this.emit("task:failed", { taskId, error: errorMessage });
    } finally {
      this._running.delete(taskId);

      // Try to start next queued task
      this._drainQueue();
    }
  }

  // ─── Get Status ─────────────────────────────────────────────

  /**
   * Get the current status of a task.
   *
   * @param {string} taskId
   * @returns {{ id: string, goal: string, status: string, progress: object, startedAt: string|null, completedAt: string|null, duration: number|null, result: any, error: string|null }|null}
   */
  getStatus(taskId) {
    try {
      const task = this._persistence.get(TASKS_TABLE, taskId);
      if (!task) return null;

      return {
        id: task.id,
        goal: task.goal,
        status: task.status,
        progress: task.progress || {
          percent: 0,
          currentNode: null,
          totalNodes: null,
          message: null,
        },
        startedAt: task.startedAt || null,
        completedAt: task.completedAt || null,
        duration: task.duration || null,
        result: task.result || null,
        error: task.error || null,
      };
    } catch (err) {
      log.error("Failed to get task status", { taskId, error: err.message });
      return null;
    }
  }

  // ─── Get Results ────────────────────────────────────────────

  /**
   * Get completed task results from persistence.
   *
   * @param {string} taskId
   * @returns {any|null} The task result, or null if not found/not completed
   */
  getResults(taskId) {
    try {
      const task = this._persistence.get(TASKS_TABLE, taskId);
      if (!task) return null;
      if (task.status !== TASK_STATUS.COMPLETED) return null;
      return task.result;
    } catch (err) {
      log.error("Failed to get task results", { taskId, error: err.message });
      return null;
    }
  }

  // ─── Cancel ─────────────────────────────────────────────────

  /**
   * Cancel a queued or running task.
   *
   * @param {string} taskId
   * @returns {boolean} Whether the task was successfully cancelled
   */
  cancel(taskId) {
    // Try to remove from queue first
    const wasQueued = this._queue.remove(taskId);

    // If running, abort it
    const runningEntry = this._running.get(taskId);
    if (runningEntry) {
      runningEntry.abortController.abort();
      this._running.delete(taskId);
    }

    if (!wasQueued && !runningEntry) {
      // Check if it exists at all
      const task = this._persistence.get(TASKS_TABLE, taskId);
      if (
        !task ||
        task.status === TASK_STATUS.COMPLETED ||
        task.status === TASK_STATUS.FAILED
      ) {
        log.warn("Cannot cancel task — not active", { taskId });
        return false;
      }
    }

    this._persistUpdate(taskId, {
      status: TASK_STATUS.CANCELLED,
      completedAt: new Date().toISOString(),
      progress: {
        percent: 0,
        currentNode: null,
        totalNodes: null,
        message: "Cancelled",
      },
    });

    log.info("Task cancelled", { taskId });
    this.emit("task:cancelled", { taskId });
    return true;
  }

  // ─── List Tasks ─────────────────────────────────────────────

  /**
   * List tasks filtered by criteria.
   *
   * @param {object} [filter={}]
   * @param {string} [filter.status] — Filter by status
   * @param {string} [filter.userId] — Filter by userId
   * @param {string} [filter.since] — ISO date string, only tasks created after this
   * @param {string} [filter.until] — ISO date string, only tasks created before this
   * @param {number} [filter.limit=50] — Max results
   * @returns {Array<object>} Tasks sorted by createdAt descending
   */
  listTasks(filter = {}) {
    try {
      // Build query filter for simple fields
      const queryFilter = {};
      if (filter.status) queryFilter.status = filter.status;
      if (filter.userId) queryFilter.userId = filter.userId;

      let tasks = this._persistence.query(TASKS_TABLE, queryFilter);

      // Apply date filters
      if (filter.since) {
        tasks = tasks.filter((t) => t.createdAt >= filter.since);
      }
      if (filter.until) {
        tasks = tasks.filter((t) => t.createdAt <= filter.until);
      }

      // Sort by createdAt descending
      tasks.sort((a, b) => {
        if (a.createdAt > b.createdAt) return -1;
        if (a.createdAt < b.createdAt) return 1;
        return 0;
      });

      // Apply limit
      const limit = filter.limit || 50;
      return tasks.slice(0, limit);
    } catch (err) {
      log.error("Failed to list tasks", { error: err.message });
      return [];
    }
  }

  // ─── Retry ──────────────────────────────────────────────────

  /**
   * Re-submit a failed task with the same parameters.
   *
   * @param {string} taskId — ID of the failed task to retry
   * @returns {{ taskId: string, position: number, estimatedStart: string }|null}
   */
  retry(taskId) {
    try {
      const task = this._persistence.get(TASKS_TABLE, taskId);
      if (!task) {
        log.warn("Cannot retry — task not found", { taskId });
        return null;
      }

      if (
        task.status !== TASK_STATUS.FAILED &&
        task.status !== TASK_STATUS.INTERRUPTED
      ) {
        log.warn("Cannot retry — task is not in a retryable state", {
          taskId,
          status: task.status,
        });
        return null;
      }

      // Submit a new task with the same parameters
      return this.submit({
        id: crypto.randomUUID(), // new ID for the retry
        goal: task.goal,
        mode: task.mode,
        topology: task.topology,
        context: {
          ...(task.context || {}),
          retriedFrom: taskId,
          retryCount: (task.retryCount || 0) + 1,
        },
        priority: task.priority,
        userId: task.userId,
      });
    } catch (err) {
      log.error("Failed to retry task", { taskId, error: err.message });
      return null;
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────

  /**
   * Remove completed/failed/cancelled tasks older than maxAge.
   *
   * @param {number} [maxAge] — Maximum age in ms (default: 7 days)
   * @returns {number} Number of tasks removed
   */
  cleanup(maxAge = DEFAULT_CLEANUP_MAX_AGE) {
    const cutoff = new Date(Date.now() - maxAge).toISOString();
    const terminalStatuses = new Set([
      TASK_STATUS.COMPLETED,
      TASK_STATUS.FAILED,
      TASK_STATUS.CANCELLED,
    ]);

    try {
      const removed = this._persistence.deleteWhere(TASKS_TABLE, (task) => {
        return terminalStatuses.has(task.status) && task.createdAt < cutoff;
      });

      if (removed > 0) {
        log.info("Cleaned up old tasks", {
          removed,
          maxAgeDays: Math.round(maxAge / 86400000),
        });
      }

      return removed;
    } catch (err) {
      log.error("Failed to cleanup tasks", { error: err.message });
      return 0;
    }
  }

  // ─── Get Queue ──────────────────────────────────────────────

  /**
   * Get the current queue with positions.
   *
   * @returns {Array<{ position: number, id: string, goal: string, priority: string, createdAt: string }>}
   */
  getQueue() {
    const items = this._queue.toArray();
    return items.map((item, idx) => ({
      position: idx + 1,
      id: item.id,
      goal: item.goal,
      priority: item.priority,
      createdAt: item.createdAt,
    }));
  }

  // ─── Update Progress ───────────────────────────────────────

  /**
   * Update progress for a running task. Persisted so progress
   * survives a GUI reconnect.
   *
   * @param {string} taskId
   * @param {object} progress
   * @param {number} [progress.percent] — 0-100
   * @param {string} [progress.currentNode] — Currently executing node
   * @param {number} [progress.totalNodes] — Total nodes in the task graph
   * @param {string} [progress.message] — Human-readable progress message
   */
  updateProgress(taskId, progress) {
    const existing = this._persistence.get(TASKS_TABLE, taskId);
    if (!existing || existing.status !== TASK_STATUS.RUNNING) {
      return;
    }

    const merged = {
      percent: progress.percent ?? existing.progress?.percent ?? 0,
      currentNode:
        progress.currentNode ?? existing.progress?.currentNode ?? null,
      totalNodes: progress.totalNodes ?? existing.progress?.totalNodes ?? null,
      message: progress.message ?? existing.progress?.message ?? null,
    };

    this._persistUpdate(taskId, { progress: merged });
    this.emit("task:progress", { taskId, progress: merged });
  }

  // ─── Drain Queue ────────────────────────────────────────────

  /**
   * Try to start queued tasks up to the concurrency limit.
   * Called automatically when a running task completes.
   * @private
   */
  _drainQueue() {
    if (this._queue.size === 0) {
      if (this._running.size === 0) {
        this.emit("queue:drained");
      }
      return;
    }
    // Note: draining requires the caller to provide executeFn via start().
    // Automatic draining is only possible if executeFn was previously registered.
    // For now, emit an event so the orchestrator can call start() on the next task.
  }

  // ─── Helpers ────────────────────────────────────────────────

  /**
   * Persist an update to a task record.
   * @param {string} taskId
   * @param {object} fields
   * @private
   */
  _persistUpdate(taskId, fields) {
    try {
      this._persistence.update(TASKS_TABLE, taskId, fields);
    } catch (err) {
      log.error("Failed to persist task update", {
        taskId,
        error: err.message,
      });
    }
  }

  /**
   * Get the position of a task in the queue (1-based).
   * @param {string} taskId
   * @returns {number}
   * @private
   */
  _getQueuePosition(taskId) {
    const items = this._queue.toArray();
    const idx = items.findIndex((item) => item.id === taskId);
    return idx === -1 ? this._queue.size : idx + 1;
  }

  /**
   * Estimate when a task might start based on queue position.
   * @param {number} position — 1-based position
   * @returns {string} ISO timestamp estimate
   * @private
   */
  _estimateStart(position) {
    // Rough estimate: each task position adds ~30 seconds
    // In practice this depends on actual task durations
    const waitSlots = Math.max(0, position - this._maxConcurrent);
    const estimatedMs = waitSlots * 30000;
    return new Date(Date.now() + estimatedMs).toISOString();
  }

  /**
   * Assert the manager has not been destroyed.
   * @private
   */
  _assertNotDestroyed() {
    if (this._destroyed) {
      throw new Error("BackgroundTaskManager has been destroyed");
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  /**
   * Get a summary of the manager's current state.
   * @returns {{ queued: number, running: number, maxConcurrent: number }}
   */
  stats() {
    return {
      queued: this._queue.size,
      running: this._running.size,
      maxConcurrent: this._maxConcurrent,
    };
  }

  /**
   * Shut down the manager gracefully.
   * Running tasks are allowed to complete, but no new tasks can be submitted.
   */
  async destroy() {
    this._destroyed = true;

    // Cancel all queued tasks
    const queued = this._queue.toArray();
    for (const task of queued) {
      this.cancel(task.id);
    }

    // Wait for running tasks to finish (with a timeout)
    if (this._running.size > 0) {
      log.info("Waiting for running tasks to complete...", {
        count: this._running.size,
      });
      const promises = Array.from(this._running.values()).map(
        (entry) => entry.promise,
      );

      try {
        await Promise.allSettled(promises);
      } catch {
        // Errors already handled in _executeTask
      }
    }

    this.removeAllListeners();
    log.info("BackgroundTaskManager destroyed");
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  BackgroundTaskManager,
  TaskQueue,
  TaskRecovery,
  PRIORITY,
  TASK_STATUS,
  TASKS_TABLE,
  CHECKPOINT_TABLE,
  InMemoryPersistence,
};
