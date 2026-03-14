/**
 * CodeIn MAS — SQLite Persistence Layer
 *
 * Replaces in-memory Maps with durable storage for:
 *   - Sessions (task history, results)
 *   - Cost ledger (per-call, per-agent, per-task costs)
 *   - Events (audit trail, no more 2000-event cap)
 *   - Working memory snapshots
 *   - Workspace index cache
 *
 * Uses better-sqlite3 for synchronous, zero-latency local storage.
 * DB file: ~/.codein/swarm/codein.db
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { createLogger } = require("./logger");

const log = createLogger("Persistence");

let Database;
try {
  Database = require("better-sqlite3");
} catch {
  // Graceful fallback if better-sqlite3 not available (e.g., in test environments)
  Database = null;
}

// ═══════════════════════════════════════════════════════════════
// DB INITIALIZATION
// ═══════════════════════════════════════════════════════════════

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
-- Sessions: track task orchestration runs
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  mode TEXT DEFAULT 'implement',
  status TEXT DEFAULT 'queued',
  config_json TEXT,
  result_json TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  total_cost_usd REAL DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  node_count INTEGER DEFAULT 0,
  nodes_completed INTEGER DEFAULT 0,
  nodes_failed INTEGER DEFAULT 0
);

-- Cost ledger: every LLM call is recorded
CREATE TABLE IF NOT EXISTS cost_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  agent_id TEXT,
  agent_type TEXT,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  purpose TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Events: full audit trail (replaces capped in-memory array)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  type TEXT NOT NULL,
  agent_id TEXT,
  node_id TEXT,
  data_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Working memory snapshots: key-value per workspace
CREATE TABLE IF NOT EXISTS memory_store (
  workspace_hash TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_hash, key)
);

-- Workspace file index: cached file metadata for code intelligence
CREATE TABLE IF NOT EXISTS file_index (
  workspace_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  extension TEXT,
  size_bytes INTEGER,
  language TEXT,
  exports_json TEXT,
  imports_json TEXT,
  last_modified TEXT,
  indexed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_hash, file_path)
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cost_session ON cost_ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_ledger(agent_type);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_file_index_ws ON file_index(workspace_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
`;

/**
 * Open or create the CodeIn SQLite database.
 * @param {string} [dbPath] — Override path (for testing)
 * @returns {object} PersistenceStore instance
 */
function openDatabase(dbPath) {
  if (!Database) {
    log.warn("better-sqlite3 not available — using in-memory fallback");
    return createInMemoryFallback();
  }

  const resolvedPath =
    dbPath || path.join(os.homedir(), ".codein", "swarm", "codein.db");

  // Ensure directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);

  // Performance pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("cache_size = -8000"); // 8MB cache

  // Create schema
  db.exec(SCHEMA_SQL);

  // Check/set schema version
  const versionRow = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
    .get();
  if (!versionRow) {
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES ('version', ?)",
    ).run(String(SCHEMA_VERSION));
  }

  log.info("Database opened", { path: resolvedPath });

  return new PersistenceStore(db);
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE STORE
// ═══════════════════════════════════════════════════════════════

