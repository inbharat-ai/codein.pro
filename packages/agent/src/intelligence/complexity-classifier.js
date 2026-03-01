/**
 * Complexity Classifier
 *
 * Analyzes user prompts to determine task complexity, risk level,
 * and whether premium model escalation is warranted.
 *
 * This is the first stage of the Hybrid Intelligence pipeline:
 *   Prompt → ComplexityClassifier → route to local/premium
 */

const COMPLEXITY_SIGNALS = {
  // High-complexity patterns (multi-file, architecture)
  high: [
    /refactor\s+(the\s+)?(entire|whole|full|all|complete)/i,
    /redesign|re-?architect|migrate|conversion/i,
    /across\s+(multiple|several|all|many)\s+files/i,
    /\b(modular|monolith|microservice|distributed)\b.*\b(convert|split|merge)\b/i,
    /create\s+(a\s+)?(full|complete|entire)\s+(application|system|api|service)/i,
    /implement.*pattern.*(factory|observer|strategy|composite|visitor)/i,
    /security\s+(audit|review|hardening|vulnerability)/i,
    /performance\s+(optimization|profiling|bottleneck)/i,
    /database\s+(migration|schema\s+change|normalize)/i,
    /\bCI\/CD\b|\bpipeline\b.*\bconfigure\b/i,
  ],
  // Medium-complexity patterns (single-file complex changes)
  medium: [
    /add\s+(a\s+)?(feature|endpoint|route|component|module)/i,
    /write\s+(unit\s+)?tests?\s+for/i,
    /debug|diagnose|investigate|trace/i,
    /\b(async|concurrent|parallel|race\s+condition)\b/i,
    /\b(generic|template|type\s+safe|polymorphi)/i,
    /\b(api|rest|graphql|grpc)\b.*\b(design|implement|create)\b/i,
    /error\s+handling|exception|retry\s+logic/i,
    /\b(cache|memoize|optimize)\b/i,
    /\bclass\b.*\b(hierarchy|inherit|extend)\b/i,
    /\btypecheck|lint\b.*\b(fix|resolve)\b/i,
  ],
  // Low-complexity patterns (simple tasks)
  low: [
    /explain|what\s+is|how\s+does|describe|summarize/i,
    /rename|format|indent|style/i,
    /add\s+(a\s+)?(comment|docstring|jsdoc|type\s+annotation)/i,
    /fix\s+(a\s+)?(typo|spelling|import|syntax)/i,
    /\b(hello|hi|hey|thanks)\b/i,
    /what\s+(version|language|framework)/i,
    /\bprint|log|console\.log\b/i,
    /simple\s+(function|method|script)/i,
  ],
};

const RISK_SIGNALS = {
  high: [
    /security|auth(entication|orization)|password|credential|secret|token/i,
    /delete|drop|truncate|destroy|purge|wipe/i,
    /production|prod\b|deploy|release|publish/i,
    /payment|billing|credit\s*card|financial/i,
    /\bsql\b.*inject|xss|csrf|sanitize/i,
    /encryption|decrypt|hash|salt|key\s*management/i,
    /\brm\s+-rf\b|\bdel\s+\/[sq]\b/i,
    /database.*migration|schema.*change/i,
  ],
  low: [
    /explain|describe|summarize|what\s+is/i,
    /\btest\b|\bmock\b|\bfixture\b/i,
    /\bdev\b|\blocal\b|\bsandbox\b/i,
    /comment|document|readme/i,
  ],
};

// Token estimation: ~4 chars per token (rough)
function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

// Count distinct file references in prompt
function countFileReferences(text) {
  const patterns = [
    /\b[\w-]+\.(js|ts|tsx|jsx|py|java|go|rs|rb|cpp|c|h|css|html|json|yaml|yml|toml|md)\b/gi,
    /\b(src|lib|test|spec|components|pages|routes|utils|helpers|services|models)\/[\w\/-]+/gi,
  ];
  const files = new Set();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) matches.forEach((m) => files.add(m.toLowerCase()));
  }
  return files.size;
}

