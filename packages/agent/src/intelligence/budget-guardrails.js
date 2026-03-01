/**
 * Budget Guardrails
 *
 * Tracks premium API spend and enforces configurable limits:
 *   - Per-request cost cap
 *   - Hourly / daily / monthly budget
 *   - Cost warnings at configurable thresholds
 *   - Automatic fallback to local when budget exceeded
 *
 * Usage estimates based on PROVIDER_CONFIGS token pricing.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const BUDGET_FILE = path.join(os.homedir(), ".codin", "budget-state.json");

// Default token pricing per million tokens (USD) by provider
const DEFAULT_COST_PER_MTOK = {
  openai: { input: 2.5, output: 10.0 }, // gpt-4o pricing
  anthropic: { input: 3.0, output: 15.0 }, // claude-sonnet pricing
  gemini: { input: 0.1, output: 0.4 }, // gemini-flash pricing
};

class BudgetGuardrails {
  constructor(options = {}) {
    this.limits = {
      perRequestMaxCost: options.perRequestMaxCost ?? 0.5, // $0.50 per request
      hourlyBudget: options.hourlyBudget ?? 5.0, // $5/hour
      dailyBudget: options.dailyBudget ?? 25.0, // $25/day
      monthlyBudget: options.monthlyBudget ?? 100.0, // $100/month
      warningThreshold: options.warningThreshold ?? 0.8, // warn at 80% of limit
    };

    this._budgetFile = options.statePath || BUDGET_FILE;

    this.state = {
      hourlySpend: 0,
      dailySpend: 0,
      monthlySpend: 0,
      totalSpend: 0,
      requestCount: 0,
      lastHourReset: Date.now(),
      lastDayReset: Date.now(),
      lastMonthReset: Date.now(),
      history: [],
    };

    this._loadState();
  }

  /**
   * Check if a request is allowed given estimated cost.
   *
   * @param {number} estimatedCost - Estimated cost in USD
   * @returns {{ allowed: boolean, reason?: string, warning?: string, budget: Object }}
   */
  checkBudget(estimatedCost = 0) {
    this._resetPeriodsIfNeeded();

    const budget = this._getCurrentBudget();

    // Hard limits
    if (estimatedCost > this.limits.perRequestMaxCost) {
      return {
        allowed: false,
        reason: `Estimated cost $${estimatedCost.toFixed(4)} exceeds per-request limit $${this.limits.perRequestMaxCost.toFixed(2)}`,
        budget,
      };
    }

    if (this.state.hourlySpend + estimatedCost > this.limits.hourlyBudget) {
      return {
        allowed: false,
        reason: `Hourly budget exceeded ($${this.state.hourlySpend.toFixed(4)} / $${this.limits.hourlyBudget.toFixed(2)})`,
        budget,
      };
    }

    if (this.state.dailySpend + estimatedCost > this.limits.dailyBudget) {
      return {
        allowed: false,
        reason: `Daily budget exceeded ($${this.state.dailySpend.toFixed(4)} / $${this.limits.dailyBudget.toFixed(2)})`,
        budget,
      };
    }

    if (this.state.monthlySpend + estimatedCost > this.limits.monthlyBudget) {
      return {
        allowed: false,
        reason: `Monthly budget exceeded ($${this.state.monthlySpend.toFixed(4)} / $${this.limits.monthlyBudget.toFixed(2)})`,
        budget,
      };
    }

    // Warnings
    let warning = null;
    const dailyPct =
      (this.state.dailySpend + estimatedCost) / this.limits.dailyBudget;
    const monthlyPct =
      (this.state.monthlySpend + estimatedCost) / this.limits.monthlyBudget;

    if (monthlyPct >= this.limits.warningThreshold) {
      warning = `Monthly spend at ${(monthlyPct * 100).toFixed(0)}% of $${this.limits.monthlyBudget} budget`;
    } else if (dailyPct >= this.limits.warningThreshold) {
      warning = `Daily spend at ${(dailyPct * 100).toFixed(0)}% of $${this.limits.dailyBudget} budget`;
    }

    return { allowed: true, warning, budget };
  }

  /**
   * Estimate cost for a request.
   *
   * @param {string} provider - "openai" | "anthropic" | "gemini"
   * @param {number} inputTokens
   * @param {number} estimatedOutputTokens
   * @param {Object} costPerMTok - { input, output } cost per million tokens
   * @returns {number} Estimated cost in USD
   */
  estimateCost(provider, inputTokens, estimatedOutputTokens, costPerMTok) {
    const pricing = costPerMTok || DEFAULT_COST_PER_MTOK[provider];
    if (!pricing) return 0;
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (estimatedOutputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Record actual spend after a request completes.
   *
   * @param {Object} params
   * @param {string} params.provider
   * @param {string} params.model
   * @param {number} params.cost
   * @param {number} params.inputTokens
   * @param {number} params.outputTokens
   */
  recordSpend(params) {
    const cost = params.cost || 0;
    this.state.hourlySpend += cost;
    this.state.dailySpend += cost;
    this.state.monthlySpend += cost;
    this.state.totalSpend += cost;
    this.state.requestCount++;

    this.state.history.push({
      timestamp: Date.now(),
      provider: params.provider,
      model: params.model,
      cost,
      inputTokens: params.inputTokens || 0,
      outputTokens: params.outputTokens || 0,
    });

    // Keep history manageable
    if (this.state.history.length > 1000) {
      this.state.history = this.state.history.slice(-500);
    }

    this._saveState();
  }

  /**
   * Update budget limits.
   */
  setLimits(newLimits) {
    Object.assign(this.limits, newLimits);
    this._saveState();
  }

  /**
   * Get the current budget state summary.
   */
  getBudgetSummary() {
    this._resetPeriodsIfNeeded();
    return this._getCurrentBudget();
  }

  /**
   * Get recent spend history.
   */
  getSpendHistory(limit = 50) {
    return this.state.history.slice(-limit).reverse();
  }

  _getCurrentBudget() {
    return {
      hourly: {
        spent: Math.round(this.state.hourlySpend * 10000) / 10000,
        limit: this.limits.hourlyBudget,
        remaining: Math.max(
          0,
          this.limits.hourlyBudget - this.state.hourlySpend,
        ),
        percentage: Math.round(
          (this.state.hourlySpend / this.limits.hourlyBudget) * 100,
        ),
      },
      daily: {
        spent: Math.round(this.state.dailySpend * 10000) / 10000,
        limit: this.limits.dailyBudget,
        remaining: Math.max(0, this.limits.dailyBudget - this.state.dailySpend),
        percentage: Math.round(
          (this.state.dailySpend / this.limits.dailyBudget) * 100,
        ),
      },
      monthly: {
        spent: Math.round(this.state.monthlySpend * 10000) / 10000,
        limit: this.limits.monthlyBudget,
        remaining: Math.max(
          0,
          this.limits.monthlyBudget - this.state.monthlySpend,
        ),
        percentage: Math.round(
          (this.state.monthlySpend / this.limits.monthlyBudget) * 100,
        ),
      },
      total: {
        spent: Math.round(this.state.totalSpend * 10000) / 10000,
        requests: this.state.requestCount,
      },
      limits: { ...this.limits },
    };
  }

  _resetPeriodsIfNeeded() {
    const now = Date.now();

    // Reset hourly
    if (now - this.state.lastHourReset >= 3_600_000) {
      this.state.hourlySpend = 0;
      this.state.lastHourReset = now;
    }

    // Reset daily
    if (now - this.state.lastDayReset >= 86_400_000) {
      this.state.dailySpend = 0;
      this.state.lastDayReset = now;
    }

    // Reset monthly
    if (now - this.state.lastMonthReset >= 30 * 86_400_000) {
      this.state.monthlySpend = 0;
      this.state.lastMonthReset = now;
    }
  }

  _loadState() {
    try {
      if (fs.existsSync(this._budgetFile)) {
        const data = JSON.parse(fs.readFileSync(this._budgetFile, "utf8"));
        Object.assign(this.state, data);
      }
    } catch {
      /* start fresh */
    }
  }

  _saveState() {
    try {
      const dir = path.dirname(this._budgetFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._budgetFile, JSON.stringify(this.state, null, 2));
    } catch {
      /* non-critical */
    }
  }
}

module.exports = { BudgetGuardrails };
