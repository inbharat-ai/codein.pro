/**
 * Intelligent Model Router
 * Context-aware model selection with cost/latency scoring,
 * performance feedback loop, adaptive routing, and fine-tuning data collection.
 */

const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

// ── Task Categories ──────────────────────────────────────────────────────────
const TASK_CATEGORIES = {
  REASONING: "reasoning",
  CODE_GEN: "code_generation",
  CODE_EDIT: "code_edit",
  EXPLAIN: "explanation",
  DEBUG: "debugging",
  REFACTOR: "refactoring",
  TEST: "testing",
  TRANSLATE: "translation",
  GENERAL: "general",
};

// ── Keyword → Category classification ────────────────────────────────────────
const CATEGORY_KEYWORDS = {
  [TASK_CATEGORIES.REASONING]: [
    "architecture",
    "design pattern",
    "trade-off",
    "pros and cons",
    "comprehensive",
    "step by step",
    "various approaches",
    "multi-step",
    "evaluate",
    "compare",
    "analyze",
    "strategy",
    "decision",
  ],
  [TASK_CATEGORIES.CODE_GEN]: [
    "write",
    "create",
    "implement",
    "generate",
    "build",
    "make",
    "scaffold",
    "boilerplate",
    "template",
    "new function",
    "new class",
  ],
  [TASK_CATEGORIES.CODE_EDIT]: [
    "fix",
    "change",
    "update",
    "modify",
    "edit",
    "replace",
    "rename",
    "move",
    "add to",
    "remove from",
  ],
  [TASK_CATEGORIES.EXPLAIN]: [
    "explain",
    "what is",
    "how does",
    "why does",
    "describe",
    "summarize",
    "overview",
    "walk through",
    "documentation",
  ],
  [TASK_CATEGORIES.DEBUG]: [
    "debug",
    "error",
    "bug",
    "crash",
    "exception",
    "traceback",
    "stack trace",
    "not working",
    "broken",
    "failing",
    "issue",
  ],
  [TASK_CATEGORIES.REFACTOR]: [
    "refactor",
    "clean up",
    "optimize",
    "improve",
    "restructure",
    "simplify",
    "extract",
    "decouple",
    "modularize",
    "split",
  ],
  [TASK_CATEGORIES.TEST]: [
    "test",
    "spec",
    "coverage",
    "unit test",
    "integration test",
    "mock",
    "assert",
    "expect",
    "describe",
    "it should",
  ],
  [TASK_CATEGORIES.TRANSLATE]: [
    "translate",
    "hindi",
    "tamil",
    "bengali",
    "telugu",
    "multilingual",
    "i18n",
    "localize",
  ],
};

// ── Mode → Category overrides ────────────────────────────────────────────────
const MODE_CATEGORY_MAP = {
  plan: TASK_CATEGORIES.REASONING,
  agent: TASK_CATEGORIES.REASONING,
  implement: TASK_CATEGORIES.CODE_EDIT,
  edit: TASK_CATEGORIES.CODE_EDIT,
  debug: TASK_CATEGORIES.DEBUG,
  ask: null, // inferred from prompt
  chat: null,
};

// ── Model capability profiles ────────────────────────────────────────────────
const MODEL_PROFILES = {
  "qwen2.5-coder-7b": {
    type: "coder",
    contextWindow: 32768,
    strengths: [
      TASK_CATEGORIES.CODE_GEN,
      TASK_CATEGORIES.CODE_EDIT,
      TASK_CATEGORIES.TEST,
    ],
    latencyTier: "medium",
    costTier: "free",
    qualityScore: 0.72,
    maxInputTokens: 28000,
  },
  "qwen2.5-coder-1.5b": {
    type: "coder",
    contextWindow: 32768,
    strengths: [TASK_CATEGORIES.CODE_GEN, TASK_CATEGORIES.CODE_EDIT],
    latencyTier: "fast",
    costTier: "free",
    qualityScore: 0.55,
    maxInputTokens: 28000,
  },
  "deepseek-r1-distill-qwen-7b": {
    type: "reasoner",
    contextWindow: 65536,
    strengths: [
      TASK_CATEGORIES.REASONING,
      TASK_CATEGORIES.EXPLAIN,
      TASK_CATEGORIES.REFACTOR,
      TASK_CATEGORIES.DEBUG,
    ],
    latencyTier: "slow",
    costTier: "free",
    qualityScore: 0.8,
    maxInputTokens: 56000,
  },
  "starcoder2-7b": {
    type: "coder",
    contextWindow: 16384,
    strengths: [
      TASK_CATEGORIES.CODE_GEN,
      TASK_CATEGORIES.CODE_EDIT,
      TASK_CATEGORIES.TEST,
    ],
    latencyTier: "medium",
    costTier: "free",
    qualityScore: 0.65,
    maxInputTokens: 14000,
  },
  "codellama-7b": {
    type: "coder",
    contextWindow: 16384,
    strengths: [TASK_CATEGORIES.CODE_GEN, TASK_CATEGORIES.DEBUG],
    latencyTier: "medium",
    costTier: "free",
    qualityScore: 0.6,
    maxInputTokens: 14000,
  },
};

