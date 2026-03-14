/**
 * CodeIn MAS — SQLite Store
 *
 * Provides SQLite-backed persistence for:
 * - Long-term memory (replaces JSON file)
 * - Background task queue
 * - Analytics / cost tracking
 *
 * Falls back to in-memory Map when better-sqlite3 is not available.
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

/** @type {import('better-sqlite3') | null} */
let Database = null;
try {
  Database = require("better-sqlite3");
} catch {
  // better-sqlite3 not installed — will use in-memory fallback
}

const MAX_VALUE_SIZE = 512 * 1024; // 512KB per entry

// ═══════════════════════════════════════════════════════════════
// 1. SQLite Memory Store (LongTermMemory replacement)
// ═══════════════════════════════════════════════════════════════

class SqliteMemoryStore {
  /**
   * @param {object} opts
   * @param {string} opts.workspaceHash
   * @param {boolean} opts.enabled
   */
  constructor({ workspaceHash, enabled = false }) {
    this._enabled = enabled;
    this._db = null;
    this._fallback = new Map();
    this._usingSqlite = false;

    if (!enabled) return;

    const basePath = path.join(os.homedir(), ".codein", "swarm", workspaceHash);

    if (Database) {
      try {
        fs.mkdirSync(basePath, { recursive: true });
        const dbPath = path.join(basePath, "memory.db");
        this._db = new Database(dbPath);
        this._db.pragma("journal_mode = WAL");
        this._db.pragma("synchronous = NORMAL");
        this._db.pragma("cache_size = -2000"); // 2MB cache

        this._db.exec(`
          CREATE TABLE IF NOT EXISTS memory (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            scope TEXT DEFAULT 'long_term',
            created_at INTEGER NOT NULL,
            accessed_at INTEGER NOT NULL,
            access_count INTEGER DEFAULT 0,
            tags TEXT DEFAULT '[]'
          );
          CREATE INDEX IF NOT EXISTS idx_memory_created ON memory(created_at);
          CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory(scope);
        `);

        this._stmts = {
          get: this._db.prepare("SELECT * FROM memory WHERE key = ?"),
          set: this._db.prepare(`
            INSERT OR REPLACE INTO memory (key, value, scope, created_at, accessed_at, access_count, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `),
          delete: this._db.prepare("DELETE FROM memory WHERE key = ?"),
          has: this._db.prepare("SELECT 1 FROM memory WHERE key = ?"),
          size: this._db.prepare("SELECT COUNT(*) as count FROM memory"),
          all: this._db.prepare(
            "SELECT key, value, created_at, accessed_at, access_count FROM memory ORDER BY accessed_at DESC",
          ),
          prune: this._db.prepare("DELETE FROM memory WHERE created_at < ?"),
          pruneSize: this._db.prepare(
            "DELETE FROM memory WHERE key IN (SELECT key FROM memory ORDER BY accessed_at ASC LIMIT ?)",
          ),
        };

        this._usingSqlite = true;
      } catch {
        // SQLite init failed — use fallback
        this._db = null;
      }
    }
  }

  get(key) {
    if (!this._enabled) return undefined;

    if (this._usingSqlite) {
      const row = this._stmts.get.get(key);
      if (!row) return undefined;

      // Update access stats (async, non-blocking)
      try {
        this._db
          .prepare(
            "UPDATE memory SET accessed_at = ?, access_count = access_count + 1 WHERE key = ?",
          )
          .run(Date.now(), key);
      } catch {
        // non-critical
      }

      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    }

    const entry = this._fallback.get(key);
    if (!entry) return undefined;
    entry.accessedAt = Date.now();
    entry.accessCount++;
    return entry.value;
  }

  set(key, value, opts = {}) {
    if (!this._enabled) return null;

    const serialized =
      typeof value === "string" ? value : JSON.stringify(value);
    if (serialized.length > MAX_VALUE_SIZE) {
      throw new Error(
        `Value too large: ${serialized.length} bytes (max ${MAX_VALUE_SIZE})`,
      );
    }

    const now = Date.now();
    const scope = opts.scope || "long_term";
    const tags = JSON.stringify(opts.tags || []);

    if (this._usingSqlite) {
      this._stmts.set.run(key, serialized, scope, now, now, 0, tags);
      return { key, scope, createdAt: now };
    }

    this._fallback.set(key, {
      value,
      scope,
      createdAt: now,
      accessedAt: now,
      accessCount: 0,
    });
    return { key, scope, createdAt: now };
  }

