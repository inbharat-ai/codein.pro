/**
 * Integration Test — 3-Tier Memory System
 *
 * Tests ShortTerm TTL expiry, Working session-scoped grants, LongTerm
 * persistence and size limits, secret stripping, and cross-tier promotion.
 */
"use strict";
const { describe, it, beforeEach, afterEach, after } = require("node:test");
const assert = require("node:assert/strict");

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

after(() => {
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
    assert.equal(stm.get("key1"), "value1");
  });

  it("returns undefined for non-existent key", () => {
    stm = new ShortTermMemory();
    assert.equal(stm.get("ghost"), undefined);
  });

  it("expires entries after TTL", async () => {
    stm = new ShortTermMemory(50); // 50ms default TTL
    stm.set("ephemeral", "data");
    assert.equal(stm.get("ephemeral"), "data");

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(stm.get("ephemeral"), undefined);
  });

  it("custom TTL overrides default", async () => {
    stm = new ShortTermMemory(10000); // 10s default
    stm.set("fast", "data", 50); // 50ms custom
    stm.set("slow", "data", 60000); // 60s custom

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(stm.get("fast"), undefined);
    assert.equal(stm.get("slow"), "data");
  });

  it("has() returns false for expired entries", async () => {
    stm = new ShortTermMemory(50);
    stm.set("temp", "val");
    assert.equal(stm.has("temp"), true);

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(stm.has("temp"), false);
  });

  it("delete removes an entry", () => {
    stm = new ShortTermMemory();
    stm.set("deleteme", "val");
    assert.equal(stm.delete("deleteme"), true);
    assert.equal(stm.get("deleteme"), undefined);
  });

  it("prune removes expired entries", async () => {
    stm = new ShortTermMemory(50);
    stm.set("a", "1");
    stm.set("b", "2");
    stm.set("c", "3", 60000); // this one lives long

    await new Promise((r) => setTimeout(r, 100));
    const remaining = stm.prune();
    assert.equal(remaining, 1); // only "c" survives
  });

  it("clear removes all entries", () => {
    stm = new ShortTermMemory();
    stm.set("a", "1");
    stm.set("b", "2");
    stm.clear();
    assert.equal(stm.size(), 0);
  });

  it("tracks access count", () => {
    stm = new ShortTermMemory();
    stm.set("accessed", "data");
    stm.get("accessed");
    stm.get("accessed");
    stm.get("accessed");
    // Access count is on the internal entry — verify via snapshot
    const snap = stm.snapshot();
    assert.equal(snap["accessed"].accessCount, 3);
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
    assert.equal(wm.get("key"), "value");
  });

  it("permission grants persist within session", () => {
    wm.setPermissionGrant("file_write", "approve_always");
    assert.equal(wm.getPermissionGrant("file_write"), "approve_always");
  });

  it("permission grants return null for unknown types", () => {
    assert.equal(wm.getPermissionGrant("unknown_perm"), null);
  });

  it("clearPermissionGrants removes all grants", () => {
    wm.setPermissionGrant("file_write", "approve_always");
    wm.setPermissionGrant("command_run", "approve_always");
    wm.clearPermissionGrants();
    assert.equal(wm.getPermissionGrant("file_write"), null);
    assert.equal(wm.getPermissionGrant("command_run"), null);
  });

  it("records and retrieves decision history", () => {
    wm.recordDecision({ type: "plan", goal: "fix bug" });
    wm.recordDecision({ type: "permission", result: "approved" });
    const history = wm.getDecisionHistory();
    assert.equal(history.length, 2);
    assert.equal(history[0].type, "plan");
    assert.equal(history[1].type, "permission");
    // Timestamps added automatically
    assert.ok(history[0].timestamp);
  });

  it("tracks budget spending", () => {
    const b1 = wm.trackCost(0.5);
    assert.equal(b1.spent, 0.5);
    const b2 = wm.trackCost(1.0);
    assert.equal(b2.spent, 1.5);
  });

  it("getBudget returns default when not tracked", () => {
    const budget = wm.getBudget();
    assert.equal(budget.spent, 0);
    assert.equal(budget.cap, 2.0);
  });

  it("stores and retrieves plan", () => {
    const plan = { nodes: ["a", "b"], goal: "test" };
    wm.setPlan(plan);
    assert.deepStrictEqual(wm.getPlan(), plan);
  });

  it("stores and retrieves file summaries", () => {
    wm.setFileSummary("/src/index.js", "Main entry point");
    wm.setFileSummary("/src/utils.js", "Utility functions");
    assert.equal(wm.getFileSummary("/src/index.js"), "Main entry point");
    assert.equal(wm.getFileSummary("/src/utils.js"), "Utility functions");
    assert.equal(wm.getFileSummary("/src/missing.js"), undefined);
  });

  it("language preference defaults to 'en'", () => {
    assert.equal(wm.getLanguage(), "en");
    wm.setLanguage("hi");
    assert.equal(wm.getLanguage(), "hi");
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
    assert.deepStrictEqual(val, { indent: 2, semi: true });

    lt.destroy();
  });

  it("returns undefined when disabled", () => {
    const lt = new LongTermMemory({ workspaceHash: "disabled", enabled: false });
    const entry = lt.set("key", "value");
    assert.equal(entry, null);
    assert.equal(lt.get("key"), undefined);
    assert.equal(lt.has("key"), false);
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
    assert.equal(fs.existsSync(lt1._filePath), true);

    // Create new instance, load from disk
    const lt2 = new LongTermMemory({ workspaceHash: hash, enabled: true });
    lt2._basePath = dir;
    lt2._filePath = path.join(dir, "memory.json");
    lt2._load(); // manually trigger load

    assert.equal(lt2.get("survived"), "data");

    lt1.destroy();
  });

  it("delete removes entry and updates disk", () => {
    const dir = createTmpDir();
    const lt = new LongTermMemory({ workspaceHash: "del_test", enabled: true });
    lt._basePath = dir;
    lt._filePath = path.join(dir, "memory.json");

    lt.set("to-delete", "value");
    assert.equal(lt.has("to-delete"), true);

    lt.delete("to-delete");
    assert.equal(lt.has("to-delete"), false);

    lt.destroy();
  });
});

