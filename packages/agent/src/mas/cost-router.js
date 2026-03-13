/**
 * CodIn MAS — Cost-Conscious Model Routing
 *
 * Intelligent model selection that uses cheap models for simple tasks and
 * expensive models for complex ones. Designed for cost-sensitive developers
 * who want maximum value per rupee spent on API calls.
 *
 * The router analyzes task complexity, agent type, context size, and
 * dependency graph to pick the optimal model — then tracks spend against
 * a hard budget to prevent bill shock.
 */
"use strict";

const { createLogger } = require("./logger");

const log = createLogger("CostRouter");

// ═══════════════════════════════════════════════════════════════
// 1. PRICING TABLE — cost per million tokens (USD)
// ═══════════════════════════════════════════════════════════════

/**
 * Comprehensive model pricing. Costs are per million tokens.
 * Local models (Ollama/LM Studio) have zero API cost.
 * @type {Readonly<Record<string, {input: number, output: number, contextWindow: number, tier: string, local?: boolean}>>}
 */
const MODEL_PRICING = Object.freeze({
  "claude-opus": {
    input: 15,
    output: 75,
    contextWindow: 200000,
    tier: "premium",
  },
  "claude-sonnet": {
    input: 3,
    output: 15,
    contextWindow: 200000,
    tier: "balanced",
  },
  "claude-haiku": {
    input: 0.25,
    output: 1.25,
    contextWindow: 200000,
    tier: "fast",
  },
  "gpt-4o": {
    input: 2.5,
    output: 10,
    contextWindow: 128000,
    tier: "balanced",
  },
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
    contextWindow: 128000,
    tier: "fast",
  },
  "gpt-4-turbo": {
    input: 10,
    output: 30,
    contextWindow: 128000,
    tier: "premium",
  },
  "gemini-2.0-flash": {
    input: 0.075,
    output: 0.3,
    contextWindow: 1000000,
    tier: "fast",
  },
  "gemini-1.5-pro": {
    input: 1.25,
    output: 5,
    contextWindow: 2000000,
    tier: "balanced",
  },
  "deepseek-chat": {
    input: 0.14,
    output: 0.28,
    contextWindow: 64000,
    tier: "fast",
  },
  "deepseek-reasoner": {
    input: 0.55,
    output: 2.19,
    contextWindow: 64000,
    tier: "balanced",
  },
  "llama-3.1-70b": {
    input: 0,
    output: 0,
    contextWindow: 128000,
    tier: "balanced",
    local: true,
  },
  "llama-3.1-8b": {
    input: 0,
    output: 0,
    contextWindow: 128000,
    tier: "fast",
    local: true,
  },
  codestral: {
    input: 0.3,
    output: 0.9,
    contextWindow: 32000,
    tier: "balanced",
  },
});

// ═══════════════════════════════════════════════════════════════
// 2. COMPLEXITY KEYWORDS
// ═══════════════════════════════════════════════════════════════

/**
 * Maps keywords found in task goals to complexity levels.
 * Used by the router to estimate how hard a task is before selecting a model.
 * @type {Readonly<{simple: string[], moderate: string[], complex: string[]}>}
 */
const COMPLEXITY_KEYWORDS = Object.freeze({
  simple: [
    "fix typo",
    "rename",
    "add comment",
    "format",
    "lint",
    "update import",
    "change color",
  ],
  moderate: [
    "add feature",
    "write test",
    "create component",
    "implement",
    "refactor method",
  ],
  complex: [
    "refactor architecture",
    "security audit",
    "migrate database",
    "design system",
    "optimize performance",
  ],
});

// ═══════════════════════════════════════════════════════════════
// 3. TIER PREFERENCE — agent type → preferred model tier
// ═══════════════════════════════════════════════════════════════

/**
 * Maps agent types to their preferred model tier.
 * Intentionally downgrades planner from premium to balanced — Sonnet plans
 * just as well as Opus for most tasks, saving significant cost.
 * @type {Readonly<Record<string, string>>}
 */
