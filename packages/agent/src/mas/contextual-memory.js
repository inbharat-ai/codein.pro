/**
 * CodeIn Multi-Agent Swarm — Contextual Memory
 *
 * High-level facade over the existing memory subsystems that provides:
 * - Task outcome recording and similarity search
 * - Conversation context (bounded ring buffer)
 * - Learned workspace patterns
 * - Context assembly for the autonomous planner
 *
 * Designed to work with or without persistence (SqliteMemoryStore).
 */
"use strict";

// ═══════════════════════════════════════════════════════════════
// CONTEXTUAL MEMORY
// ═══════════════════════════════════════════════════════════════

class ContextualMemory {
  /**
   * @param {object} opts
   * @param {import("./memory").MemoryManager} [opts.memoryManager] — Existing MemoryManager (optional)
   * @param {import("./sqlite-store").SqliteMemoryStore} [opts.persistence] — SqliteMemoryStore (optional)
   */
  constructor({ memoryManager = null, persistence = null } = {}) {
    /** @type {import("./memory").MemoryManager|null} */
    this._memoryManager = memoryManager;

    /** @type {import("./sqlite-store").SqliteMemoryStore|null} */
    this._persistence = persistence;

    // ── Conversation ring buffer ──
    /** @type {Array<{ role: string, content: string, metadata: object|null, timestamp: number }>} */
    this._conversation = [];
    /** @type {number} */
    this._maxConversationTurns = 100;

    // ── Task outcome history (in-memory) ──
    /** @type {Array<object>} */
    this._taskHistory = [];
    /** @type {number} */
    this._maxTaskHistory = 500;

    // ── Learned patterns ──
    /** @type {Map<string, Array<{ pattern: string, confidence: number, timestamp: number }>>} */
    this._patterns = new Map();

    // Load existing data from persistence
    this._loadFromPersistence();
  }

  // ─── Task Outcome Recording ──────────────────────────────