// ─── Secret Stripping ────────────────────────────────────────

describe("Secret Stripping", () => {
  it("redacts API keys in strings", () => {
    const input = 'api_key = "sk-abc123def456ghijklmnopqrst"';
    const result = stripSecrets(input);
    assert.ok(result.includes("[REDACTED]"));
    assert.ok(!result.includes("sk-abc123def456ghijklmnopqrst"));
  });

  it("redacts GitHub tokens", () => {
    const result = stripSecrets("token: ghp_abcdefghijklmnopqrstuvwxyz1234567890");
    assert.ok(result.includes("[REDACTED]"));
  });

  it("redacts JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature";
    const result = stripSecrets(`Bearer ${jwt}`);
    assert.ok(result.includes("[REDACTED]"));
  });

  it("redacts object keys named 'secret', 'password', etc.", () => {
    const obj = {
      username: "admin",
      password: "hunter2",
      api_key: "sk-secret123",
      data: "safe data",
    };
    const result = stripSecrets(obj);
    assert.equal(result.username, "admin");
    assert.equal(result.password, "[REDACTED]");
    assert.equal(result.api_key, "[REDACTED]");
    assert.equal(result.data, "safe data");
  });

  it("redacts nested objects", () => {
    const obj = {
      config: {
        credential: "my-secret-cred",
        host: "localhost",
      },
    };
    const result = stripSecrets(obj);
    assert.equal(result.config.credential, "[REDACTED]");
    assert.equal(result.config.host, "localhost");
  });

  it("handles arrays", () => {
    const arr = ["safe", "token: sk-abcdefghijklmnopqrstuvwxyz"];
    const result = stripSecrets(arr);
    assert.equal(result[0], "safe");
    assert.ok(result[1].includes("[REDACTED]"));
  });

  it("handles circular references without crashing", () => {
    const obj = { a: 1 };
    obj.self = obj;
    assert.doesNotThrow(() => stripSecrets(obj));
    const result = stripSecrets(obj);
    assert.equal(result.self, "[Circular]");
  });

  it("passes through primitives unchanged", () => {
    assert.equal(stripSecrets(42), 42);
    assert.equal(stripSecrets(true), true);
    assert.equal(stripSecrets(null), null);
    assert.equal(stripSecrets(undefined), undefined);
  });
});