const TIER_PREFERENCE = Object.freeze({
  planner: "balanced",
  coder: "balanced",
  debugger: "balanced",
  tester: "fast",
  security: "premium",
  docs: "fast",
  reviewer: "balanced",
  vibe_builder: "fast",
  refactorer: "balanced",
  architect: "premium",
  devops: "balanced",
  i18n: "fast",
});

// ═══════════════════════════════════════════════════════════════
// 4. INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Preferred model per tier — the cheapest good option in each tier.
 * @type {Record<string, string>}
 */
const TIER_DEFAULT_MODEL = {
  fast: "gemini-2.0-flash",
  balanced: "claude-sonnet",
  premium: "claude-opus",
};

/**
 * Analyze goal text to determine complexity level.
 * @param {string} goal
 * @returns {"simple" | "moderate" | "complex"}
 */
function _analyzeGoalComplexity(goal) {
  if (!goal || typeof goal !== "string") return "moderate";

  const lower = goal.toLowerCase();

  // Check complex keywords first (longest match wins)
  for (const keyword of COMPLEXITY_KEYWORDS.complex) {
    if (lower.includes(keyword)) return "complex";
  }
  for (const keyword of COMPLEXITY_KEYWORDS.moderate) {
    if (lower.includes(keyword)) return "moderate";
  }
  for (const keyword of COMPLEXITY_KEYWORDS.simple) {
    if (lower.includes(keyword)) return "simple";
  }

  // Heuristic: longer goals tend to describe more complex tasks
  if (goal.length > 500) return "complex";
  if (goal.length > 150) return "moderate";

  return "moderate";
}

/**
 * Determine effective tier by combining goal complexity, agent preference,
 * explicit complexity override, context size, and dependency count.
 * @param {object} task
 * @returns {{ tier: string, reasoning: string }}
 */
function _determineTier(task) {
  const { goal, agentType, complexity, context, dependencies } = task;
  const reasons = [];

  // 1. Start with agent type preference
  let tier = TIER_PREFERENCE[agentType] || "balanced";
  reasons.push(`agent "${agentType}" prefers tier "${tier}"`);

  // 2. Adjust based on goal keyword analysis
  const goalComplexity = _analyzeGoalComplexity(goal);
  if (goalComplexity === "complex" && tier !== "premium") {
    tier = "premium";
    reasons.push(`goal keywords indicate complex task — upgraded to premium`);
  } else if (goalComplexity === "simple" && tier !== "fast") {
    tier = "fast";
    reasons.push(`goal keywords indicate simple task — downgraded to fast`);
  } else {
    reasons.push(`goal complexity: ${goalComplexity}`);
  }

  // 3. Explicit complexity override takes precedence
  if (complexity === "high" || complexity === "complex") {
    tier = "premium";
    reasons.push("explicit complexity=high — forced premium");
  } else if (complexity === "low" || complexity === "simple") {
    tier = "fast";
    reasons.push("explicit complexity=low — forced fast");
  }

  // 4. Large context pushes toward models with bigger context windows
  const contextSize = typeof context === "string" ? context.length : 0;
  if (contextSize > 100000 && tier === "fast") {
    tier = "balanced";
    reasons.push(
      `context is ${Math.round(contextSize / 1000)}k chars — need larger context window, upgraded to balanced`,
    );
  }

  // 5. Tasks with downstream dependencies are higher stakes
  const depCount = Array.isArray(dependencies) ? dependencies.length : 0;
  if (depCount > 0 && tier === "fast") {
    tier = "balanced";
    reasons.push(
      `${depCount} downstream dependencie(s) — higher stakes, upgraded to balanced`,
    );
  }

  return { tier, reasoning: reasons.join("; ") };
}

/**
 * Pick the best model for a given tier, considering context size constraints.
 * Prefers the cheapest model that can handle the context.
 * @param {string} tier
 * @param {number} contextSize - approximate token count needed
 * @returns {string}
 */