  has(key) {
    if (!this._enabled) return false;
    if (this._usingSqlite) {
      return !!this._stmts.has.get(key);
    }
    return this._fallback.has(key);
  }

  delete(key) {
    if (!this._enabled) return false;
    if (this._usingSqlite) {
      const result = this._stmts.delete.run(key);
      return result.changes > 0;
    }
    return this._fallback.delete(key);
  }

  size() {
    if (!this._enabled) return 0;
    if (this._usingSqlite) {
      return this._stmts.size.get().count;
    }
    return this._fallback.size;
  }

  /**
   * Prune entries older than maxAgeMs.
   * @param {number} maxAgeMs
   * @returns {number} — entries pruned
   */
  prune(maxAgeMs = 24 * 60 * 60 * 1000) {
    if (!this._enabled) return 0;

    const threshold = Date.now() - maxAgeMs;

    if (this._usingSqlite) {
      const result = this._stmts.prune.run(threshold);
      return result.changes;
    }

    let pruned = 0;
    for (const [key, entry] of this._fallback) {
      if (entry.createdAt < threshold) {
        this._fallback.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Enforce max entry count by evicting LRU entries.
   * @param {number} maxEntries
   */
  enforceLimit(maxEntries = 10000) {
    if (!this._enabled) return 0;
    const currentSize = this.size();
    if (currentSize <= maxEntries) return 0;
    const excess = currentSize - maxEntries;

    if (this._usingSqlite) {
      const result = this._stmts.pruneSize.run(excess);
      return result.changes;
    }

    // In-memory: sort by accessedAt and remove oldest
    const sorted = [...this._fallback.entries()].sort(
      ([, a], [, b]) => a.accessedAt - b.accessedAt,
    );
    let pruned = 0;
    for (let i = 0; i < excess && i < sorted.length; i++) {
      this._fallback.delete(sorted[i][0]);
      pruned++;
    }
    return pruned;
  }

  snapshot() {
    if (!this._enabled) return {};
    if (this._usingSqlite) {
      const rows = this._stmts.all.all();
      const result = {};
      for (const row of rows) {
        try {
          result[row.key] = {
            value: JSON.parse(row.value),
            createdAt: row.created_at,
            accessedAt: row.accessed_at,
            accessCount: row.access_count,
          };
        } catch {
          result[row.key] = { value: row.value, createdAt: row.created_at };
        }
      }
      return result;
    }

    const result = {};
    for (const [key, entry] of this._fallback) {
      result[key] = entry;
    }
    return result;
  }

  close() {
    if (this._db) {
      try {
        this._db.close();
      } catch {
        // ignore
      }
      this._db = null;
    }
  }

  get usingSqlite() {
    return this._usingSqlite;
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. SQLite Background Task Queue
// ═══════════════════════════════════════════════════════════════

class SqliteTaskQueue {
  /**
   * @param {object} opts
   * @param {string} opts.workspaceHash
   */
  constructor({ workspaceHash }) {
    this._db = null;
    this._fallback = [];
    this._usingSqlite = false;

    const basePath = path.join(os.homedir(), ".codein", "swarm", workspaceHash);

    if (Database) {
      try {
        fs.mkdirSync(basePath, { recursive: true });
        const dbPath = path.join(basePath, "tasks.db");
        this._db = new Database(dbPath);
        this._db.pragma("journal_mode = WAL");
        this._db.pragma("synchronous = NORMAL");

        this._db.exec(`
          CREATE TABLE IF NOT EXISTS bg_tasks (
            id TEXT PRIMARY KEY,
            goal TEXT NOT NULL,
            status TEXT DEFAULT 'queued',
            priority TEXT DEFAULT 'normal',
            mode TEXT DEFAULT 'standard',
            progress REAL DEFAULT 0,
            result TEXT,
            error TEXT,
            created_at INTEGER NOT NULL,
            started_at INTEGER,
            completed_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS idx_tasks_status ON bg_tasks(status);
          CREATE INDEX IF NOT EXISTS idx_tasks_priority ON bg_tasks(priority);
          CREATE INDEX IF NOT EXISTS idx_tasks_created ON bg_tasks(created_at);
        `);

        this._stmts = {
          insert: this._db.prepare(`
            INSERT INTO bg_tasks (id, goal, status, priority, mode, created_at)
            VALUES (?, ?, 'queued', ?, ?, ?)
          `),
          get: this._db.prepare("SELECT * FROM bg_tasks WHERE id = ?"),
          list: this._db.prepare(
            "SELECT * FROM bg_tasks ORDER BY created_at DESC",
          ),
          listByStatus: this._db.prepare(
            "SELECT * FROM bg_tasks WHERE status = ? ORDER BY created_at DESC",
          ),
          updateStatus: this._db.prepare(
            "UPDATE bg_tasks SET status = ?, started_at = CASE WHEN ? = 'running' THEN ? ELSE started_at END, completed_at = CASE WHEN ? IN ('completed','failed','cancelled') THEN ? ELSE completed_at END WHERE id = ?",
          ),
          updateProgress: this._db.prepare(
            "UPDATE bg_tasks SET progress = ? WHERE id = ?",
          ),
          setResult: this._db.prepare(
            "UPDATE bg_tasks SET result = ?, status = 'completed', completed_at = ? WHERE id = ?",
          ),
          setError: this._db.prepare(
            "UPDATE bg_tasks SET error = ?, status = 'failed', completed_at = ? WHERE id = ?",
          ),
          delete: this._db.prepare("DELETE FROM bg_tasks WHERE id = ?"),
          cleanup: this._db.prepare(
            "DELETE FROM bg_tasks WHERE status IN ('completed','failed','cancelled') AND completed_at < ?",
          ),
          nextQueued: this._db.prepare(`
            SELECT * FROM bg_tasks WHERE status = 'queued'
            ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, created_at ASC
            LIMIT 1
          `),
          count: this._db.prepare("SELECT COUNT(*) as count FROM bg_tasks"),
          countByStatus: this._db.prepare(
            "SELECT COUNT(*) as count FROM bg_tasks WHERE status = ?",
          ),
        };

        this._usingSqlite = true;
      } catch {
        this._db = null;
      }
    }
  }

  /**
   * Enqueue a new background task.
   */
  enqueue(task) {
    const id =
      task.id || `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    if (this._usingSqlite) {
      this._stmts.insert.run(
        id,
        task.goal,
        task.priority || "normal",
        task.mode || "standard",
        now,
      );
      const position = this._stmts.countByStatus.get("queued").count;
      return { taskId: id, position };
    }

    const entry = {
      id,
      goal: task.goal,
      status: "queued",
      priority: task.priority || "normal",
      mode: task.mode || "standard",
      progress: 0,
      result: null,
      error: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
    };
    this._fallback.push(entry);
    return {
      taskId: id,
      position: this._fallback.filter((t) => t.status === "queued").length,
    };
  }

  /**
   * Get a task by ID.
   */
  get(id) {
    if (this._usingSqlite) {
      const row = this._stmts.get.get(id);
      return row ? this._rowToTask(row) : null;
    }
    return this._fallback.find((t) => t.id === id) || null;
  }

  /**
   * List tasks, optionally filtered by status.
   */
  list(opts = {}) {
    if (this._usingSqlite) {
      const rows = opts.status
        ? this._stmts.listByStatus.all(opts.status)
        : this._stmts.list.all();
      return rows.map((r) => this._rowToTask(r));
    }

    let tasks = [...this._fallback];
    if (opts.status) {
      tasks = tasks.filter((t) => t.status === opts.status);
    }
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get next queued task (priority-ordered).
   */
  dequeue() {
    if (this._usingSqlite) {
      const row = this._stmts.nextQueued.get();
      if (!row) return null;
      const now = Date.now();
      this._stmts.updateStatus.run(
        "running",
        "running",
        now,
        "running",
        now,
        row.id,
      );
      return this._rowToTask({ ...row, status: "running", started_at: now });
    }

    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const queued = this._fallback
      .filter((t) => t.status === "queued")
      .sort(
        (a, b) =>
          (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1) ||
          a.createdAt - b.createdAt,
      );

    if (queued.length === 0) return null;
    const task = queued[0];
    task.status = "running";
    task.startedAt = Date.now();
    return task;
  }

  /**
   * Update task status.
   */
  updateStatus(id, status) {
    const now = Date.now();
    if (this._usingSqlite) {
      this._stmts.updateStatus.run(status, status, now, status, now, id);
      return;
    }
    const task = this._fallback.find((t) => t.id === id);
    if (task) {
      task.status = status;
      if (status === "running") task.startedAt = now;
      if (["completed", "failed", "cancelled"].includes(status))
        task.completedAt = now;
    }
  }

  /**
   * Update task progress (0-100).
   */
  updateProgress(id, progress) {
    if (this._usingSqlite) {
      this._stmts.updateProgress.run(progress, id);
      return;
    }
    const task = this._fallback.find((t) => t.id === id);
    if (task) task.progress = progress;
  }

  /**
   * Complete a task with result.
   */
  complete(id, result) {
    const now = Date.now();
    if (this._usingSqlite) {
      this._stmts.setResult.run(JSON.stringify(result), now, id);
      return;
    }
    const task = this._fallback.find((t) => t.id === id);
    if (task) {
      task.status = "completed";
      task.result = result;
      task.completedAt = now;
    }
  }

  /**
   * Fail a task with error.
   */
  fail(id, error) {
    const now = Date.now();
    if (this._usingSqlite) {
      this._stmts.setError.run(String(error), now, id);
      return;
    }
    const task = this._fallback.find((t) => t.id === id);
    if (task) {
      task.status = "failed";
      task.error = String(error);
      task.completedAt = now;
    }
  }

  /**
   * Cleanup old completed/failed tasks.
   * @param {number} maxAgeMs — default 7 days
   */
  cleanup(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const threshold = Date.now() - maxAgeMs;
    if (this._usingSqlite) {
      const result = this._stmts.cleanup.run(threshold);
      return result.changes;
    }

    const before = this._fallback.length;
    this._fallback = this._fallback.filter(
      (t) =>
        !["completed", "failed", "cancelled"].includes(t.status) ||
        (t.completedAt || 0) >= threshold,
    );
    return before - this._fallback.length;
  }

  /**
   * Get queue statistics.
   */
  stats() {
    if (this._usingSqlite) {
      return {
        total: this._stmts.count.get().count,
        queued: this._stmts.countByStatus.get("queued").count,
        running: this._stmts.countByStatus.get("running").count,
        completed: this._stmts.countByStatus.get("completed").count,
        failed: this._stmts.countByStatus.get("failed").count,
      };
    }

    const stats = {
      total: this._fallback.length,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    for (const t of this._fallback) {
      if (stats[t.status] !== undefined) stats[t.status]++;
    }
    return stats;
  }

  close() {
    if (this._db) {
      try {
        this._db.close();
      } catch {
        /* ignore */
      }
      this._db = null;
    }
  }

  _rowToTask(row) {
    return {
      id: row.id,
      goal: row.goal,
      status: row.status,
      priority: row.priority,
      mode: row.mode,
      progress: row.progress || 0,
      result: row.result
        ? (() => {
            try {
              return JSON.parse(row.result);
            } catch {
              return row.result;
            }
          })()
        : null,
      error: row.error || null,
      createdAt: new Date(row.created_at).toISOString(),
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at
        ? new Date(row.completed_at).toISOString()
        : null,
    };
  }

  get usingSqlite() {
    return this._usingSqlite;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. SQLite Analytics Store
// ═══════════════════════════════════════════════════════════════

class SqliteAnalyticsStore {
  constructor({ workspaceHash }) {
    this._db = null;
    this._fallback = { events: [], costs: [] };
    this._usingSqlite = false;

    const basePath = path.join(os.homedir(), ".codein", "swarm", workspaceHash);

    if (Database) {
      try {
        fs.mkdirSync(basePath, { recursive: true });
        const dbPath = path.join(basePath, "analytics.db");
        this._db = new Database(dbPath);
        this._db.pragma("journal_mode = WAL");
        this._db.pragma("synchronous = NORMAL");

        this._db.exec(`
          CREATE TABLE IF NOT EXISTS cost_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            agent_type TEXT,
            model TEXT,
            tokens_in INTEGER DEFAULT 0,
            tokens_out INTEGER DEFAULT 0,
            cost_usd REAL DEFAULT 0,
            timestamp INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_cost_session ON cost_events(session_id);
          CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_events(timestamp);
        `);

        this._stmts = {
          recordCost: this._db.prepare(`
            INSERT INTO cost_events (session_id, agent_type, model, tokens_in, tokens_out, cost_usd, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `),
          totalCost: this._db.prepare(
            "SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events",
          ),
          totalTokens: this._db.prepare(
            "SELECT COALESCE(SUM(tokens_in + tokens_out), 0) as total FROM cost_events",
          ),
          costByAgent: this._db.prepare(
            "SELECT agent_type, SUM(cost_usd) as cost FROM cost_events GROUP BY agent_type ORDER BY cost DESC",
          ),
          costByModel: this._db.prepare(
            "SELECT model, SUM(cost_usd) as cost FROM cost_events GROUP BY model ORDER BY cost DESC",
          ),
          sessionCost: this._db.prepare(
            "SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events WHERE session_id = ?",
          ),
          cleanup: this._db.prepare(
            "DELETE FROM cost_events WHERE timestamp < ?",
          ),
        };

        this._usingSqlite = true;
      } catch {
        this._db = null;
      }
    }
  }

  recordCost(event) {
    const now = Date.now();
    if (this._usingSqlite) {
      this._stmts.recordCost.run(
        event.sessionId || null,
        event.agentType || "unknown",
        event.model || "unknown",
        event.tokensIn || 0,
        event.tokensOut || 0,
        event.costUSD || 0,
        now,
      );
      return;
    }
    this._fallback.costs.push({ ...event, timestamp: now });
  }

  getAnalytics(sessionId) {
    if (this._usingSqlite) {
      const totalCost = sessionId
        ? this._stmts.sessionCost.get(sessionId).total
        : this._stmts.totalCost.get().total;
      const totalTokens = this._stmts.totalTokens.get().total;
      const costByAgent = {};
      for (const row of this._stmts.costByAgent.all()) {
        costByAgent[row.agent_type] = row.cost;
      }
      const costByModel = {};
      for (const row of this._stmts.costByModel.all()) {
        costByModel[row.model] = row.cost;
      }
      return { totalCost, totalTokens, costByAgent, costByModel, sessions: [] };
    }

    // Fallback
    const costs = sessionId
      ? this._fallback.costs.filter((c) => c.sessionId === sessionId)
      : this._fallback.costs;

    const totalCost = costs.reduce((s, c) => s + (c.costUSD || 0), 0);
    const totalTokens = costs.reduce(
      (s, c) => s + (c.tokensIn || 0) + (c.tokensOut || 0),
      0,
    );
    const costByAgent = {};
    const costByModel = {};
    for (const c of costs) {
      costByAgent[c.agentType || "unknown"] =
        (costByAgent[c.agentType || "unknown"] || 0) + (c.costUSD || 0);
      costByModel[c.model || "unknown"] =
        (costByModel[c.model || "unknown"] || 0) + (c.costUSD || 0);
    }
    return { totalCost, totalTokens, costByAgent, costByModel, sessions: [] };
  }

  cleanup(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
    const threshold = Date.now() - maxAgeMs;
    if (this._usingSqlite) {
      return this._stmts.cleanup.run(threshold).changes;
    }
    const before = this._fallback.costs.length;
    this._fallback.costs = this._fallback.costs.filter(
      (c) => c.timestamp >= threshold,
    );
    return before - this._fallback.costs.length;
  }

  close() {
    if (this._db) {
      try {
        this._db.close();
      } catch {
        /* ignore */
      }
      this._db = null;
    }
  }

  get usingSqlite() {
    return this._usingSqlite;
  }
}

module.exports = {
  SqliteMemoryStore,
  SqliteTaskQueue,
  SqliteAnalyticsStore,
};