  /**
   * Record the outcome of a completed task for future retrieval.
   *
   * @param {string} taskDescription — Natural language task description
   * @param {object} plan — The task plan / graph
   * @param {*} result — The task result
   * @param {number} duration — Duration in ms
   * @returns {object} The stored record
   */
  recordTaskOutcome(taskDescription, plan, result, duration) {
    const record = {
      id: `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      description: taskDescription,
      plan: plan
        ? {
            goal: plan.goal,
            nodeCount: (plan.nodes || []).length,
            mode: plan.mode,
          }
        : null,
      result: typeof result === "string" ? result.slice(0, 2000) : result,
      durationMs: duration,
      timestamp: Date.now(),
      keywords: this._extractKeywords(taskDescription),
    };

    this._taskHistory.push(record);
    if (this._taskHistory.length > this._maxTaskHistory) {
      this._taskHistory = this._taskHistory.slice(-this._maxTaskHistory);
    }

    // Persist
    if (this._persistence) {
      try {
        this._persistence.set(`task_outcome:${record.id}`, record, {
          scope: "long_term",
          tags: ["task_outcome"],
        });
      } catch {
        // Non-fatal
      }
    }

    return record;
  }

  /**
   * Find tasks similar to the given description using keyword matching.
   *
   * @param {string} description — Task description to match against
   * @param {number} [limit=5] — Max results
   * @returns {Array<object>} Matching task outcomes sorted by relevance
   */
  findSimilarTasks(description, limit = 5) {
    const queryKeywords = this._extractKeywords(description);
    if (queryKeywords.length === 0) return [];

    const scored = this._taskHistory.map((task) => {
      const taskKeywords =
        task.keywords || this._extractKeywords(task.description);
      let matches = 0;
      for (const kw of queryKeywords) {
        if (taskKeywords.includes(kw)) matches++;
      }
      const score =
        queryKeywords.length > 0 ? matches / queryKeywords.length : 0;
      return { task, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || b.task.timestamp - a.task.timestamp)
      .slice(0, limit)
      .map((s) => s.task);
  }

  // ─── Conversation Context ────────────────────────────────

  /**
   * Push a conversation turn into the ring buffer.
   *
   * @param {string} role — e.g. "user", "assistant", "system", "agent"
   * @param {string} content — The message content
   * @param {object} [metadata] — Optional metadata (agentId, toolName, etc.)
   */
  pushConversationTurn(role, content, metadata = null) {
    this._conversation.push({
      role,
      content,
      metadata,
      timestamp: Date.now(),
    });

    if (this._conversation.length > this._maxConversationTurns) {
      this._conversation = this._conversation.slice(
        -this._maxConversationTurns,
      );
    }
  }

  /**
   * Get recent conversation turns.
   *
   * @param {number} [maxTurns=20]
   * @returns {Array<{ role: string, content: string, metadata: object|null, timestamp: number }>}
   */
  getConversationContext(maxTurns = 20) {
    return this._conversation.slice(-maxTurns);
  }

  /**
   * Clear all conversation history.
   */
  clearConversation() {
    this._conversation = [];
  }

  // ─── Pattern Recording ───────────────────────────────────

  /**
   * Record a learned workspace pattern.
   *
   * @param {string} category — e.g. "file_structure", "naming_convention", "test_pattern"
   * @param {string} pattern — The observed pattern
   * @param {number} [confidence=1.0] — Confidence score (0-1)
   */
  recordPattern(category, pattern, confidence = 1.0) {
    if (!this._patterns.has(category)) {
      this._patterns.set(category, []);
    }

    const list = this._patterns.get(category);

    // Update existing pattern if found
    const existing = list.find((p) => p.pattern === pattern);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.timestamp = Date.now();
    } else {
      list.push({
        pattern,
        confidence: Math.min(1.0, Math.max(0, confidence)),
        timestamp: Date.now(),
      });
    }

    // Persist patterns
    if (this._persistence) {
      try {
        this._persistence.set(
          `pattern:${category}`,
          this._patterns.get(category),
          { scope: "long_term", tags: ["pattern", category] },
        );
      } catch {
        // Non-fatal
      }
    }
  }

  /**
   * Get all patterns for a category.
   *
   * @param {string} category
   * @returns {Array<{ pattern: string, confidence: number, timestamp: number }>}
   */
  getPatterns(category) {
    const list = this._patterns.get(category);
    if (!list) return [];
    // Return sorted by confidence descending
    return [...list].sort((a, b) => b.confidence - a.confidence);
  }

  // ─── Context Assembly ────────────────────────────────────

  /**
   * Assemble a complete context object for the planner.
   * This is the main entry point the autonomous planner calls
   * before generating a plan.
   *
   * @param {string} taskDescription — Current task description
   * @returns {{ conversationHistory: Array, similarTasks: Array, patterns: Object }}
   */
  assembleContext(taskDescription) {
    const conversationHistory = this.getConversationContext(20);
    const similarTasks = this.findSimilarTasks(taskDescription, 5);

    // Collect all pattern categories
    const patterns = {};
    for (const [category, list] of this._patterns) {
      patterns[category] = [...list].sort(
        (a, b) => b.confidence - a.confidence,
      );
    }

    return {
      conversationHistory,
      similarTasks,
      patterns,
    };
  }

  // ─── Internal Helpers ────────────────────────────────────

  /**
   * Extract keywords from a description for similarity matching.
   * Simple tokenization + stopword removal.
   *
   * @param {string} text
   * @returns {string[]}
   */
  _extractKeywords(text) {
    if (!text || typeof text !== "string") return [];

    const STOP_WORDS = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "can",
      "shall",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "as",
      "into",
      "through",
      "during",
      "before",
      "after",
      "and",
      "but",
      "or",
      "nor",
      "not",
      "so",
      "yet",
      "both",
      "either",
      "neither",
      "each",
      "every",
      "all",
      "any",
      "few",
      "more",
      "most",
      "other",
      "some",
      "such",
      "no",
      "only",
      "own",
      "same",
      "than",
      "too",
      "very",
      "just",
      "because",
      "if",
      "when",
      "while",
      "this",
      "that",
      "these",
      "those",
      "it",
      "its",
      "i",
      "me",
      "my",
      "we",
      "our",
      "you",
      "your",
      "he",
      "she",
      "they",
      "them",
      "their",
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  }

  /**
   * Load persisted data (task outcomes + patterns) on construction.
   */
  _loadFromPersistence() {
    if (!this._persistence) return;

    try {
      const snapshot = this._persistence.snapshot();
      if (!snapshot || typeof snapshot !== "object") return;

      for (const [key, stored] of Object.entries(snapshot)) {
        const value = stored.value !== undefined ? stored.value : stored;

        if (key.startsWith("task_outcome:") && value && value.description) {
          this._taskHistory.push(value);
        } else if (key.startsWith("pattern:") && Array.isArray(value)) {
          const category = key.slice("pattern:".length);
          this._patterns.set(category, value);
        }
      }

      // Sort task history by timestamp
      this._taskHistory.sort((a, b) => a.timestamp - b.timestamp);
      if (this._taskHistory.length > this._maxTaskHistory) {
        this._taskHistory = this._taskHistory.slice(-this._maxTaskHistory);
      }
    } catch {
      // Non-fatal: start with empty state
    }
  }
}

module.exports = { ContextualMemory };