function _pickModelForTier(tier, contextSize) {
  // Gather candidates in the tier, sorted by input cost ascending
  const candidates = Object.entries(MODEL_PRICING)
    .filter(([, info]) => info.tier === tier && !info.local)
    .sort(([, a], [, b]) => a.input - b.input);

  if (candidates.length === 0) {
    // Fallback to default
    return TIER_DEFAULT_MODEL[tier] || "claude-sonnet";
  }

  // Pick cheapest model whose context window fits the need
  for (const [model, info] of candidates) {
    if (info.contextWindow >= contextSize) {
      return model;
    }
  }

  // If nothing fits, pick the one with the largest context window in the tier
  const sorted = candidates.sort(
    ([, a], [, b]) => b.contextWindow - a.contextWindow,
  );
  return sorted[0][0];
}

// ═══════════════════════════════════════════════════════════════
// 5. CostRouter CLASS
// ═══════════════════════════════════════════════════════════════

/**
 * Intelligent model router that minimizes API spend while maintaining
 * output quality. Tracks budget in real time and hard-stops before
 * overspend.
 */
class CostRouter {
  /**
   * @param {object} opts
   * @param {number} opts.budgetUSD — total budget for this session
   * @param {number} [opts.warningThresholdPercent=80] — emit warning at this %
   * @param {number} [opts.hardStopPercent=100] — refuse new requests at this %
   */
  constructor({
    budgetUSD,
    warningThresholdPercent = 80,
    hardStopPercent = 100,
  }) {
    if (typeof budgetUSD !== "number" || budgetUSD <= 0) {
      throw new Error("budgetUSD must be a positive number");
    }
    if (warningThresholdPercent < 0 || warningThresholdPercent > 100) {
      throw new Error("warningThresholdPercent must be 0-100");
    }
    if (hardStopPercent < warningThresholdPercent) {
      throw new Error("hardStopPercent must be >= warningThresholdPercent");
    }

    /** @type {number} */
    this._budgetUSD = budgetUSD;
    /** @type {number} */
    this._warningThresholdPercent = warningThresholdPercent;
    /** @type {number} */
    this._hardStopPercent = hardStopPercent;
    /** @type {number} */
    this._totalSpent = 0;
    /** @type {Array<{timestamp: string, amount: number, model: string, agentType: string}>} */
    this._spendLog = [];

    log.info("CostRouter initialized", {
      budgetUSD,
      warningThresholdPercent,
      hardStopPercent,
    });
  }

  /**
   * Select the optimal model for a task based on complexity, agent type,
   * context size, and dependency graph.
   *
   * @param {object} task
   * @param {string} task.goal — what the task should accomplish
   * @param {string} task.agentType — the agent type handling this task
   * @param {string} [task.complexity] — explicit override: "low" | "medium" | "high"
   * @param {string} [task.context] — the context string (used to gauge size)
   * @param {string[]} [task.dependencies] — IDs of downstream dependent tasks
   * @returns {{ model: string, tier: string, estimatedCostUSD: number, reasoning: string }}
   */
  selectModel(task) {
    if (!task || typeof task !== "object") {
      throw new Error("task object is required");
    }
    if (!task.goal || typeof task.goal !== "string") {
      throw new Error("task.goal is required");
    }

    // Check hard stop before even selecting
    const status = this.getBudgetStatus();
    if (status.hardStop) {
      log.warn("Budget hard stop reached — refusing model selection", {
        totalSpent: this._totalSpent,
        budgetUSD: this._budgetUSD,
      });
      return {
        model: null,
        tier: null,
        estimatedCostUSD: 0,
        reasoning: `Budget exhausted (${status.percentUsed.toFixed(1)}% used). Hard stop at ${this._hardStopPercent}%.`,
      };
    }

    const { tier, reasoning } = _determineTier(task);

    // Estimate context tokens (~4 chars per token is a rough heuristic)
    const contextSize =
      typeof task.context === "string"
        ? Math.ceil(task.context.length / 4)
        : 4000;

    const model = _pickModelForTier(tier, contextSize);

    // Estimate cost for a typical request (assume ~2k input, ~1k output tokens)
    const estimatedInputTokens = Math.max(contextSize, 2000);
    const estimatedOutputTokens = tier === "premium" ? 2000 : 1000;
    const estimatedCostUSD = this.estimateCost(
      model,
      estimatedInputTokens,
      estimatedOutputTokens,
    );

    log.debug("Model selected", {
      model,
      tier,
      estimatedCostUSD,
      agentType: task.agentType,
    });

    return { model, tier, estimatedCostUSD, reasoning };
  }

