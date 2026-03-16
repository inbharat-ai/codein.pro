/**
 * Tests for TerminalManager — persistent terminal sessions
 */
"use strict";
const { describe, it, afterEach } = require("node:test");

const assert = require("node:assert");

// ─── Direct implementation for testing (avoids file dependency until agent writes it) ───
const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const MAX_SESSIONS = 20;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_BUFFER = 64 * 1024;
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

// We'll try to load the real module; if it doesn't exist yet, skip
let TerminalManager, TerminalSession;
try {
  ({ TerminalManager, TerminalSession } = require("../src/mas/terminal-manager"));
} catch {
  // Module not yet written — skip tests
  console.log("terminal-manager.js not found — skipping tests");
  throw new Error("Module not loadable — skipping tests");
}

describe("TerminalManager", () => {
  let manager;

  afterEach(() => {
    if (manager) {
      manager.shutdown();
      manager = null;
    }
  });

  it("creates a session with unique ID", () => {
    manager = new TerminalManager();
    const session = manager.createSession();
    assert.ok(session.id.startsWith("term-"));
    assert.strictEqual(session.status, "idle");
  });

  it("lists sessions", () => {
    manager = new TerminalManager();
    manager.createSession();
    manager.createSession();
    const sessions = manager.listSessions();
    assert.strictEqual(sessions.length, 2);
  });

  it("gets session by ID", () => {
    manager = new TerminalManager();
    const s = manager.createSession();
    const retrieved = manager.getSession(s.id);
    assert.strictEqual(retrieved.id, s.id);
  });

  it("returns null for unknown session ID", () => {
    manager = new TerminalManager();
    assert.strictEqual(manager.getSession("nonexistent"), null);
  });

  it("creates agent-specific sessions", () => {
    manager = new TerminalManager();
    const s1 = manager.getAgentSession("agent-1");
    const s2 = manager.getAgentSession("agent-1");
    assert.strictEqual(s1.id, s2.id, "Same agent should reuse session");
  });

  it("closes a session", () => {
    manager = new TerminalManager();
    const s = manager.createSession();
    assert.ok(manager.closeSession(s.id));
    assert.strictEqual(manager.getSession(s.id), null);
  });

  it("closes all sessions", () => {
    manager = new TerminalManager();
    manager.createSession();
    manager.createSession();
    manager.closeAll();
    assert.strictEqual(manager.listSessions().length, 0);
  });

  it("session serializes to JSON", () => {
    manager = new TerminalManager();
    const s = manager.createSession({ agentId: "test" });
    const json = s.toJSON();
    assert.strictEqual(json.agentId, "test");
    assert.strictEqual(json.status, "idle");
    assert.ok(json.createdAt > 0);
  });
});

describe("TerminalSession.execute", () => {
  let manager;

  afterEach(() => {
    if (manager) {
      manager.shutdown();
      manager = null;
    }
  });

  it("executes a simple command", async () => {
    manager = new TerminalManager();
    const session = manager.createSession();
    const isWin = process.platform === "win32";
    const cmd = isWin ? "echo hello" : "echo hello";
    const result = await session.execute(cmd);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes("hello"));
  });

  it("records command history", async () => {
    manager = new TerminalManager();
    const session = manager.createSession();
    await session.execute("echo test1");
    await session.execute("echo test2");
    assert.strictEqual(session.history.length, 2);
  });

  it("rejects execution on closed session", async () => {
    manager = new TerminalManager();
    const session = manager.createSession();
    session.close();
    await assert.rejects(
      () => session.execute("echo test"),
      /Session is closed/,
    );
  });

  it("handles command failure", async () => {
    manager = new TerminalManager();
    const session = manager.createSession();
    const isWin = process.platform === "win32";
    const cmd = isWin ? "cmd /c exit 1" : "exit 1";
    const result = await session.execute(cmd);
    assert.strictEqual(result.exitCode, 1);
  });

  it("emits stdout events", async () => {
    manager = new TerminalManager();
    const session = manager.createSession();
    const chunks = [];
    session.on("stdout", (chunk) => chunks.push(chunk));
    await session.execute("echo streaming");
    assert.ok(chunks.length > 0);
  });
});