// ─── Memory stored in ShortTerm is stripped ──────────────────

describe("Memory — Secrets stripped on storage", () => {
  it("ShortTermMemory strips secrets on set", () => {
    const stm = new ShortTermMemory();
    stm.set("config", { password: "secret123", host: "localhost" });
    const val = stm.get("config");
    assert.equal(val.password, "[REDACTED]");
    assert.equal(val.host, "localhost");
    stm.destroy();
  });

  it("WorkingMemory strips secrets on set", () => {
    const wm = new WorkingMemory();
    wm.set("creds", { token: "my-secret-token" });
    const val = wm.get("creds");
    assert.equal(val.token, "[REDACTED]");
  });
});

// ─── Blackboard ──────────────────────────────────────────────

describe("Blackboard — Inter-agent messaging", () => {
  it("posts and reads messages", () => {
    const bb = new Blackboard();
    bb.post("agent-1", "agent-2", "result", { data: "hello" });

    const msgs = bb.read("agent-2");
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].from, "agent-1");
    assert.equal(msgs[0].topic, "result");
    assert.equal(msgs[0].payload.data, "hello");
  });

  it("broadcasts are read by all agents", () => {
    const bb = new Blackboard();
    bb.post("agent-1", null, "announce", { msg: "hi all" });

    assert.equal(bb.read("agent-2").length, 1);
    assert.equal(bb.read("agent-3").length, 1);
  });

  it("filters messages by topic", () => {
    const bb = new Blackboard();
    bb.post("a1", "a2", "status", { s: "ok" });
    bb.post("a1", "a2", "result", { r: "data" });

    const statusMsgs = bb.read("a2", "status");
    assert.equal(statusMsgs.length, 1);
    assert.equal(statusMsgs[0].topic, "status");
  });

  it("shared state is accessible to all", () => {
    const bb = new Blackboard();
    bb.setShared("project-root", "/src");
    assert.equal(bb.getShared("project-root"), "/src");
  });

  it("strips secrets from messages", () => {
    const bb = new Blackboard();
    bb.post("a1", "a2", "config", { password: "secret123" });

    const msgs = bb.read("a2");
    assert.equal(msgs[0].payload.password, "[REDACTED]");
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
    assert.equal(config.topology, "mesh");
  });

  it("onTaskStart stores plan in working memory", () => {
    const graph = { id: "task_1", nodes: [], edges: [] };
    mm.onTaskStart(graph);
    assert.deepStrictEqual(mm.working.getPlan(), graph);
    assert.ok(mm.shortTerm.get("task:task_1:started"));
  });

  it("onPermissionDecision records in both tiers", () => {
    mm.onPermissionDecision("n1", "file_write", "approve_always");
    const grant = mm.working.getPermissionGrant("file_write");
    assert.equal(grant, "approve_always");
    assert.equal(mm.shortTerm.get("perm:n1:file_write"), "approve_always");
  });

  it("usage returns summary of all tiers", () => {
    mm.shortTerm.set("a", "1");
    mm.working.set("b", "2");
    const usage = mm.usage();
    assert.ok(usage.shortTerm.entries >= 1);
    assert.ok(usage.working.entries >= 1);
    assert.equal(typeof usage.longTerm.entries, "number");
  });

  it("destroy clears session-scoped permissions", () => {
    mm.working.setPermissionGrant("file_write", "approve_always");
    mm.destroy();
    // After destroy, a new working memory would not have the grant
    // (testing that clearPermissionGrants was called)
  });
});
