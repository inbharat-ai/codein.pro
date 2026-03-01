/**
 * ContextAwareRouter — Bridges the ContextBudgetManager with the ModelRouter
 * so that model selection accounts for actual context utilization.
 *
 * Flow:
 *   1. Before a chat request, the caller assembles context via ContextBudgetManager
 *   2. The budget manager's utilization is fed into this router
 *   3. This router adjusts the model selection based on:
 *      - Context window saturation (large contexts → larger-context models)
 *      - Pruning status (if heavy pruning happened → recommend compaction)
 *      - Task complexity inferred from context mix (code density, tool usage)
 */

import {
  BudgetUtilization,
  ContextBudgetManager,
} from "./ContextBudgetManager.js";

export interface ContextRoutingDecision {
  /** Recommended model type */
  recommendedModelType: string;
  /** Why this model was chosen */
  reason: string;
  /** Context metrics used in decision */
  contextMetrics: {
    utilization: number;
    pruningRecommended: boolean;
    compactionRecommended: boolean;
    dominantCategory: string;
    codeHeavy: boolean;
  };
  /** Hints for the caller */
  hints: {
    shouldCompact: boolean;
    maxNewContextTokens: number;
    suggestedMaxOutputTokens: number;
  };
}

export interface ContextRoutingConfig {
  /** Context saturation above which to prefer large-context models (default: 0.70) */
  largeContextThreshold?: number;
  /** Context saturation above which compaction is strongly recommended (default: 0.90) */
  compactionThreshold?: number;
  /** Minimum output tokens to guarantee (default: 1000) */
  minOutputTokens?: number;
}

const DEFAULT_CONFIG: Required<ContextRoutingConfig> = {
  largeContextThreshold: 0.7,
  compactionThreshold: 0.9,
  minOutputTokens: 1000,
};

/**
 * Given context utilization data, produce a routing decision.
 */
export function routeWithContext(
  utilization: BudgetUtilization,
  taskCategory: string,
  userPreference: string | null,
  config: ContextRoutingConfig = {},
): ContextRoutingDecision {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const pct = utilization.percentage;
  const pruningRecommended = utilization.pruningRecommended;
  const compactionRecommended = pct >= cfg.compactionThreshold;

  // Determine dominant context category
  let dominantCategory = "conversation";
  let maxCatTokens = 0;
  for (const [cat, tokens] of Object.entries(utilization.breakdown)) {
    if (tokens > maxCatTokens) {
      maxCatTokens = tokens;
      dominantCategory = cat;
    }
  }

  // Code-heavy heuristic: codebase/file categories dominate
  const codeCategories = new Set([
    "codebase",
    "file",
    "code",
    "snippet",
    "repository",
  ]);
  const codeTokens = Object.entries(utilization.breakdown)
    .filter(([cat]) => codeCategories.has(cat))
    .reduce((sum, [, t]) => sum + t, 0);
  const codeHeavy = utilization.used > 0 && codeTokens / utilization.used > 0.5;

  // Model selection logic
  let recommendedModelType: string;
  let reason: string;

  if (userPreference) {
    // User explicitly chose a model — respect it
    recommendedModelType = userPreference;
    reason = `User preference: ${userPreference}`;
  } else if (pct >= cfg.largeContextThreshold) {
    // High context utilization → need large-context model
    if (
      taskCategory === "reasoning" ||
      taskCategory === "architecture" ||
      taskCategory === "debugging"
    ) {
      recommendedModelType = "reasoner-large";
      reason = `High context (${(pct * 100).toFixed(0)}%) + ${taskCategory} task → large-context reasoner`;
    } else {
      recommendedModelType = "coder-large";
      reason = `High context (${(pct * 100).toFixed(0)}%) → large-context coder`;
    }
  } else if (
    codeHeavy &&
    (taskCategory === "code-generation" || taskCategory === "refactoring")
  ) {
    recommendedModelType = "coder";
    reason = `Code-heavy context (${codeTokens} tokens) + ${taskCategory} → specialized coder`;
  } else if (taskCategory === "reasoning" || taskCategory === "architecture") {
    recommendedModelType = "reasoner";
    reason = `${taskCategory} task with moderate context → reasoner`;
  } else {
    recommendedModelType = "coder";
    reason = `Default: ${taskCategory} task at ${(pct * 100).toFixed(0)}% context → coder`;
  }

  // Calculate hints
  const maxNewContextTokens = Math.max(
    0,
    utilization.available - cfg.minOutputTokens,
  );
  const suggestedMaxOutputTokens = Math.max(
    cfg.minOutputTokens,
    Math.min(utilization.available * 0.5, 4096), // At most half of remaining, capped at 4096
  );

  return {
    recommendedModelType,
    reason,
    contextMetrics: {
      utilization: pct,
      pruningRecommended,
      compactionRecommended,
      dominantCategory,
      codeHeavy,
    },
    hints: {
      shouldCompact: compactionRecommended,
      maxNewContextTokens,
      suggestedMaxOutputTokens,
    },
  };
}

/**
 * Convenience: get a routing decision directly from a ContextBudgetManager.
 */
export function routeFromBudget(
  budget: ContextBudgetManager,
  taskCategory: string,
  userPreference: string | null = null,
  config?: ContextRoutingConfig,
): ContextRoutingDecision {
  return routeWithContext(
    budget.getUtilization(),
    taskCategory,
    userPreference,
    config,
  );
}
