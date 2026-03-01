/**
 * ContextBudgetManager — Budget-aware context assembly for large codebases.
 *
 * Rather than gathering ALL context and then pruning, this manager tracks
 * a token budget during assembly so providers can stop early once the
 * budget is exhausted.
 *
 * Usage:
 *   const budget = new ContextBudgetManager({ contextLength: 128000, modelName: "llama2" });
 *   budget.reserveSystemMessage(systemTokens);
 *   budget.reserveTools(toolTokens);
 *   budget.reserveOutputTokens(maxTokens);
 *
 *   // During assembly, check before adding:
 *   if (budget.canFit(estimatedTokens)) {
 *     budget.allocate("codebase", estimatedTokens, relevanceScore);
 *   }
 *
 *   // Get stats for router integration:
 *   budget.getUtilization();  // { used, available, percentage, breakdown }
 */

import {
  countTokens,
  getTokenCountingBufferSafety,
} from "../llm/countTokens.js";

export interface BudgetAllocation {
  category: string;
  tokens: number;
  relevance: number; // 0-1 relevance score
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface BudgetUtilization {
  totalBudget: number;
  used: number;
  available: number;
  percentage: number; // 0-1
  breakdown: Record<string, number>;
  reservations: {
    system: number;
    tools: number;
    output: number;
    safety: number;
  };
  isOverBudget: boolean;
  pruningRecommended: boolean;
}

export interface ContextBudgetConfig {
  contextLength: number;
  modelName: string;
  maxOutputTokens?: number;
  /** Threshold at which pruning is recommended (default: 0.85) */
  pruningThreshold?: number;
  /** Minimum tokens to keep available for new context (default: 500) */
  reserveForNewContext?: number;
}

export class ContextBudgetManager {
  private contextLength: number;
  private modelName: string;
  private safetyBuffer: number;
  private pruningThreshold: number;
  private reserveForNewContext: number;

  private systemTokens = 0;
  private toolTokens = 0;
  private outputTokens = 0;

  private allocations: BudgetAllocation[] = [];

  constructor(config: ContextBudgetConfig) {
    this.contextLength = config.contextLength;
    this.modelName = config.modelName;
    this.safetyBuffer = getTokenCountingBufferSafety(config.contextLength);
    this.pruningThreshold = config.pruningThreshold ?? 0.85;
    this.reserveForNewContext = config.reserveForNewContext ?? 500;

    if (config.maxOutputTokens) {
      this.outputTokens = Math.min(config.maxOutputTokens, 1000);
    }
  }

  /** Reserve tokens for the system message */
  reserveSystemMessage(tokens: number): void {
    this.systemTokens = tokens;
  }

  /** Reserve tokens for tool definitions */
  reserveTools(tokens: number): void {
    this.toolTokens = tokens;
  }

  /** Reserve tokens for model output */
  reserveOutputTokens(tokens: number): void {
    this.outputTokens = tokens;
  }

  /** How many input tokens are available after all reservations */
  get availableTokens(): number {
    return Math.max(
      0,
      this.contextLength -
        this.safetyBuffer -
        this.systemTokens -
        this.toolTokens -
        this.outputTokens -
        this.usedTokens,
    );
  }

  /** Total tokens allocated so far (excluding reservations) */
  get usedTokens(): number {
    return this.allocations.reduce((sum, a) => sum + a.tokens, 0);
  }

  /** Check if `tokens` more can fit without exceeding budget */
  canFit(tokens: number): boolean {
    return this.availableTokens >= tokens;
  }

  /**
   * Quick estimate of how many tokens `text` would consume.
   * Uses the fast synchronous tokenizer.
   */
  estimateTokens(text: string): number {
    return countTokens(text, this.modelName);
  }

  /**
   * Allocate tokens for a piece of context.
   * Returns true if the allocation succeeded (fits in budget).
   */
  allocate(
    category: string,
    tokens: number,
    relevance = 0.5,
    metadata?: Record<string, unknown>,
  ): boolean {
    if (!this.canFit(tokens)) {
      return false;
    }
    this.allocations.push({
      category,
      tokens,
      relevance,
      timestamp: Date.now(),
      metadata,
    });
    return true;
  }

  /**
   * Try to allocate for text content. Estimates tokens automatically.
   * Returns the token count if allocated, or -1 if it doesn't fit.
   */
  tryAllocateText(
    category: string,
    text: string,
    relevance = 0.5,
    metadata?: Record<string, unknown>,
  ): number {
    const tokens = this.estimateTokens(text);
    if (this.allocate(category, tokens, relevance, metadata)) {
      return tokens;
    }
    return -1;
  }

  /**
   * Get full utilization report — feed this to the model router
   * for context-aware model selection.
   */
  getUtilization(): BudgetUtilization {
    const used = this.usedTokens;
    const totalReservations =
      this.systemTokens +
      this.toolTokens +
      this.outputTokens +
      this.safetyBuffer;
    const totalBudget = this.contextLength - totalReservations;
    const available = Math.max(0, totalBudget - used);
    const percentage = totalBudget > 0 ? used / totalBudget : 1;

    const breakdown: Record<string, number> = {};
    for (const alloc of this.allocations) {
      breakdown[alloc.category] =
        (breakdown[alloc.category] || 0) + alloc.tokens;
    }

    return {
      totalBudget,
      used,
      available,
      percentage,
      breakdown,
      reservations: {
        system: this.systemTokens,
        tools: this.toolTokens,
        output: this.outputTokens,
        safety: this.safetyBuffer,
      },
      isOverBudget: used > totalBudget,
      pruningRecommended: percentage >= this.pruningThreshold,
    };
  }

  /**
   * Relevance-aware pruning: Returns indices of allocations to remove
   * to free `targetTokens`. Prefers removing low-relevance, older items.
   */
  suggestPruning(targetTokens: number): number[] {
    if (targetTokens <= 0) return [];

    // Score each allocation: lower = more pruneable
    const scored = this.allocations.map((alloc, idx) => {
      const ageMs = Date.now() - alloc.timestamp;
      const agePenalty = Math.min(1, ageMs / (1000 * 60 * 30)); // 0-1 over 30 min
      // Lower relevance + older = higher prune score
      const pruneScore = (1 - alloc.relevance) * 0.6 + agePenalty * 0.4;
      return { idx, tokens: alloc.tokens, pruneScore };
    });

    // Sort descending by prune score (most pruneable first)
    scored.sort((a, b) => b.pruneScore - a.pruneScore);

    const toPrune: number[] = [];
    let freed = 0;
    for (const item of scored) {
      if (freed >= targetTokens) break;
      toPrune.push(item.idx);
      freed += item.tokens;
    }
    return toPrune;
  }

  /**
   * Execute pruning: removes allocations at the given indices.
   */
  prune(indices: number[]): void {
    const indexSet = new Set(indices);
    this.allocations = this.allocations.filter((_, i) => !indexSet.has(i));
  }

  /** Reset all allocations (not reservations) */
  resetAllocations(): void {
    this.allocations = [];
  }

  /** Clone the current state for simulations */
  snapshot(): ContextBudgetManager {
    const clone = new ContextBudgetManager({
      contextLength: this.contextLength,
      modelName: this.modelName,
    });
    clone.systemTokens = this.systemTokens;
    clone.toolTokens = this.toolTokens;
    clone.outputTokens = this.outputTokens;
    clone.allocations = [...this.allocations];
    return clone;
  }
}