// Latency tier → approx ms
const LATENCY_TIERS = { fast: 200, medium: 800, slow: 2000 };

// ── Performance tracker (feedback loop) ──────────────────────────────────────
class PerformanceTracker {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.metrics = new Map();
    this._load();
  }

  _metricsPath() {
    return path.join(this.dataDir, "model-metrics.json");
  }

  _load() {
    try {
      if (fs.existsSync(this._metricsPath())) {
        const raw = JSON.parse(fs.readFileSync(this._metricsPath(), "utf8"));
        for (const [k, v] of Object.entries(raw)) {
          this.metrics.set(k, v);
        }
      }
    } catch {
      // Start fresh on corrupt data
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._metricsPath());
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj = Object.fromEntries(this.metrics);
      fs.writeFileSync(this._metricsPath(), JSON.stringify(obj, null, 2));
    } catch {
      // Non-critical
    }
  }

  record(modelId, { success, latencyMs, taskCategory, userRating = null }) {
    if (!this.metrics.has(modelId)) {
      this.metrics.set(modelId, {
        successes: 0,
        failures: 0,
        totalLatency: 0,
        count: 0,
        ratings: [],
        categoryHits: {},
      });
    }
    const m = this.metrics.get(modelId);
    m.count++;
    if (success) m.successes++;
    else m.failures++;
    m.totalLatency += latencyMs || 0;
    if (userRating !== null) m.ratings.push(userRating);
    if (taskCategory) {
      m.categoryHits[taskCategory] = (m.categoryHits[taskCategory] || 0) + 1;
    }
    this._save();
  }

  getModelScore(modelId) {
    const m = this.metrics.get(modelId);
    if (!m || m.count < 3) return null;
    const successRate = m.successes / m.count;
    const avgLatency = m.totalLatency / m.count;
    const avgRating =
      m.ratings.length > 0
        ? m.ratings.reduce((a, b) => a + b, 0) / m.ratings.length
        : 0.5;
    const latencyScore = Math.max(0, 1 - avgLatency / 10000);
    return successRate * 0.4 + avgRating * 0.3 + latencyScore * 0.3;
  }

  getStats() {
    const stats = {};
    for (const [k, v] of this.metrics) {
      stats[k] = {
        ...v,
        avgLatency: v.count > 0 ? Math.round(v.totalLatency / v.count) : 0,
        successRate:
          v.count > 0
            ? ((v.successes / v.count) * 100).toFixed(1) + "%"
            : "N/A",
        avgRating:
          v.ratings.length > 0
            ? (v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length).toFixed(
                2,
              )
            : "N/A",
      };
    }
    return stats;
  }
}

// ── Fine-Tuning Data Collector (REMOVED) ─────────────────────────────────────
// Fine-tuning data collection has been removed as there is no consumer for this data.
// If fine-tuning is needed in the future, implement proper training pipeline first.

