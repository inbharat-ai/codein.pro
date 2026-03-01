/**
 * Confidence Scorer
 *
 * Produces a composite confidence score for any LLM output based on:
 *   1. Verification result (syntax, lint, typecheck)
 *   2. Model quality tier (local vs premium)
 *   3. Complexity classification match
 *   4. Context coverage (how much relevant context was provided)
 *   5. Escalation history
 *
 * Displayed to users as:
 *   🟢 High Confidence (≥ 0.80)
 *   🟡 Medium Confidence (0.50–0.79)
 *   🔴 Low Confidence (< 0.50, escalation suggested)
 */

class ConfidenceScorer {
  constructor(options = {}) {
    this.weights = {
      verification: options.verificationWeight ?? 0.35,
      modelQuality: options.modelQualityWeight ?? 0.25,
      complexityMatch: options.complexityMatchWeight ?? 0.2,
      contextCoverage: options.contextCoverageWeight ?? 0.15,
      history: options.historyWeight ?? 0.05,
    };
    this.thresholds = {
      high: options.highThreshold ?? 0.8,
      medium: options.mediumThreshold ?? 0.5,
      escalation: options.escalationThreshold ?? 0.45,
    };
    this.history = [];
    this.maxHistory = 200;
  }

  /**
   * Calculate confidence score.
   *
   * @param {Object} params
   * @param {Object} params.verification - Output from VerificationEngine.verify()
   * @param {Object} params.classification - Output from ComplexityClassifier.classify()
   * @param {Object} params.model - { qualityScore, type, provider, isLocal }
   * @param {Object} params.context - { tokensCovered, tokensAvailable, filesAnalyzed }
   * @param {boolean} params.wasEscalated - Whether premium model was already used
   * @returns {{ score: number, level: string, shouldEscalate: boolean, breakdown: Object, display: Object }}
   */
  score(params) {
    const {
      verification = { confidence: 0.5, passed: true },
      classification = { complexity: "low", score: 0.2, needsPremium: false },
      model = { qualityScore: 0.7, isLocal: true },
      context = {},
      wasEscalated = false,
    } = params;

    // 1. Verification component (0–1)
    const verificationScore = verification.confidence || 0.5;

    // 2. Model quality component (0–1)
    const modelScore = model.qualityScore || 0.6;

    // 3. Complexity match: did we use the right tier?
    let complexityMatchScore = 0.8;
    if (classification.needsPremium && model.isLocal) {
      // High-complexity task on local model → lower confidence
      complexityMatchScore = 0.3;
    } else if (!classification.needsPremium && model.isLocal) {
      // Low-complexity on local → perfect match
      complexityMatchScore = 0.95;
    } else if (classification.needsPremium && !model.isLocal) {
      // High-complexity on premium → good match
      complexityMatchScore = 0.9;
    }

    // 4. Context coverage (0–1)
    const tokensUsed = context.tokensCovered || 0;
    const tokensAvailable = context.tokensAvailable || 1;
    const contextScore =
      tokensAvailable > 0 ? Math.min(1, tokensUsed / tokensAvailable) : 0.7; // unknown context → moderate

    // 5. History component (did recent similar tasks succeed?)
    const historyScore = this._getHistoryScore(classification.complexity);

    // --- Weighted composite ---
    const composite =
      this.weights.verification * verificationScore +
      this.weights.modelQuality * modelScore +
      this.weights.complexityMatch * complexityMatchScore +
      this.weights.contextCoverage * contextScore +
      this.weights.history * historyScore;

    const score = Math.max(0, Math.min(1, Math.round(composite * 100) / 100));

    // Determine level
    const level =
      score >= this.thresholds.high
        ? "high"
        : score >= this.thresholds.medium
          ? "medium"
          : "low";

    // Should we escalate?
    const shouldEscalate =
      !wasEscalated &&
      (score < this.thresholds.escalation ||
        (!verification.passed && model.isLocal));

    // Display data
    const display = {
      badge: level === "high" ? "🟢" : level === "medium" ? "🟡" : "🔴",
      label: `${level.charAt(0).toUpperCase() + level.slice(1)} Confidence`,
      percentage: Math.round(score * 100),
      checks: [],
    };

    if (verification.checksRun) {
      for (const check of verification.checksRun) {
        const passed = !verification.issues?.some(
          (i) => i.source === check && i.severity === "error",
        );
        display.checks.push({
          name: check,
          passed,
          icon: passed ? "✓" : "✗",
        });
      }
    }

    const result = {
      score,
      level,
      shouldEscalate,
      breakdown: {
        verification: Math.round(verificationScore * 100) / 100,
        modelQuality: Math.round(modelScore * 100) / 100,
        complexityMatch: Math.round(complexityMatchScore * 100) / 100,
        contextCoverage: Math.round(contextScore * 100) / 100,
        history: Math.round(historyScore * 100) / 100,
      },
      display,
      wasEscalated,
    };

    this._recordHistory(classification.complexity, score, verification.passed);

    return result;
  }

  /**
   * Quick check if escalation should happen (before running full verify).
   */
  shouldPreemptivelyEscalate(classification, modelQuality) {
    if (classification.needsPremium) return true;
    if (classification.complexity === "high" && modelQuality < 0.75)
      return true;
    return false;
  }

  /**
   * Get recent history based score for a complexity level.
   */
  _getHistoryScore(complexity) {
    const recent = this.history
      .filter((h) => h.complexity === complexity)
      .slice(-10);

    if (recent.length < 3) return 0.7; // not enough data

    const successRate = recent.filter((h) => h.passed).length / recent.length;
    const avgScore =
      recent.reduce((sum, h) => sum + h.score, 0) / recent.length;

    return successRate * 0.6 + avgScore * 0.4;
  }

  _recordHistory(complexity, score, passed) {
    this.history.push({ complexity, score, passed, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  getStats() {
    if (this.history.length === 0) {
      return { total: 0, avgScore: 0, escalationRate: "0%" };
    }
    const avgScore =
      this.history.reduce((s, h) => s + h.score, 0) / this.history.length;
    const escalations = this.history.filter(
      (h) => h.score < this.thresholds.escalation,
    ).length;
    return {
      total: this.history.length,
      avgScore: Math.round(avgScore * 100) / 100,
      passRate:
        (
          (this.history.filter((h) => h.passed).length / this.history.length) *
          100
        ).toFixed(1) + "%",
      escalationRate:
        ((escalations / this.history.length) * 100).toFixed(1) + "%",
      byComplexity: {
        high: this._statsForComplexity("high"),
        medium: this._statsForComplexity("medium"),
        low: this._statsForComplexity("low"),
      },
    };
  }

  _statsForComplexity(level) {
    const items = this.history.filter((h) => h.complexity === level);
    if (items.length === 0) return { count: 0, avgScore: 0 };
    return {
      count: items.length,
      avgScore:
        Math.round(
          (items.reduce((s, h) => s + h.score, 0) / items.length) * 100,
        ) / 100,
    };
  }
}

module.exports = { ConfidenceScorer };
