/**
 * Tests for ContextualMemory module
 * Jest-compatible format with describe/it globals + require("node:assert")
 */
"use strict";
const { describe, it } = require("node:test");

const assert = require("node:assert");
const { ContextualMemory } = require("../src/mas/contextual-memory");

// ─── Mock persistence (mimics SqliteMemoryStore in-memory fallback) ──

function createMockPersistence() {
  const store = new Map();
  return {
    _store: store,
    get(key) {
      const entry = store.get(key);
      return entry ? entry.value : undefined;
    },
    set(key, value, opts = {}) {
      store.set(key, { value, scope: opts.scope || "long_term", createdAt: Date.now() });
      return { key, scope: opts.scope || "long_term", createdAt: Date.now() };
    },
    has(key) {
      return store.has(key);
    },
    delete(key) {
      return store.delete(key);
    },
    size() {
      return store.size;
    },
    snapshot() {
      const result = {};
      for (const [key, entry] of store) {
        result[key] = entry;
      }
      return result;
    },
  };
}

// ═══════════════════════════════════════════════════════════════

describe("ContextualMemory", () => {
  describe("recordTaskOutcome() and findSimilarTasks()", () => {
    it("should record a task outcome and find it by similar description", () => {
      const cm = new ContextualMemory();

      cm.recordTaskOutcome(
        "Refactor the authentication module to use JWT tokens",
        { goal: "refactor auth", nodes: [1, 2], mode: "implement" },
        "Successfully refactored",
        5000,
      );

      const results = cm.findSimilarTasks("refactor authentication JWT");
      assert.strictEqual(results.length, 1);
      assert.ok(results[0].description.includes("authentication"));
    });

    it("should return multiple matches sorted by relevance", () => {
      const cm = new ContextualMemory();

      cm.recordTaskOutcome("Add unit tests for user login", null, "done", 1000);
      cm.recordTaskOutcome("Fix login page CSS styling", null, "done", 2000);
      cm.recordTaskOutcome("Refactor database connection pool", null, "done", 3000);

      const results = cm.findSimilarTasks("login tests", 5);
      // "Add unit tests for user login" should rank highest (matches both 'login' and 'tests')
      assert.ok(results.length >= 1);
      assert.ok(results[0].description.includes("login"));
    });

    it("should return empty array when no matches found", () => {
      const cm = new ContextualMemory();
      cm.recordTaskOutcome("Build the payment gateway", null, "done", 1000);

      const results = cm.findSimilarTasks("quantum physics simulation");
      assert.strictEqual(results.length, 0);
    });

    it("should respect the limit parameter", () => {
      const cm = new ContextualMemory();
      for (let i = 0; i < 20; i++) {
        cm.recordTaskOutcome(`Fix bug number ${i} in module parser`, null, "done", 1000);
      }

      const results = cm.findSimilarTasks("fix bug parser", 3);
      assert.strictEqual(results.length, 3);
    });

    it("should persist task outcomes when persistence is provided", () => {
      const persistence = createMockPersistence();
      const cm = new ContextualMemory({ persistence });

      cm.recordTaskOutcome("Deploy the application", null, "done", 500);

      const snapshot = persistence.snapshot();
      const outcomeKeys = Object.keys(snapshot).filter((k) => k.startsWith("task_outcome:"));
      assert.strictEqual(outcomeKeys.length, 1);
    });
  });

  describe("pushConversationTurn() and getConversationContext()", () => {
    it("should push and retrieve conversation turns", () => {
      const cm = new ContextualMemory();

      cm.pushConversationTurn("user", "Hello, can you help me?");
      cm.pushConversationTurn("assistant", "Of course! What do you need?");
      cm.pushConversationTurn("user", "Fix the login bug");

      const context = cm.getConversationContext();
      assert.strictEqual(context.length, 3);
      assert.strictEqual(context[0].role, "user");
      assert.strictEqual(context[0].content, "Hello, can you help me?");
      assert.strictEqual(context[2].content, "Fix the login bug");
    });

    it("should respect maxTurns parameter", () => {
      const cm = new ContextualMemory();

      for (let i = 0; i < 30; i++) {
        cm.pushConversationTurn("user", `Message ${i}`);
      }

      const context = cm.getConversationContext(5);
      assert.strictEqual(context.length, 5);
      // Should be the last 5 messages
      assert.strictEqual(context[0].content, "Message 25");
      assert.strictEqual(context[4].content, "Message 29");
    });

    it("should enforce ring buffer limit of 100 turns", () => {
      const cm = new ContextualMemory();

      for (let i = 0; i < 150; i++) {
        cm.pushConversationTurn("user", `Turn ${i}`);
      }

      const all = cm.getConversationContext(200);
      assert.strictEqual(all.length, 100);
      // Should keep the last 100
      assert.strictEqual(all[0].content, "Turn 50");
      assert.strictEqual(all[99].content, "Turn 149");
    });

    it("should include metadata and timestamp", () => {
      const cm = new ContextualMemory();
      const before = Date.now();
      cm.pushConversationTurn("agent", "Executing code", { agentId: "agent_1", toolName: "exec" });
      const after = Date.now();

      const turns = cm.getConversationContext();
      assert.strictEqual(turns.length, 1);
      assert.strictEqual(turns[0].role, "agent");
      assert.deepStrictEqual(turns[0].metadata, { agentId: "agent_1", toolName: "exec" });
      assert.ok(turns[0].timestamp >= before && turns[0].timestamp <= after);
    });
  });

  describe("clearConversation()", () => {
    it("should clear all conversation history", () => {
      const cm = new ContextualMemory();

      cm.pushConversationTurn("user", "Hello");
      cm.pushConversationTurn("assistant", "Hi");
      assert.strictEqual(cm.getConversationContext().length, 2);

      cm.clearConversation();
      assert.strictEqual(cm.getConversationContext().length, 0);
    });
  });

  describe("recordPattern() and getPatterns()", () => {
    it("should record and retrieve patterns by category", () => {
      const cm = new ContextualMemory();

      cm.recordPattern("file_structure", "src/ contains all source code", 0.9);
      cm.recordPattern("file_structure", "test/ mirrors src/ directory layout", 0.8);
      cm.recordPattern("naming_convention", "camelCase for functions", 0.95);

      const filePatterns = cm.getPatterns("file_structure");
      assert.strictEqual(filePatterns.length, 2);
      // Sorted by confidence descending
      assert.strictEqual(filePatterns[0].confidence, 0.9);
      assert.strictEqual(filePatterns[1].confidence, 0.8);

      const namingPatterns = cm.getPatterns("naming_convention");
      assert.strictEqual(namingPatterns.length, 1);
    });

    it("should update existing pattern confidence on duplicate", () => {
      const cm = new ContextualMemory();

      cm.recordPattern("style", "uses Tailwind CSS", 0.6);
      cm.recordPattern("style", "uses Tailwind CSS", 0.9);

      const patterns = cm.getPatterns("style");
      assert.strictEqual(patterns.length, 1);
      assert.strictEqual(patterns[0].confidence, 0.9);
    });

    it("should return empty array for unknown category", () => {
      const cm = new ContextualMemory();
      assert.deepStrictEqual(cm.getPatterns("nonexistent"), []);
    });

    it("should clamp confidence to [0, 1]", () => {
      const cm = new ContextualMemory();
      cm.recordPattern("test", "pattern_a", 5.0);
      cm.recordPattern("test", "pattern_b", -1.0);

      const patterns = cm.getPatterns("test");
      assert.strictEqual(patterns.find((p) => p.pattern === "pattern_a").confidence, 1.0);
      assert.strictEqual(patterns.find((p) => p.pattern === "pattern_b").confidence, 0);
    });

    it("should persist patterns when persistence is provided", () => {
      const persistence = createMockPersistence();
      const cm = new ContextualMemory({ persistence });

      cm.recordPattern("architecture", "microservices pattern", 0.85);

      const snapshot = persistence.snapshot();
      assert.ok("pattern:architecture" in snapshot);
    });
  });

  describe("assembleContext()", () => {
    it("should return structured context with all three sections", () => {
      const cm = new ContextualMemory();

      // Add conversation
      cm.pushConversationTurn("user", "Fix the search feature");
      cm.pushConversationTurn("assistant", "Looking into it");

      // Add task history
      cm.recordTaskOutcome("Fix search indexing", null, "done", 2000);
      cm.recordTaskOutcome("Build payment flow", null, "done", 5000);

      // Add patterns
      cm.recordPattern("testing", "Jest for unit tests", 0.95);

      const context = cm.assembleContext("Fix search ranking algorithm");

      // Verify structure
      assert.ok(Array.isArray(context.conversationHistory));
      assert.ok(Array.isArray(context.similarTasks));
      assert.ok(typeof context.patterns === "object");

      // Conversation should be present
      assert.strictEqual(context.conversationHistory.length, 2);

      // Similar tasks should find the search-related one
      assert.ok(context.similarTasks.length >= 1);
      assert.ok(context.similarTasks[0].description.includes("search"));

      // Patterns should be present
      assert.ok(context.patterns.testing);
      assert.strictEqual(context.patterns.testing.length, 1);
    });

    it("should return empty sections when no data exists", () => {
      const cm = new ContextualMemory();

      const context = cm.assembleContext("do something");

      assert.deepStrictEqual(context.conversationHistory, []);
      assert.deepStrictEqual(context.similarTasks, []);
      assert.deepStrictEqual(context.patterns, {});
    });
  });

  describe("works without persistence", () => {
    it("should function fully with no persistence and no memoryManager", () => {
      const cm = new ContextualMemory();

      // Task outcomes
      cm.recordTaskOutcome("Create user API", null, "ok", 100);
      assert.strictEqual(cm.findSimilarTasks("user API").length, 1);

      // Conversation
      cm.pushConversationTurn("user", "hello");
      assert.strictEqual(cm.getConversationContext().length, 1);

      // Patterns
      cm.recordPattern("lang", "TypeScript", 0.9);
      assert.strictEqual(cm.getPatterns("lang").length, 1);

      // Context assembly
      const ctx = cm.assembleContext("create API endpoint");
      assert.ok(ctx.conversationHistory);
      assert.ok(ctx.similarTasks);
      assert.ok(ctx.patterns);
    });
  });

  describe("persistence loading", () => {
    it("should load task outcomes and patterns from persistence on construction", () => {
      const persistence = createMockPersistence();

      // Pre-populate persistence with a task outcome
      persistence.set("task_outcome:old_1", {
        id: "outcome_old_1",
        description: "Migrate database schema",
        plan: null,
        result: "done",
        durationMs: 3000,
        timestamp: Date.now() - 10000,
        keywords: ["migrate", "database", "schema"],
      });

      // Pre-populate with a pattern
      persistence.set("pattern:framework", [
        { pattern: "Express.js for HTTP", confidence: 0.9, timestamp: Date.now() - 5000 },
      ]);

      const cm = new ContextualMemory({ persistence });

      // Should find the pre-loaded task
      const tasks = cm.findSimilarTasks("database migration");
      assert.ok(tasks.length >= 1);

      // Should find the pre-loaded pattern
      const patterns = cm.getPatterns("framework");
      assert.strictEqual(patterns.length, 1);
      assert.ok(patterns[0].pattern.includes("Express"));
    });
  });
});