// ── Intelligent Model Router ─────────────────────────────────────────────────
class ModelRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    const dataDir = options.dataDir || path.join(process.cwd(), "data");
    this.tracker = new PerformanceTracker(dataDir);
    this.availableModels = new Set();
    this.profiles = { ...MODEL_PROFILES };
    if (options.customProfiles) {
      Object.assign(this.profiles, options.customProfiles);
    }
  }

  registerModel(modelId) {
    this.availableModels.add(modelId);
  }

  unregisterModel(modelId) {
    this.availableModels.delete(modelId);
  }

  classifyTask(prompt, mode) {
    if (mode && MODE_CATEGORY_MAP[mode]) {
      return MODE_CATEGORY_MAP[mode];
    }
    const lower = prompt.toLowerCase();
    let bestCategory = TASK_CATEGORIES.GENERAL;
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
    return bestCategory;
  }

  route(context) {
    const {
      prompt = "",
      mode = "ask",
      contextLength = 0,
      preference = "auto",
      maxLatencyMs = null,
      availableModels = null,
    } = context;

    const taskCategory = this.classifyTask(prompt, mode);
    const candidates = this._getCandidates(
      taskCategory,
      contextLength,
      maxLatencyMs,
      availableModels,
    );

    if (candidates.length === 0) {
      return {
        modelType: "coder",
        modelId: null,
        reason: "No suitable model available",
        taskCategory,
        preference,
        scores: {},
        fallback: true,
      };
    }

    const scored = candidates.map((c) => ({
      ...c,
      compositeScore: this._scoreCandidate(
        c,
        taskCategory,
        contextLength,
        preference,
      ),
    }));
    scored.sort((a, b) => b.compositeScore - a.compositeScore);

    const winner = scored[0];
    const runnerUp = scored.length > 1 ? scored[1] : null;

    const decision = {
      modelType: winner.profile.type,
      modelId: winner.modelId,
      reason: this._explainDecision(winner, taskCategory, contextLength),
      taskCategory,
      preference,
      confidence: winner.compositeScore,
      scores: Object.fromEntries(
        scored.map((s) => [s.modelId, s.compositeScore.toFixed(3)]),
      ),
      alternatives: runnerUp
        ? [
            {
              modelId: runnerUp.modelId,
              score: runnerUp.compositeScore.toFixed(3),
            },
          ]
        : [],
      fallback: false,
    };

    this.emit("route-decision", decision);
    return decision;
  }

  recordOutcome(modelId, { success, latencyMs, taskCategory, userRating }) {
    this.tracker.record(modelId, {
      success,
      latencyMs,
      taskCategory,
      userRating,
    });
  }

  getPerformanceStats() {
    return this.tracker.getStats();
  }

  getFineTuneStats() {
    return {
      message:
        "Fine-tune data collection removed. Implement proper training pipeline if needed.",
      collected: 0,
      buffered: 0,
    };
  }

  exportFineTuneData(format = "alpaca") {
    return [];
  }

  getModelProfiles() {
    return { ...this.profiles };
  }

  _getCandidates(taskCategory, contextLength, maxLatencyMs, availableModels) {
    const available = availableModels
      ? new Set(availableModels)
      : this.availableModels.size > 0
        ? this.availableModels
        : new Set(Object.keys(this.profiles));

    const candidates = [];
    for (const modelId of available) {
      const profile = this.profiles[modelId];
      if (!profile) continue;
      if (contextLength > 0 && contextLength > profile.maxInputTokens) continue;
      if (maxLatencyMs && LATENCY_TIERS[profile.latencyTier] > maxLatencyMs)
        continue;
      candidates.push({ modelId, profile });
    }
    return candidates;
  }

  _scoreCandidate(candidate, taskCategory, contextLength, preference) {
    const { modelId, profile } = candidate;
    let score = profile.qualityScore;

    if (profile.strengths.includes(taskCategory)) {
      score += 0.15;
    }

    if (contextLength > 8000) {
      const contextFit = Math.min(
        1,
        profile.contextWindow / (contextLength * 2),
      );
      score += contextFit * 0.1;
    }

    if (preference === "fast") {
      const latencyBonus =
        profile.latencyTier === "fast"
          ? 0.15
          : profile.latencyTier === "medium"
            ? 0.05
            : -0.1;
      score += latencyBonus;
    } else if (preference === "quality") {
      score += profile.qualityScore * 0.1;
    } else if (preference === "local") {
      // Prefer local/free models
      if (!profile.cloud) score += 0.2;
    } else if (preference === "cloud") {
      // Prefer cloud models
      if (profile.cloud) score += 0.2;
    } else if (preference === "cost") {
      // Prefer cheapest
      const costBonus =
        profile.costTier === "free"
          ? 0.2
          : profile.costTier === "cheap"
            ? 0.1
            : profile.costTier === "moderate"
              ? 0.0
              : -0.1;
      score += costBonus;
    }

    const trackerScore = this.tracker.getModelScore(modelId);
    if (trackerScore !== null) {
      score = trackerScore * 0.6 + score * 0.4;
    }

    return Math.max(0, Math.min(1, score));
  }

  _explainDecision(winner, taskCategory, contextLength) {
    const parts = [];
    parts.push(`Task: ${taskCategory}`);
    if (winner.profile.strengths.includes(taskCategory)) {
      parts.push(`${winner.modelId} excels at ${taskCategory}`);
    }
    if (contextLength > 8000) {
      parts.push(
        `Large context (${contextLength} chars) → ${winner.profile.contextWindow} window`,
      );
    }
    const tracked = this.tracker.getModelScore(winner.modelId);
    if (tracked !== null) {
      parts.push(`Performance score: ${(tracked * 100).toFixed(0)}%`);
    }
    return parts.join(" | ");
  }
}

const modelRouter = new ModelRouter();

module.exports = {
  ModelRouter,
  PerformanceTracker,
  modelRouter,
  TASK_CATEGORIES,
  MODEL_PROFILES,
};