  /**
   * Calculate the cost of a model call given token counts.
   *
   * @param {string} model — model name from MODEL_PRICING
   * @param {number} inputTokens — number of input tokens
   * @param {number} outputTokens — number of output tokens
   * @returns {number} cost in USD
   */
  estimateCost(model, inputTokens, outputTokens) {
    const pricing = MODEL_PRICING[model];
    if (!pricing) {
      log.warn(`Unknown model "${model}" — cannot estimate cost, returning 0`);
      return 0;
    }

    // Pricing is per million tokens
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Record actual spend and check budget thresholds.
   *
   * @param {number} amount — USD spent
   * @param {string} model — model that was used
   * @param {string} agentType — agent that incurred the spend
   * @returns {{ totalSpent: number, remaining: number, percentUsed: number, warning: boolean, hardStop: boolean }}
   */
  trackSpend(amount, model, agentType) {
    if (typeof amount !== "number" || amount < 0) {
      throw new Error("amount must be a non-negative number");
    }

    this._totalSpent = parseFloat((this._totalSpent + amount).toFixed(6));
    this._spendLog.push({
      timestamp: new Date().toISOString(),
      amount,
      model,
      agentType,
    });

    const remaining = parseFloat(
      Math.max(0, this._budgetUSD - this._totalSpent).toFixed(6),
    );
    const percentUsed = (this._totalSpent / this._budgetUSD) * 100;
    const warning = percentUsed >= this._warningThresholdPercent;
    const hardStop = percentUsed >= this._hardStopPercent;

    if (hardStop) {
      log.error("Budget hard stop reached", {
        totalSpent: this._totalSpent,
        budgetUSD: this._budgetUSD,
        percentUsed: percentUsed.toFixed(1),
      });
    } else if (warning) {
      log.warn("Budget warning threshold reached", {
        totalSpent: this._totalSpent,
        budgetUSD: this._budgetUSD,
        percentUsed: percentUsed.toFixed(1),
      });
    }

    return {
      totalSpent: this._totalSpent,
      remaining,
      percentUsed,
      warning,
      hardStop,
    };
  }

  /**
   * Get the current budget status without recording any spend.
   *
   * @returns {{ totalSpent: number, remaining: number, percentUsed: number, budgetUSD: number, warning: boolean, hardStop: boolean }}
   */
  getBudgetStatus() {
    const remaining = parseFloat(
      Math.max(0, this._budgetUSD - this._totalSpent).toFixed(6),
    );
    const percentUsed =
      this._budgetUSD > 0 ? (this._totalSpent / this._budgetUSD) * 100 : 0;

    return {
      totalSpent: this._totalSpent,
      remaining,
      percentUsed,
      budgetUSD: this._budgetUSD,
      warning: percentUsed >= this._warningThresholdPercent,
      hardStop: percentUsed >= this._hardStopPercent,
    };
  }

  /**
   * Analyze past spending patterns and suggest cost optimizations.
   * Returns actionable suggestions with estimated savings.
   *
   * @param {Array<{model: string, agentType: string, amount: number}>} [history]
   *   — spend history to analyze. Defaults to internal spend log.
   * @returns {{ suggestions: string[], potentialSavings: number }}
   */
  suggestCostOptimization(history) {
    const records = history || this._spendLog;
    if (!records || records.length === 0) {
      return {
        suggestions: ["No spending history to analyze yet."],
        potentialSavings: 0,
      };
    }

    const suggestions = [];
    let potentialSavings = 0;

    // Aggregate spend by model
    /** @type {Map<string, number>} */
    const spendByModel = new Map();
    /** @type {Map<string, Set<string>>} */
    const modelsByAgent = new Map();

    for (const entry of records) {
      const model = entry.model || "unknown";
      const agent = entry.agentType || "unknown";
      const amount = entry.amount || 0;

      spendByModel.set(model, (spendByModel.get(model) || 0) + amount);

      if (!modelsByAgent.has(agent)) {
        modelsByAgent.set(agent, new Set());
      }
      modelsByAgent.get(agent).add(model);
    }

    // Suggestion: downgrade planner from Opus to Sonnet
    const opusPlanner = spendByModel.get("claude-opus") || 0;
    if (opusPlanner > 0) {
      // Sonnet is ~5x cheaper than Opus
      const saving = parseFloat((opusPlanner * 0.8).toFixed(4));
      suggestions.push(
        `Switch planner from Claude Opus to Sonnet — planning quality is similar but 5x cheaper (saves ~$${saving.toFixed(2)})`,
      );
      potentialSavings += saving;
    }

    // Suggestion: use Gemini Flash for docs agent
    const docsUsingExpensive = records.filter(
      (r) =>
        r.agentType === "docs" &&
        r.model &&
        !r.model.includes("flash") &&
        !r.model.includes("haiku") &&
        !r.model.includes("mini"),
    );
    if (docsUsingExpensive.length > 0) {
      const docsSpend = docsUsingExpensive.reduce(
        (sum, r) => sum + (r.amount || 0),
        0,
      );
      const saving = parseFloat((docsSpend * 0.9).toFixed(4));
      suggestions.push(
        `Use Gemini Flash for docs agent — output quality is sufficient for documentation (saves ~$${saving.toFixed(2)})`,
      );
      potentialSavings += saving;
    }

    // Suggestion: use local models for tester agent
    const testerSpend = records
      .filter((r) => r.agentType === "tester")
      .reduce((sum, r) => sum + (r.amount || 0), 0);
    if (testerSpend > 0.1) {
      suggestions.push(
        `Consider local models (Llama 3.1 8B) for test generation — zero API cost (saves ~$${testerSpend.toFixed(2)})`,
      );
      potentialSavings += testerSpend;
    }

    // Suggestion: use DeepSeek for coding tasks
    const coderOnExpensive = records.filter(
      (r) =>
        r.agentType === "coder" &&
        r.model &&
        (r.model.includes("opus") || r.model.includes("gpt-4-turbo")),
    );
    if (coderOnExpensive.length > 0) {
      const coderSpend = coderOnExpensive.reduce(
        (sum, r) => sum + (r.amount || 0),
        0,
      );
      const saving = parseFloat((coderSpend * 0.7).toFixed(4));
      suggestions.push(
        `Use DeepSeek Chat or Codestral for coding tasks — strong code quality at a fraction of the cost (saves ~$${saving.toFixed(2)})`,
      );
      potentialSavings += saving;
    }

    // Suggestion: batch requests to reduce overhead
    if (records.length > 20) {
      const avgAmount =
        records.reduce((sum, r) => sum + (r.amount || 0), 0) / records.length;
      if (avgAmount < 0.005) {
        suggestions.push(
          "Many small requests detected — consider batching context to reduce per-call overhead",
        );
      }
    }

    if (suggestions.length === 0) {
      suggestions.push(
        "Current spending pattern looks efficient — no changes suggested.",
      );
    }

    potentialSavings = parseFloat(potentialSavings.toFixed(4));

    log.info("Cost optimization analysis complete", {
      suggestionCount: suggestions.length,
      potentialSavings,
    });

    return { suggestions, potentialSavings };
  }

  /**
   * Returns the full model pricing table.
   * @returns {Readonly<Record<string, {input: number, output: number, contextWindow: number, tier: string, local?: boolean}>>}
   */
  getModelPricing() {
    return MODEL_PRICING;
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = { CostRouter, MODEL_PRICING, COMPLEXITY_KEYWORDS };