// Count code blocks in the prompt
function countCodeBlocks(text) {
  return (text.match(/```/g) || []).length / 2;
}

class ComplexityClassifier {
  constructor(options = {}) {
    this.thresholds = {
      highComplexityScore: options.highComplexityScore ?? 0.65,
      mediumComplexityScore: options.mediumComplexityScore ?? 0.35,
      highRiskScore: options.highRiskScore ?? 0.5,
      premiumTokenThreshold: options.premiumTokenThreshold ?? 4000,
      ...options.thresholds,
    };
    this.history = [];
    this.maxHistorySize = 100;
  }

  /**
   * Classify prompt complexity, risk, and premium-need.
   *
   * @param {string} prompt - User prompt
   * @param {Object} context - { fileCount, contextTokens, mode, previousFailures }
   * @returns {{ complexity: string, risk: string, needsPremium: boolean, score: number, riskScore: number, signals: string[], recommendation: string }}
   */
  classify(prompt, context = {}) {
    const startTime = Date.now();
    const {
      fileCount = 0,
      contextTokens = 0,
      mode = "ask",
      previousFailures = 0,
    } = context;

    // --- Complexity scoring ---
    let complexityScore = 0;
    const signals = [];

    // Pattern matching
    for (const pattern of COMPLEXITY_SIGNALS.high) {
      if (pattern.test(prompt)) {
        complexityScore += 0.25;
        signals.push(`high-pattern: ${pattern.source.slice(0, 40)}`);
      }
    }
    for (const pattern of COMPLEXITY_SIGNALS.medium) {
      if (pattern.test(prompt)) {
        complexityScore += 0.12;
        signals.push(`medium-pattern: ${pattern.source.slice(0, 40)}`);
      }
    }
    for (const pattern of COMPLEXITY_SIGNALS.low) {
      if (pattern.test(prompt)) {
        complexityScore -= 0.1;
        signals.push(`low-pattern: ${pattern.source.slice(0, 40)}`);
      }
    }

    // Structural signals
    const promptTokens = estimateTokens(prompt);
    if (promptTokens > 500) {
      complexityScore += 0.15;
      signals.push(`long-prompt: ${promptTokens} tokens`);
    }

    const fileRefs = countFileReferences(prompt);
    if (fileRefs > 3) {
      complexityScore += 0.2;
      signals.push(`multi-file: ${fileRefs} files referenced`);
    } else if (fileRefs > 1) {
      complexityScore += 0.1;
      signals.push(`multi-file: ${fileRefs} files referenced`);
    }

    const codeBlocks = countCodeBlocks(prompt);
    if (codeBlocks > 2) {
      complexityScore += 0.1;
      signals.push(`code-blocks: ${codeBlocks}`);
    }

    if (contextTokens > this.thresholds.premiumTokenThreshold) {
      complexityScore += 0.15;
      signals.push(`large-context: ${contextTokens} tokens`);
    }

    if (fileCount > 5) {
      complexityScore += 0.15;
      signals.push(`file-count: ${fileCount}`);
    }

    // Mode escalation
    if (mode === "agent" || mode === "plan") {
      complexityScore += 0.15;
      signals.push(`mode-escalation: ${mode}`);
    }

    // Previous failures boost escalation need
    if (previousFailures > 0) {
      complexityScore += previousFailures * 0.2;
      signals.push(`prev-failures: ${previousFailures}`);
    }

    // --- Risk scoring ---
    let riskScore = 0;
    for (const pattern of RISK_SIGNALS.high) {
      if (pattern.test(prompt)) {
        riskScore += 0.3;
        signals.push(`high-risk: ${pattern.source.slice(0, 40)}`);
      }
    }
    for (const pattern of RISK_SIGNALS.low) {
      if (pattern.test(prompt)) {
        riskScore -= 0.15;
      }
    }

    // Clamp scores
    complexityScore = Math.max(0, Math.min(1, complexityScore));
    riskScore = Math.max(0, Math.min(1, riskScore));

    // Classify
    const complexity =
      complexityScore >= this.thresholds.highComplexityScore
        ? "high"
        : complexityScore >= this.thresholds.mediumComplexityScore
          ? "medium"
          : "low";

    const risk = riskScore >= this.thresholds.highRiskScore ? "high" : "low";

    const needsPremium =
      complexity === "high" ||
      (complexity === "medium" && risk === "high") ||
      previousFailures >= 2;

    const recommendation = needsPremium
      ? "Escalate to premium model for best accuracy"
      : complexity === "medium"
        ? "Local model suitable; verify output"
        : "Local model confident";

    const result = {
      complexity,
      risk,
      needsPremium,
      score: Math.round(complexityScore * 100) / 100,
      riskScore: Math.round(riskScore * 100) / 100,
      signals,
      recommendation,
      classificationTimeMs: Date.now() - startTime,
    };

    // Store in history
    this._recordHistory(prompt, result);

    return result;
  }

  /**
   * Get classification stats over recent history
   */
  getStats() {
    if (this.history.length === 0) {
      return { total: 0, high: 0, medium: 0, low: 0, premiumRate: "0%" };
    }
    const counts = { high: 0, medium: 0, low: 0, premium: 0 };
    for (const entry of this.history) {
      counts[entry.complexity]++;
      if (entry.needsPremium) counts.premium++;
    }
    return {
      total: this.history.length,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      premiumRate:
        ((counts.premium / this.history.length) * 100).toFixed(1) + "%",
    };
  }

  _recordHistory(prompt, result) {
    this.history.push({
      complexity: result.complexity,
      risk: result.risk,
      needsPremium: result.needsPremium,
      score: result.score,
      timestamp: Date.now(),
    });
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }
}

module.exports = {
  ComplexityClassifier,
  COMPLEXITY_SIGNALS,
  RISK_SIGNALS,
  estimateTokens,
  countFileReferences,
};