class PersistenceStore {
  constructor(db) {
    this._db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    const db = this._db;

    // Sessions
    this._insertSession = db.prepare(`
      INSERT INTO sessions (id, goal, mode, status, config_json, node_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this._updateSession = db.prepare(`
      UPDATE sessions
      SET status = ?, result_json = ?, error = ?, completed_at = datetime('now'),
          total_cost_usd = ?, total_tokens = ?, nodes_completed = ?, nodes_failed = ?
      WHERE id = ?
    `);
    this._getSession = db.prepare("SELECT * FROM sessions WHERE id = ?");
    this._listSessions = db.prepare(
      "SELECT id, goal, mode, status, created_at, completed_at, total_cost_usd, total_tokens FROM sessions ORDER BY created_at DESC LIMIT ?",
    );

    // Cost ledger
    this._insertCost = db.prepare(`
      INSERT INTO cost_ledger (session_id, agent_id, agent_type, model, input_tokens, output_tokens, total_tokens, cost_usd, duration_ms, purpose)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this._sessionCosts = db.prepare(
      "SELECT SUM(cost_usd) as total_cost, SUM(total_tokens) as total_tokens, COUNT(*) as call_count FROM cost_ledger WHERE session_id = ?",
    );
    this._costByAgent = db.prepare(
      "SELECT agent_type, SUM(cost_usd) as total_cost, SUM(total_tokens) as total_tokens, COUNT(*) as call_count FROM cost_ledger GROUP BY agent_type ORDER BY total_cost DESC",
    );
    this._costByModel = db.prepare(
      "SELECT model, SUM(cost_usd) as total_cost, SUM(total_tokens) as total_tokens, COUNT(*) as call_count FROM cost_ledger GROUP BY model ORDER BY total_cost DESC",
    );
    this._totalSpend = db.prepare(
      "SELECT SUM(cost_usd) as total FROM cost_ledger",
    );

    // Events
    this._insertEvent = db.prepare(`
      INSERT INTO events (id, session_id, type, agent_id, node_id, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    this._sessionEvents = db.prepare(
      "SELECT * FROM events WHERE session_id = ? ORDER BY created_at ASC LIMIT ?",
    );
    this._recentEvents = db.prepare(
      "SELECT * FROM events ORDER BY created_at DESC LIMIT ?",
    );

    // Memory store
    this._upsertMemory = db.prepare(`
      INSERT INTO memory_store (workspace_hash, key, value_json, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(workspace_hash, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
    `);
    this._getMemory = db.prepare(
      "SELECT value_json FROM memory_store WHERE workspace_hash = ? AND key = ?",
    );
    this._listMemory = db.prepare(
      "SELECT key, value_json, updated_at FROM memory_store WHERE workspace_hash = ?",
    );
    this._deleteMemory = db.prepare(
      "DELETE FROM memory_store WHERE workspace_hash = ? AND key = ?",
    );

    // File index
    this._upsertFile = db.prepare(`
      INSERT INTO file_index (workspace_hash, file_path, relative_path, extension, size_bytes, language, exports_json, imports_json, last_modified, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(workspace_hash, file_path) DO UPDATE SET
        size_bytes = excluded.size_bytes,
        language = excluded.language,
        exports_json = excluded.exports_json,
        imports_json = excluded.imports_json,
        last_modified = excluded.last_modified,
        indexed_at = datetime('now')
    `);
    this._getFileIndex = db.prepare(
      "SELECT * FROM file_index WHERE workspace_hash = ? ORDER BY relative_path",
    );
    this._searchFiles = db.prepare(
      "SELECT relative_path, language, extension FROM file_index WHERE workspace_hash = ? AND relative_path LIKE ? LIMIT ?",
    );
    this._clearFileIndex = db.prepare(
      "DELETE FROM file_index WHERE workspace_hash = ?",
    );
  }

  // ─── Sessions ─────────────────────────────────────────────

  createSession(id, goal, mode, config, nodeCount) {
    this._insertSession.run(
      id,
      goal,
      mode || "implement",
      "running",
      JSON.stringify(config || {}),
      nodeCount || 0,
    );
  }

  completeSession(id, status, result, error, costs) {
    this._updateSession.run(
      status,
      result ? JSON.stringify(result) : null,
      error || null,
      costs?.totalCostUSD || 0,
      costs?.totalTokens || 0,
      costs?.nodesCompleted || 0,
      costs?.nodesFailed || 0,
      id,
    );
  }

  getSession(id) {
    const row = this._getSession.get(id);
    if (!row) return null;
    return {
      ...row,
      config: row.config_json ? JSON.parse(row.config_json) : {},
      result: row.result_json ? JSON.parse(row.result_json) : null,
    };
  }

  listSessions(limit = 50) {
    return this._listSessions.all(limit);
  }

  // ─── Cost Tracking ───────────────────────────────────────

  recordCost(entry) {
    this._insertCost.run(
      entry.sessionId || null,
      entry.agentId || null,
      entry.agentType || null,
      entry.model || "unknown",
      entry.inputTokens || 0,
      entry.outputTokens || 0,
      entry.totalTokens || 0,
      entry.costUSD || 0,
      entry.durationMs || 0,
      entry.purpose || null,
    );
  }

  getSessionCosts(sessionId) {
    return this._sessionCosts.get(sessionId);
  }

  getCostByAgent() {
    return this._costByAgent.all();
  }

  getCostByModel() {
    return this._costByModel.all();
  }

  getTotalSpend() {
    const row = this._totalSpend.get();
    return row?.total || 0;
  }

  // ─── Events ──────────────────────────────────────────────

  recordEvent(event) {
    this._insertEvent.run(
      event.id,
      event.taskId || event.sessionId || null,
      event.type,
      event.agentId || null,
      event.nodeId || null,
      JSON.stringify(event.data || {}),
      event.timestamp || new Date().toISOString(),
    );
  }

  getSessionEvents(sessionId, limit = 500) {
    return this._sessionEvents.all(sessionId, limit).map((row) => ({
      ...row,
      data: row.data_json ? JSON.parse(row.data_json) : {},
    }));
  }

  getRecentEvents(limit = 100) {
    return this._recentEvents.all(limit).map((row) => ({
      ...row,
      data: row.data_json ? JSON.parse(row.data_json) : {},
    }));
  }

  // ─── Memory Store ────────────────────────────────────────

  setMemory(workspaceHash, key, value) {
    this._upsertMemory.run(workspaceHash, key, JSON.stringify(value));
  }

  getMemory(workspaceHash, key) {
    const row = this._getMemory.get(workspaceHash, key);
    if (!row) return undefined;
    try {
      return JSON.parse(row.value_json);
    } catch {
      return row.value_json;
    }
  }

  listMemory(workspaceHash) {
    return this._listMemory.all(workspaceHash).map((row) => ({
      key: row.key,
      value: JSON.parse(row.value_json),
      updatedAt: row.updated_at,
    }));
  }

  deleteMemory(workspaceHash, key) {
    this._deleteMemory.run(workspaceHash, key);
  }

  // ─── File Index ──────────────────────────────────────────

  indexFile(workspaceHash, entry) {
    this._upsertFile.run(
      workspaceHash,
      entry.filePath,
      entry.relativePath,
      entry.extension || null,
      entry.sizeBytes || 0,
      entry.language || null,
      entry.exports ? JSON.stringify(entry.exports) : null,
      entry.imports ? JSON.stringify(entry.imports) : null,
      entry.lastModified || null,
    );
  }

  indexFiles(workspaceHash, entries) {
    const insertMany = this._db.transaction((items) => {
      for (const entry of items) {
        this.indexFile(workspaceHash, entry);
      }
    });
    insertMany(entries);
  }

  getFileIndex(workspaceHash) {
    return this._getFileIndex.all(workspaceHash).map((row) => ({
      ...row,
      exports: row.exports_json ? JSON.parse(row.exports_json) : [],
      imports: row.imports_json ? JSON.parse(row.imports_json) : [],
    }));
  }

  searchFiles(workspaceHash, pattern, limit = 50) {
    return this._searchFiles.all(workspaceHash, `%${pattern}%`, limit);
  }

  clearFileIndex(workspaceHash) {
    this._clearFileIndex.run(workspaceHash);
  }

  // ─── Analytics ───────────────────────────────────────────

  getAnalytics() {
    const db = this._db;
    const sessions = db
      .prepare(
        "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed FROM sessions",
      )
      .get();
    const costs = db
      .prepare(
        "SELECT SUM(cost_usd) as total_cost, SUM(total_tokens) as total_tokens, COUNT(*) as total_calls FROM cost_ledger",
      )
      .get();
    const costByDay = db
      .prepare(
        "SELECT date(created_at) as day, SUM(cost_usd) as cost, COUNT(*) as calls FROM cost_ledger GROUP BY date(created_at) ORDER BY day DESC LIMIT 30",
      )
      .all();

    return {
      sessions: sessions || { total: 0, completed: 0, failed: 0 },
      costs: costs || { total_cost: 0, total_tokens: 0, total_calls: 0 },
      costByDay,
      costByAgent: this.getCostByAgent(),
      costByModel: this.getCostByModel(),
    };
  }

  // ─── Lifecycle ───────────────────────────────────────────

  close() {
    if (this._db) {
      this._db.close();
      log.info("Database closed");
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY FALLBACK (for environments without better-sqlite3)
// ═══════════════════════════════════════════════════════════════

function createInMemoryFallback() {
  const sessions = new Map();
  const costs = [];
  const events = [];
  const memory = new Map();

  return {
    createSession(id, goal, mode) {
      sessions.set(id, {
        id,
        goal,
        mode,
        status: "running",
        created_at: new Date().toISOString(),
      });
    },
    completeSession(id, status, result, error, costData) {
      const s = sessions.get(id);
      if (s) Object.assign(s, { status, result, error, ...costData });
    },
    getSession(id) {
      return sessions.get(id) || null;
    },
    listSessions(limit = 50) {
      return [...sessions.values()].slice(-limit).reverse();
    },
    recordCost(entry) {
      costs.push({ ...entry, created_at: new Date().toISOString() });
    },
    getSessionCosts(sessionId) {
      const sc = costs.filter((c) => c.sessionId === sessionId);
      return {
        total_cost: sc.reduce((s, c) => s + (c.costUSD || 0), 0),
        total_tokens: sc.reduce((s, c) => s + (c.totalTokens || 0), 0),
        call_count: sc.length,
      };
    },
    getCostByAgent() {
      return [];
    },
    getCostByModel() {
      return [];
    },
    getTotalSpend() {
      return costs.reduce((s, c) => s + (c.costUSD || 0), 0);
    },
    recordEvent(event) {
      events.push(event);
      if (events.length > 5000) events.splice(0, events.length - 5000);
    },
    getSessionEvents(sessionId) {
      return events.filter(
        (e) => e.taskId === sessionId || e.sessionId === sessionId,
      );
    },
    getRecentEvents(limit = 100) {
      return events.slice(-limit).reverse();
    },
    setMemory(wsHash, key, value) {
      memory.set(`${wsHash}:${key}`, value);
    },
    getMemory(wsHash, key) {
      return memory.get(`${wsHash}:${key}`);
    },
    listMemory(wsHash) {
      return [...memory.entries()]
        .filter(([k]) => k.startsWith(wsHash + ":"))
        .map(([k, v]) => ({ key: k.slice(wsHash.length + 1), value: v }));
    },
    deleteMemory(wsHash, key) {
      memory.delete(`${wsHash}:${key}`);
    },
    indexFile() {},
    indexFiles() {},
    getFileIndex() {
      return [];
    },
    searchFiles() {
      return [];
    },
    clearFileIndex() {},
    getAnalytics() {
      return {
        sessions: { total: 0, completed: 0, failed: 0 },
        costs: { total_cost: 0, total_tokens: 0, total_calls: 0 },
        costByDay: [],
        costByAgent: [],
        costByModel: [],
      };
    },
    close() {},
  };
}

module.exports = { openDatabase, PersistenceStore };
