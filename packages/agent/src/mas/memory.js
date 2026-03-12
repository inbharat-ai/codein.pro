/**
 * CodIn Multi-Agent Swarm — Memory Engine
 *
 * Three-tier memory system: ShortTerm → Working → LongTerm
 * With lifecycle hooks, pruning, compression, and secret stripping.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {
  MEMORY_SCOPE,
  EVENT_TYPE,
  createSwarmEvent,
  createMemoryEntry,
} = require("./types");

// ─── Constants ───────────────────────────────────────────────
const SHORT_TERM_DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
const LONG_TERM_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const LONG_TERM_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|token|password|credential|auth)[\s]*[:=]\s*["']?[^\s"',}{]{8,}/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, // JWT
];

// ═══════════════════════════════════════════════════════════════
// 1. SECRET STRIPPING
// ═══════════════════════════════════════════════════════════════

function stripSecrets(value) {
  if (typeof value === "string") {
    let cleaned = value;
    for (const pattern of SECRET_PATTERNS) {
      cleaned = cleaned.replace(pattern, "[REDACTED]");
    }
    return cleaned;
  }
  if (Array.isArray(value)) {
    return value.map(stripSecrets);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      const keyLower = k.toLowerCase();
      if (
        keyLower.includes("secret") ||
        keyLower.includes("password") ||
        keyLower.includes("token") ||
        keyLower.includes("api_key") ||
        keyLower.includes("apikey") ||
        keyLower.includes("credential")
      ) {
        result[k] = "[REDACTED]";
      } else {
        result[k] = stripSecrets(v);
      }
    }
    return result;
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════
// 2. SHORT-TERM MEMORY
// ═══════════════════════════════════════════════════════════════

class ShortTermMemory {
  constructor(defaultTTLMs = SHORT_TERM_DEFAULT_TTL) {
    this._store = new Map();
    this._defaultTTLMs = defaultTTLMs;
    this._pruneInterval = setInterval(() => this.prune(), 60000);
    // Allow Node to exit even if interval is running
    if (this._pruneInterval.unref) this._pruneInterval.unref();
  }

  set(key, value, ttlMs = null) {
    const entry = createMemoryEntry({
      scope: MEMORY_SCOPE.SHORT_TERM,
      key,
      value: stripSecrets(value),
      ttlMs: ttlMs || this._defaultTTLMs,
    });
    this._store.set(key, entry);
    return entry;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    entry.accessedAt = Date.now();
    entry.accessCount++;
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this._store.delete(key);
  }

  keys() {
    this.prune();
    return [...this._store.keys()];
  }

  size() {
    this.prune();
    return this._store.size;
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this._store.delete(key);
      }
    }
    return this._store.size;
  }

  clear() {
    this._store.clear();
  }

  destroy() {
    clearInterval(this._pruneInterval);
    this._store.clear();
  }

  snapshot() {
    this.prune();
    const result = {};
    for (const [key, entry] of this._store) {
      result[key] = entry;
    }
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. WORKING MEMORY
// ═══════════════════════════════════════════════════════════════

class WorkingMemory {
  constructor() {
    this._store = new Map();
    this._history = []; // decision log
    this._maxHistory = 500;
  }

  set(key, value) {
    const entry = createMemoryEntry({
      scope: MEMORY_SCOPE.WORKING,
      key,
      value: stripSecrets(value),
    });
    this._store.set(key, entry);
    return entry;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    entry.accessedAt = Date.now();
    entry.accessCount++;
    return entry.value;
  }

  has(key) {
    return this._store.has(key);
  }

  delete(key) {
    return this._store.delete(key);
  }

  /** Append a decision to the working history (for plan/decision tracking). */
  recordDecision(decision) {
    this._history.push({
      ...stripSecrets(decision),
      timestamp: new Date().toISOString(),
    });
    if (this._history.length > this._maxHistory) {
      this._history = this._history.slice(-this._maxHistory);
    }
  }

  getDecisionHistory() {
    return [...this._history];
  }

  /** Store/update the current plan. */
  setPlan(plan) {
    this.set("__plan__", plan);
  }

  getPlan() {
    return this.get("__plan__");
  }

  /** Store file summary for context sharing between agents. */
  setFileSummary(filePath, summary) {
    const summaries = this.get("__file_summaries__") || {};
    summaries[filePath] = summary;
    this.set("__file_summaries__", summaries);
  }

  getFileSummary(filePath) {
    const summaries = this.get("__file_summaries__") || {};
    return summaries[filePath];
  }

  /** Store permission decisions for session persistence. */
  setPermissionGrant(permissionKey, grant) {
    const grants = this.get("__permission_grants__") || {};
    grants[permissionKey] = grant;
    this.set("__permission_grants__", grants);
  }

  getPermissionGrant(permissionKey) {
    const grants = this.get("__permission_grants__") || {};
    return grants[permissionKey] || null;
  }

  /** Clear all cached permission grants (called on swarm shutdown). */
  clearPermissionGrants() {
    this.delete("__permission_grants__");
  }

  /** Budget tracking. */
  trackCost(amount) {
    const budget = this.get("__budget__") || { spent: 0, cap: 2.0 };
    budget.spent += amount;
    this.set("__budget__", budget);
    return budget;
  }

  getBudget() {
    return this.get("__budget__") || { spent: 0, cap: 2.0 };
  }

  /** Language preference. */
  setLanguage(lang) {
    this.set("__language__", lang);
  }

  getLanguage() {
    return this.get("__language__") || "en";
  }

  size() {
    return this._store.size;
  }

  clear() {
    this._store.clear();
    this._history = [];
  }

  snapshot() {
    const result = {};
    for (const [key, entry] of this._store) {
      result[key] = entry;
    }
    return { entries: result, decisionHistory: [...this._history] };
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. LONG-TERM MEMORY
// ═══════════════════════════════════════════════════════════════

class LongTermMemory {
  /**
   * @param {object} opts
   * @param {string} opts.workspaceHash — Unique workspace identifier
   * @param {boolean} [opts.enabled] — Opt-in (default false)
   */
  constructor({ workspaceHash, enabled = false }) {
    this._enabled = enabled;
    this._basePath = path.join(os.homedir(), ".codein", "swarm", workspaceHash);
    this._filePath = path.join(this._basePath, "memory.json");
    this._store = new Map();
    this._dirty = false;

    if (this._enabled) {
      this._ensureDir();
      this._load();
    }
  }

  _ensureDir() {
    fs.mkdirSync(this._basePath, { recursive: true });
  }

  _load() {
    try {
      if (fs.existsSync(this._filePath)) {
        const raw = fs.readFileSync(this._filePath, "utf8");
        const data = JSON.parse(raw);
        if (data && typeof data === "object") {
          for (const [key, entry] of Object.entries(data)) {
            this._store.set(key, entry);
          }
        }
      }
    } catch {
      // Corrupted file — start fresh
      this._store.clear();
    }
  }

  _save() {
    if (!this._enabled || !this._dirty) return;
    try {
      this._ensureDir();
      const obj = {};
      for (const [key, entry] of this._store) {
        obj[key] = entry;
      }
      const json = JSON.stringify(obj, null, 2);
      // Enforce max size
      if (Buffer.byteLength(json, "utf8") > LONG_TERM_MAX_SIZE) {
        this.prune();
        return this._save(); // recurse once after pruning (will be smaller)
      }
      fs.writeFileSync(this._filePath, json, "utf8");
      this._dirty = false;
    } catch {
      // Silently fail file write — don't crash the swarm
    }
  }

  set(key, value) {
    if (!this._enabled) return null;
    const entry = createMemoryEntry({
      scope: MEMORY_SCOPE.LONG_TERM,
      key,
      value: stripSecrets(value),
    });
    this._store.set(key, entry);
    this._dirty = true;
    this._save();
    return entry;
  }

  get(key) {
    if (!this._enabled) return undefined;
    const entry = this._store.get(key);
    if (!entry) return undefined;
    entry.accessedAt = Date.now();
    entry.accessCount++;
    this._dirty = true;
    return entry.value;
  }

  has(key) {
    if (!this._enabled) return false;
    return this._store.has(key);
  }

  delete(key) {
    if (!this._enabled) return false;
    const result = this._store.delete(key);
    if (result) {
      this._dirty = true;
      this._save();
    }
    return result;
  }

  /** Prune entries older than 24 hours. */
  prune() {
    if (!this._enabled) return 0;
    const threshold = Date.now() - LONG_TERM_MAX_AGE;
    let pruned = 0;
    for (const [key, entry] of this._store) {
      if (entry.createdAt < threshold) {
        this._store.delete(key);
        pruned++;
      }
    }
    if (pruned > 0) {
      this._dirty = true;
      this._save();
    }
    return pruned;
  }

  size() {
    return this._store.size;
  }

  clear() {
    this._store.clear();
    this._dirty = true;
    this._save();
  }

  destroy() {
    this._store.clear();
    try {
      if (fs.existsSync(this._filePath)) {
        fs.unlinkSync(this._filePath);
      }
    } catch {
      // ignore
    }
  }

  snapshot() {
    const result = {};
    for (const [key, entry] of this._store) {
      result[key] = entry;
    }
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. BLACKBOARD — Inter-agent message bus
// ═══════════════════════════════════════════════════════════════

class Blackboard {
  constructor() {
    /** @type {Array<{ from: string, to: string|null, topic: string, payload: any, ts: string }>} */
    this._messages = [];
    /** @type {Map<string, any>} */
    this._shared = new Map();
  }

  /**
   * Post a message to a specific agent or broadcast to all.
   * @param {string} from — Sender agent ID
   * @param {string|null} to — Recipient agent ID, or null for broadcast
   * @param {string} topic — Message topic / channel
   * @param {any} payload — Message content
   */
  post(from, to, topic, payload) {
    this._messages.push({
      from,
      to,
      topic,
      payload: stripSecrets(payload),
      ts: new Date().toISOString(),
    });
  }

  /**
   * Read messages addressed to a specific agent (direct + broadcast).
   * @param {string} agentId
   * @param {string} [topic] — Optional topic filter
   * @returns {Array}
   */
  read(agentId, topic) {
    return this._messages.filter((m) => {
      const addressed = m.to === agentId || m.to === null;
      const topicMatch = !topic || m.topic === topic;
      return addressed && topicMatch;
    });
  }

  /**
   * Set a shared key-value visible to all agents.
   * @param {string} key
   * @param {any} value
   */
  setShared(key, value) {
    this._shared.set(key, stripSecrets(value));
  }

  /**
   * Get a shared value.
   * @param {string} key
   * @returns {any}
   */
  getShared(key) {
    return this._shared.get(key);
  }

  /** All shared entries as plain object. */
  snapshot() {
    return {
      messages: this._messages.length,
      shared: Object.fromEntries(this._shared),
    };
  }

  clear() {
    this._messages = [];
    this._shared.clear();
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. MEMORY MANAGER (Unified interface + hooks)
// ═══════════════════════════════════════════════════════════════

class MemoryManager {
  /**
   * @param {object} opts
   * @param {string} opts.workspaceHash
   * @param {boolean} [opts.longTermEnabled]
   * @param {function} [opts.emitEvent] — Callback to emit SwarmEvents
   */
  constructor({ workspaceHash, longTermEnabled = false, emitEvent = null }) {
    this.shortTerm = new ShortTermMemory();
    this.working = new WorkingMemory();
    this.longTerm = new LongTermMemory({
      workspaceHash,
      enabled: longTermEnabled,
    });
    this.blackboard = new Blackboard();
    this._emitEvent = emitEvent;
  }

  _emit(type, data) {
    if (this._emitEvent) {
      this._emitEvent(createSwarmEvent({ type, data }));
    }
  }

  // ─── Lifecycle Hooks ─────────────────────────────────────

  onSwarmInit(config) {
    this.working.set("swarm_config", config);
    this.working.set("swarm_started_at", new Date().toISOString());
    this._emit(EVENT_TYPE.MEMORY_SAVED, { hook: "onSwarmInit" });
  }

  onTaskStart(taskGraph) {
    this.working.setPlan(taskGraph);
    this.shortTerm.set(
      `task:${taskGraph.id}:started`,
      new Date().toISOString(),
    );
    this._emit(EVENT_TYPE.MEMORY_SAVED, {
      hook: "onTaskStart",
      taskId: taskGraph.id,
    });
  }

  onNodeStart(node) {
    this.shortTerm.set(`node:${node.id}:started`, new Date().toISOString());
    this._emit(EVENT_TYPE.MEMORY_SAVED, {
      hook: "onNodeStart",
      nodeId: node.id,
    });
  }

  onNodeEnd(node) {
    this.shortTerm.set(`node:${node.id}:ended`, new Date().toISOString());
    this.shortTerm.set(`node:${node.id}:status`, node.status);
    if (node.result) {
      this.shortTerm.set(
        `node:${node.id}:result_summary`,
        typeof node.result === "string"
          ? node.result.slice(0, 500)
          : JSON.stringify(node.result).slice(0, 500),
      );
    }
    this._emit(EVENT_TYPE.MEMORY_SAVED, {
      hook: "onNodeEnd",
      nodeId: node.id,
      status: node.status,
    });
  }

  onPatchApplied(nodeId, patch, filePath) {
    const key = `patch:${nodeId}:${Date.now()}`;
    this.shortTerm.set(key, {
      filePath,
      patchSummary: JSON.stringify(patch).slice(0, 300),
    });
    this._emit(EVENT_TYPE.MEMORY_SAVED, {
      hook: "onPatchApplied",
      nodeId,
      filePath,
    });
  }

  onPermissionDecision(nodeId, permissionType, decision) {
    const key = `perm:${nodeId}:${permissionType}`;
    this.shortTerm.set(key, decision);
    this.working.recordDecision({
      type: "permission",
      nodeId,
      permissionType,
      decision,
    });

    // If approve_always, put in working memory for session persistence
    if (decision === "approve_always") {
      this.working.setPermissionGrant(`${permissionType}`, "approve_always");
    }
    this._emit(EVENT_TYPE.MEMORY_SAVED, {
      hook: "onPermissionDecision",
      nodeId,
      permissionType,
      decision,
    });
  }

  onTaskComplete(taskGraph) {
    this.shortTerm.set(
      `task:${taskGraph.id}:completed`,
      new Date().toISOString(),
    );
    this.shortTerm.set(`task:${taskGraph.id}:status`, taskGraph.status);
    this.working.recordDecision({
      type: "task_complete",
      taskId: taskGraph.id,
      status: taskGraph.status,
      nodesCompleted: taskGraph.metadata.nodesCompleted,
    });
    // Persist summary to long-term
    this.longTerm.set(`task:${taskGraph.id}`, {
      goal: taskGraph.goal,
      status: taskGraph.status,
      nodesCompleted: taskGraph.metadata.nodesCompleted,
      totalCostUSD: taskGraph.metadata.totalCostUSD,
      completedAt: taskGraph.completedAt,
    });
    this._emit(EVENT_TYPE.MEMORY_SAVED, {
      hook: "onTaskComplete",
      taskId: taskGraph.id,
    });
  }

  // ─── Unified Query ───────────────────────────────────────

  usage() {
    return {
      shortTerm: { entries: this.shortTerm.size() },
      working: {
        entries: this.working.size(),
        decisions: this.working.getDecisionHistory().length,
        budget: this.working.getBudget(),
        language: this.working.getLanguage(),
      },
      longTerm: {
        entries: this.longTerm.size(),
        enabled: this.longTerm._enabled,
      },
    };
  }

  /** Prune all tiers. */
  pruneAll() {
    const shortPruned = this.shortTerm.prune();
    const longPruned = this.longTerm.prune();
    if (shortPruned > 0 || longPruned > 0) {
      this._emit(EVENT_TYPE.MEMORY_PRUNED, { shortPruned, longPruned });
    }
    return { shortPruned, longPruned };
  }

  /** Full teardown. */
  destroy() {
    this.shortTerm.destroy();
    // Clear session-scoped permission grants to prevent stale approvals
    this.working.clearPermissionGrants();
    this.working.clear();
    this.blackboard.clear();
    // LongTerm: don't destroy persisted data on normal shutdown
  }
}

module.exports = {
  stripSecrets,
  ShortTermMemory,
  WorkingMemory,
  LongTermMemory,
  Blackboard,
  MemoryManager,
  SHORT_TERM_DEFAULT_TTL,
  LONG_TERM_MAX_AGE,
  LONG_TERM_MAX_SIZE,
};
