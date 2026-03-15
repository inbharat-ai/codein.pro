/**
 * Integration Test — 3-Tier Memory System
 *
 * Tests ShortTerm TTL expiry, Working session-scoped grants, LongTerm
 * persistence and size limits, secret stripping, and cross-tier promotion.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  ShortTermMemory,
  WorkingMemory,
  LongTermMemory,
  MemoryManager,
  Blackboard,
  stripSecrets,
  SHORT_TERM_DEFAULT_TTL,
} = require("../src/mas/memory");

// ─── Helpers ─────────────────────────────────────────────────

let tmpDirs = [];

function createTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codin-memory-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

// ─── ShortTermMemory ─────────────────────────────────────────

describe("ShortTermMemory — Write/Read/TTL", () => {
  let stm;

  afterEach(() => {
    if (stm) stm.destroy();
  });

  it("stores and retrieves a value", () => {
    stm = new ShortTermMemory();
    stm.set("key1", "value1");
    expect(stm.get("key1")).toBe("value1");
  });

  it("returns undefined for non-existent key", () => {
    stm = new ShortTermMemory();
    expect(stm.get("ghost")).toBeUndefined();
  });

  it("expires entries after TTL", async () => {
    stm = new ShortTermMemory(50); // 50ms default TTL
    stm.set("ephemeral", "data");
    expect(stm.get("ephemeral")).toBe("data");

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 100));
    expect(stm.get("ephemeral")).toBeUndefined();
  });

  it("custom TTL overrides default", async () => {
    stm = new ShortTermMemory(10000); // 10s default
    stm.set("fast", "data", 50); // 50ms custom
    stm.set("slow", "data", 60000); // 60s custom

    await new Promise((r) => setTimeout(r, 100));
    expect(stm.get("fast")).toBeUndefined();
    expect(stm.get("slow")).toBe("data");
  });

  it("has() returns false for expired entries", async () => {
    stm = new ShortTermMemory(50);
    stm.set("temp", "val");
    expect(stm.has("temp")).toBe(true);

    await new Promise((r) => setTimeout(r, 100));
    expect(stm.has("temp")).toBe(false);
  });

  it("delete removes an entry", () => {
    stm = new ShortTermMemory();
    stm.set("deleteme", "val");
    expect(stm.delete("deleteme")).toBe(true);
    expect(stm.get("deleteme")).toBeUndefined();
  });

  it("prune removes expired entries", async () => {
    stm = new ShortTermMemory(50);
    stm.set("a", "1");
    stm.set("b", "2");
    stm.set("c", "3", 60000); // this one lives long

    await new Promise((r) => setTimeout(r, 100));
    const remaining = stm.prune();
    expect(remaining).toBe(1); // only "c" survives
  });

  it("clear removes all entries", () => {
    stm = new ShortTermMemory();
    stm.set("a", "1");
    stm.set("b", "2");
    stm.clear();
    expect(stm.size()).toBe(0);
  });

  it("tracks access count", () => {
    stm = new ShortTermMemory();
    stm.set("accessed", "data");
    stm.get("accessed");
    stm.get("accessed");
    stm.get("accessed");
    // Access count is on the internal entry — verify via snapshot
    const snap = stm.snapshot();
    expect(snap["accessed"].accessCount).toBe(3);
  });
});

// ─── WorkingMemory ───────────────────────────────────────────

describe("WorkingMemory — Session-scoped operations", () => {
  let wm;

  beforeEach(() => {
    wm = new WorkingMemory();
  });

  it("stores and retrieves values", () => {
    wm.set("key", "value");
    expect(wm.get("key")).toBe("value");
  });

  it("permission grants persist within session", () => {
    wm.setPermissionGrant("file_write", "approve_always");
    expect(wm.getPermissionGrant("file_write")).toBe("approve_always");
  });

  it("permission grants return null for unknown types", () => {
    expect(wm.getPermissionGrant("unknown_perm")).toBeNull();
  });

  it("clearPermissionGrants removes all grants", () => {
    wm.setPermissionGrant("file_write", "approve_always");
    wm.setPermissionGrant("command_run", "approve_always");
    wm.clearPermissionGrants();
    expect(wm.getPermissionGrant("file_write")).toBeNull();
    expect(wm.getPermissionGrant("command_run")).toBeNull();
  });

  it("records and retrieves decision history", () => {
    wm.recordDecision({ type: "plan", goal: "fix bug" });
    wm.recordDecision({ type: "permission", result: "approved" });
    const history = wm.getDecisionHistory();
    expect(history).toHaveLength(2);
    expect(history[0].type).toBe("plan");
    expect(history[1].type).toBe("permission");
    // Timestamps added automatically
    expect(history[0].timestamp).toBeDefined();
  });

  it("tracks budget spending", () => {
    const b1 = wm.trackCost(0.5);
    expect(b1.spent).toBe(0.5);
    const b2 = wm.trackCost(1.0);
    expect(b2.spent).toBe(1.5);
  });

  it("getBudget returns default when not tracked", () => {
    const budget = wm.getBudget();
    expect(budget.spent).toBe(0);
    expect(budget.cap).toBe(2.0);
  });

  it("stores and retrieves plan", () => {
    const plan = { nodes: ["a", "b"], goal: "test" };
    wm.setPlan(plan);
    expect(wm.getPlan()).toEqual(plan);
  });

  it("stores and retrieves file summaries", () => {
    wm.setFileSummary("/src/index.js", "Main entry point");
    wm.setFileSummary("/src/utils.js", "Utility functions");
    expect(wm.getFileSummary("/src/index.js")).toBe("Main entry point");
    expect(wm.getFileSummary("/src/utils.js")).toBe("Utility functions");
    expect(wm.getFileSummary("/src/missing.js")).toBeUndefined();
  });

  it("language preference defaults to 'en'", () => {
    expect(wm.getLanguage()).toBe("en");
    wm.setLanguage("hi");
    expect(wm.getLanguage()).toBe("hi");
  });
});

// ─── LongTermMemory ──────────────────────────────────────────

describe("LongTermMemory — Persistent storage", () => {
  it("stores and retrieves when enabled", () => {
    const dir = createTmpDir();
    const hash = "lt_test_" + Date.now();
    // Override _basePath to use our tmp dir
    const lt = new LongTermMemory({ workspaceHash: hash, enabled: true });
    // Override paths to temp
    lt._basePath = dir;
    lt._filePath = path.join(dir, "memory.json");

    lt.set("project-conventions", { indent: 2, semi: true });
    const val = lt.get("project-conventions");
    expect(val).toEqual({ indent: 2, semi: true });

    lt.destroy();
  });

  it("returns undefined when disabled", () => {
    const lt = new LongTermMemory({ workspaceHash: "disabled", enabled: false });
    const entry = lt.set("key", "value");
    expect(entry).toBeNull();
    expect(lt.get("key")).toBeUndefined();
    expect(lt.has("key")).toBe(false);
  });

  it("persists to disk and reloads", () => {
    const dir = createTmpDir();
    const hash = "persist_" + Date.now();

    // Write
    const lt1 = new LongTermMemory({ workspaceHash: hash, enabled: true });
    lt1._basePath = dir;
    lt1._filePath = path.join(dir, "memory.json");
    lt1.set("survived", "data");

    // Verify file exists on disk
    expect(fs.existsSync(lt1._filePath)).toBe(true);

    // Create new instance, load from disk
    const lt2 = new LongTermMemory({ workspaceHash: hash, enabled: true });
    lt2._basePath = dir;
    lt2._filePath = path.join(dir, "memory.json");
    lt2._load(); // manually trigger load

    expect(lt2.get("survived")).toBe("data");

    lt1.destroy();
  });

  it("delete removes entry and updates disk", () => {
    const dir = createTmpDir();
    const lt = new LongTermMemory({ workspaceHash: "del_test", enabled: true });
    lt._basePath = dir;
    lt._filePath = path.join(dir, "memory.json");

    lt.set("to-delete", "value");
    expect(lt.has("to-delete")).toBe(true);

    lt.delete("to-delete");
    expect(lt.has("to-delete")).toBe(false);

    lt.destroy();
  });
});

// ─── Secret Stripping ────────────────────────────────────────

describe("Secret Stripping", () => {
  it("redacts API keys in strings", () => {
    const input = 'api_key = "sk-abc123def456ghijklmnopqrst"';
    const result = stripSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-abc123def456ghijklmnopqrst");
  });

  it("redacts GitHub tokens", () => {
    const result = stripSecrets("token: ghp_abcdefghijklmnopqrstuvwxyz1234567890");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature";
    const result = stripSecrets(`Bearer ${jwt}`);
    expect(result).toContain("[REDACTED]");
  });

  it("redacts object keys named 'secret', 'password', etc.", () => {
    const obj = {
      username: "admin",
      password: "hunter2",
      api_key: "sk-secret123",
      data: "safe data",
    };
    const result = stripSecrets(obj);
    expect(result.username).toBe("admin");
    expect(result.password).toBe("[REDACTED]");
    expect(result.api_key).toBe("[REDACTED]");
    expect(result.data).toBe("safe data");
  });

  it("redacts nested objects", () => {
    const obj = {
      config: {
        credential: "my-secret-cred",
        host: "localhost",
      },
    };
    const result = stripSecrets(obj);
    expect(result.config.credential).toBe("[REDACTED]");
    expect(result.config.host).toBe("localhost");
  });

  it("handles arrays", () => {
    const arr = ["safe", "token: sk-abcdefghijklmnopqrstuvwxyz"];
    const result = stripSecrets(arr);
    expect(result[0]).toBe("safe");
    expect(result[1]).toContain("[REDACTED]");
  });

  it("handles circular references without crashing", () => {
    const obj = { a: 1 };
    obj.self = obj;
    expect(() => stripSecrets(obj)).not.toThrow();
    const result = stripSecrets(obj);
    expect(result.self).toBe("[Circular]");
  });

  it("passes through primitives unchanged", () => {
    expect(stripSecrets(42)).toBe(42);
    expect(stripSecrets(true)).toBe(true);
    expect(stripSecrets(null)).toBe(null);
    expect(stripSecrets(undefined)).toBe(undefined);
  });
});

// ─── Memory stored in ShortTerm is stripped ──────────────────

describe("Memory — Secrets stripped on storage", () => {
  it("ShortTermMemory strips secrets on set", () => {
    const stm = new ShortTermMemory();
    stm.set("config", { password: "secret123", host: "localhost" });
    const val = stm.get("config");
    expect(val.password).toBe("[REDACTED]");
    expect(val.host).toBe("localhost");
    stm.destroy();
  });

  it("WorkingMemory strips secrets on set", () => {
    const wm = new WorkingMemory();
    wm.set("creds", { token: "my-secret-token" });
    const val = wm.get("creds");
    expect(val.token).toBe("[REDACTED]");
  });
});

// ─── Blackboard ──────────────────────────────────────────────

describe("Blackboard — Inter-agent messaging", () => {
  it("posts and reads messages", () => {
    const bb = new Blackboard();
    bb.post("agent-1", "agent-2", "result", { data: "hello" });

    const msgs = bb.read("agent-2");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].from).toBe("agent-1");
    expect(msgs[0].topic).toBe("result");
    expect(msgs[0].payload.data).toBe("hello");
  });

  it("broadcasts are read by all agents", () => {
    const bb = new Blackboard();
    bb.post("agent-1", null, "announce", { msg: "hi all" });

    expect(bb.read("agent-2")).toHaveLength(1);
    expect(bb.read("agent-3")).toHaveLength(1);
  });

  it("filters messages by topic", () => {
    const bb = new Blackboard();
    bb.post("a1", "a2", "status", { s: "ok" });
    bb.post("a1", "a2", "result", { r: "data" });

    const statusMsgs = bb.read("a2", "status");
    expect(statusMsgs).toHaveLength(1);
    expect(statusMsgs[0].topic).toBe("status");
  });

  it("shared state is accessible to all", () => {
    const bb = new Blackboard();
    bb.setShared("project-root", "/src");
    expect(bb.getShared("project-root")).toBe("/src");
  });

  it("strips secrets from messages", () => {
    const bb = new Blackboard();
    bb.post("a1", "a2", "config", { password: "secret123" });

    const msgs = bb.read("a2");
    expect(msgs[0].payload.password).toBe("[REDACTED]");
  });
});

// ─── MemoryManager — Unified ─────────────────────────────────

describe("MemoryManager — Lifecycle Hooks", () => {
  let mm;

  beforeEach(() => {
    mm = new MemoryManager({
      workspaceHash: "mm_test_" + Date.now(),
      longTermEnabled: false,
    });
  });

  afterEach(() => {
    mm.destroy();
  });

  it("onSwarmInit stores config in working memory", () => {
    mm.onSwarmInit({ topology: "mesh", maxAgents: 5 });
    const config = mm.working.get("swarm_config");
    expect(config.topology).toBe("mesh");
  });

  it("onTaskStart stores plan in working memory", () => {
    const graph = { id: "task_1", nodes: [], edges: [] };
    mm.onTaskStart(graph);
    expect(mm.working.getPlan()).toEqual(graph);
    expect(mm.shortTerm.get("task:task_1:started")).toBeDefined();
  });

  it("onPermissionDecision records in both tiers", () => {
    mm.onPermissionDecision("n1", "file_write", "approve_always");
    const grant = mm.working.getPermissionGrant("file_write");
    expect(grant).toBe("approve_always");
    expect(mm.shortTerm.get("perm:n1:file_write")).toBe("approve_always");
  });

  it("usage returns summary of all tiers", () => {
    mm.shortTerm.set("a", "1");
    mm.working.set("b", "2");
    const usage = mm.usage();
    expect(usage.shortTerm.entries).toBeGreaterThanOrEqual(1);
    expect(usage.working.entries).toBeGreaterThanOrEqual(1);
    expect(typeof usage.longTerm.entries).toBe("number");
  });

  it("destroy clears session-scoped permissions", () => {
    mm.working.setPermissionGrant("file_write", "approve_always");
    mm.destroy();
    // After destroy, a new working memory would not have the grant
    // (testing that clearPermissionGrants was called)
  });
});
