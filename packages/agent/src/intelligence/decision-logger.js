/**
 * Intelligence Decision Logger
 *
 * Structured logging for every intelligence pipeline decision:
 *   - Which model answered
 *   - Why it was chosen
 *   - Escalation reason (if any)
 *   - Time taken at each stage
 *   - Verification results
 *   - Confidence score
 *
 * Logs are stored as JSONL for easy analysis and debugging.
 * Makes the system transparent and auditable.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const LOG_DIR = path.join(os.homedir(), ".codin", "intelligence-logs");

class IntelligenceLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || LOG_DIR;
    this.maxLogFiles = options.maxLogFiles ?? 30; // days of logs
    this.buffer = [];
    this.flushInterval = options.flushInterval ?? 5000;
    this.listeners = new Map();
    this._ensureDir();

    // Auto-flush timer
    this._timer = setInterval(() => this.flush(), this.flushInterval);
    if (this._timer.unref) this._timer.unref();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {
      /* non-critical */
    }
  }

  _logFilePath() {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(this.logDir, `decisions-${date}.jsonl`);
  }

  /**
   * Log a complete intelligence pipeline decision.
   *
   * @param {Object} entry
   * @param {string} entry.requestId - Unique request identifier
   * @param {string} entry.prompt - User prompt (truncated for privacy)
   * @param {Object} entry.classification - ComplexityClassifier output
   * @param {Object} entry.routing - ModelRouter decision
   * @param {Object} entry.verification - VerificationEngine result
   * @param {Object} entry.confidence - ConfidenceScorer output
   * @param {Object} entry.escalation - { escalated, reason, fromModel, toModel }
   * @param {Object} entry.timing - { classificationMs, routingMs, generationMs, verificationMs, totalMs }
   * @param {string} entry.finalModel - Model that produced the accepted output
   * @param {boolean} entry.success - Whether the request succeeded
   */
  log(entry) {
    const record = {
      timestamp: new Date().toISOString(),
      requestId:
        entry.requestId || crypto.randomUUID?.() || Date.now().toString(36),
      prompt: this._truncatePrompt(entry.prompt),
      classification: entry.classification
        ? {
            complexity: entry.classification.complexity,
            risk: entry.classification.risk,
            score: entry.classification.score,
            needsPremium: entry.classification.needsPremium,
            signals: entry.classification.signals?.slice(0, 5),
          }
        : null,
      routing: entry.routing
        ? {
            modelId: entry.routing.modelId,
            taskCategory: entry.routing.taskCategory,
            confidence: entry.routing.confidence,
            reason: entry.routing.reason,
            fallback: entry.routing.fallback,
            alternatives: entry.routing.alternatives,
          }
        : null,
      verification: entry.verification
        ? {
            passed: entry.verification.passed,
            confidence: entry.verification.confidence,
            errors: entry.verification.summary?.errors,
            warnings: entry.verification.summary?.warnings,
            verificationLevel: entry.verification.verificationLevel,
          }
        : null,
      confidence: entry.confidence
        ? {
            score: entry.confidence.score,
            level: entry.confidence.level,
            shouldEscalate: entry.confidence.shouldEscalate,
            breakdown: entry.confidence.breakdown,
          }
        : null,
      escalation: entry.escalation || { escalated: false },
      timing: entry.timing || {},
      finalModel: entry.finalModel || "unknown",
      success: entry.success !== false,
    };

    this.buffer.push(record);

    // Emit to registered listeners
    for (const [, listener] of this.listeners) {
      try {
        listener(record);
      } catch {
        /* ignore listener errors */
      }
    }

    // Auto-flush if buffer is large
    if (this.buffer.length >= 50) {
      this.flush();
    }

    return record;
  }

  /**
   * Flush log buffer to disk.
   */
  flush() {
    if (this.buffer.length === 0) return;

    try {
      const lines = this.buffer.map((r) => JSON.stringify(r)).join("\n") + "\n";
      fs.appendFileSync(this._logFilePath(), lines, "utf8");
      this.buffer = [];
    } catch {
      /* non-critical */
    }

    this._rotateOldLogs();
  }

  /**
   * Register a real-time listener for decisions.
   * @param {string} id
   * @param {Function} callback
   */
  onDecision(id, callback) {
    this.listeners.set(id, callback);
  }

  /**
   * Remove a listener.
   */
  removeListener(id) {
    this.listeners.delete(id);
  }

  /**
   * Read recent decisions from the current day's log.
   * @param {number} limit
   * @returns {Object[]}
   */
  getRecentDecisions(limit = 50) {
    try {
      const filePath = this._logFilePath();
      if (!fs.existsSync(filePath))
        return [...this.buffer].reverse().slice(0, limit);

      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n").filter(Boolean);
      const parsed = lines
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // Merge buffer
      const all = [...parsed, ...this.buffer];
      return all.reverse().slice(0, limit);
    } catch {
      return [...this.buffer].reverse().slice(0, limit);
    }
  }

  /**
   * Get aggregated statistics over recent decisions.
   */
  getDecisionStats(days = 1) {
    const decisions = this._readDays(days);
    if (decisions.length === 0) {
      return { total: 0, escalationRate: "0%", avgConfidence: 0 };
    }

    const stats = {
      total: decisions.length,
      success: decisions.filter((d) => d.success).length,
      escalated: decisions.filter((d) => d.escalation?.escalated).length,
      byComplexity: { high: 0, medium: 0, low: 0 },
      byModel: {},
      avgConfidence: 0,
      avgTotalMs: 0,
      verificationPassRate: "0%",
    };

    let confSum = 0;
    let timeSum = 0;
    let verifyCount = 0;
    let verifyPass = 0;

    for (const d of decisions) {
      if (d.classification?.complexity) {
        stats.byComplexity[d.classification.complexity] =
          (stats.byComplexity[d.classification.complexity] || 0) + 1;
      }
      if (d.finalModel) {
        stats.byModel[d.finalModel] = (stats.byModel[d.finalModel] || 0) + 1;
      }
      if (d.confidence?.score !== null && d.confidence?.score !== undefined)
        confSum += d.confidence.score;
      if (d.timing?.totalMs) timeSum += d.timing.totalMs;
      if (d.verification) {
        verifyCount++;
        if (d.verification.passed) verifyPass++;
      }
    }

    stats.avgConfidence = Math.round((confSum / decisions.length) * 100) / 100;
    stats.avgTotalMs = Math.round(timeSum / decisions.length);
    stats.escalationRate =
      ((stats.escalated / decisions.length) * 100).toFixed(1) + "%";
    stats.successRate =
      ((stats.success / decisions.length) * 100).toFixed(1) + "%";
    stats.verificationPassRate =
      verifyCount > 0
        ? ((verifyPass / verifyCount) * 100).toFixed(1) + "%"
        : "N/A";

    return stats;
  }

  _readDays(days) {
    const results = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 86400000)
        .toISOString()
        .slice(0, 10);
      const filePath = path.join(this.logDir, `decisions-${date}.jsonl`);
      try {
        if (fs.existsSync(filePath)) {
          const lines = fs
            .readFileSync(filePath, "utf8")
            .split("\n")
            .filter(Boolean);
          for (const line of lines) {
            try {
              results.push(JSON.parse(line));
            } catch {
              /* skip */
            }
          }
        }
      } catch {
        /* skip */
      }
    }
    // Include buffer
    results.push(...this.buffer);
    return results;
  }

  _rotateOldLogs() {
    try {
      const files = fs
        .readdirSync(this.logDir)
        .filter((f) => f.startsWith("decisions-") && f.endsWith(".jsonl"))
        .sort();
      while (files.length > this.maxLogFiles) {
        const old = files.shift();
        try {
          fs.unlinkSync(path.join(this.logDir, old));
        } catch {
          /* skip */
        }
      }
    } catch {
      /* non-critical */
    }
  }

  _truncatePrompt(prompt) {
    if (!prompt) return "";
    return prompt.length > 200 ? prompt.slice(0, 200) + "…" : prompt;
  }

  /**
   * Destroy logger (clear timer).
   */
  destroy() {
    if (this._timer) clearInterval(this._timer);
    this.flush();
  }
}

module.exports = { IntelligenceLogger };
