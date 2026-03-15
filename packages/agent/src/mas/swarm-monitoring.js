/**
 * CodeIn MAS — Swarm Monitoring Module
 *
 * Handles metrics, analytics, event logging, budget tracking,
 * cost aggregation, and SSE event broadcasting.
 *
 * Extracted from swarm-manager.js as part of the decomposition.
 */
"use strict";

/**
 * Attach monitoring methods to SwarmManager.prototype.
 * @param {Function} SwarmManager — the SwarmManager class
 */
function applyMonitoringMethods(SwarmManager) {
  const proto = SwarmManager.prototype;

  // ════════════════════════════════════════════════════════════
  // Analytics & Cost API
  // ════════════════════════════════════════════════════════════

  /**
   * Get cost analytics from persistence layer.
   * @param {string} [sessionId] — Optional session filter
   * @returns {object|null}
   */
  proto.getAnalytics = function getAnalytics(sessionId) {
    if (!this._persistence) return null;
    return this._persistence.getAnalytics(sessionId);
  };

  /** Get current budget status. */
  proto.getBudgetStatus = function getBudgetStatus() {
    return this._costRouter ? this._costRouter.getBudgetStatus() : null;
  };

  /** Get cost optimization suggestions. */
  proto.getCostSuggestions = function getCostSuggestions() {
    if (!this._costRouter || !this._persistence) return [];
    return this._costRouter.suggestCostOptimization(
      this._persistence.getAnalytics(),
    );
  };

  // ════════════════════════════════════════════════════════════
  // SSE Event Streaming
  // ════════════════════════════════════════════════════════════

  /**
   * Subscribe a response object to the SSE stream.
   * @param {object} res — HTTP response (must support .write() and .end())
   */
  proto.subscribe = function subscribe(res) {
    this._subscribers.add(res);
    // Send recent events as replay
    const recent = this._eventLog.slice(-50);
    for (const event of recent) {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        /* subscriber disconnected */
      }
    }
  };

  proto.unsubscribe = function unsubscribe(res) {
    this._subscribers.delete(res);
  };

  proto.getEventLog = function getEventLog(limit = 100) {
    return this._eventLog.slice(-limit);
  };

  // ════════════════════════════════════════════════════════════
  // Internal: Broadcasting & Cost Tracking
  // ════════════════════════════════════════════════════════════

  proto._broadcast = function _broadcast(event) {
    this._eventLog.push(event);
    if (this._eventLog.length > this._maxEvents) {
      this._eventLog = this._eventLog.slice(-this._maxEvents);
    }

    // Persist event to SQLite
    if (this._persistence && this._persistence.recordEvent) {
      try {
        this._persistence.recordEvent(event);
      } catch {
        // Non-fatal — don't let persistence errors break event flow
      }
    }

    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const sub of this._subscribers) {
      try {
        sub.write(data);
      } catch {
        this._subscribers.delete(sub);
      }
    }

    this.emit("swarm:event", event);
  };

  /**
   * Track LLM spend in the CostRouter for budget enforcement.
   * @private
   */
  proto._trackCostRouterSpend = function _trackCostRouterSpend(result, opts) {
    if (!this._costRouter || !result) return;
    try {
      if (typeof result === "object" && result.usage) {
        const inputTokens =
          result.usage.input_tokens || result.usage.prompt_tokens || 0;
        const outputTokens =
          result.usage.output_tokens || result.usage.completion_tokens || 0;
        const model = result.model || opts.model || "unknown";
        this._costRouter.trackSpend({
          model,
          inputTokens,
          outputTokens,
          agentType: opts.agentType || opts._agentType || "unknown",
        });
      }
    } catch {
      /* non-fatal */
    }
  };
}

module.exports = { applyMonitoringMethods };
