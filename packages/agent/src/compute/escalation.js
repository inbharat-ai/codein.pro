/**
 * CodeIn Compute — Escalation Manager
 *
 * Handles escalation from local models to external APIs when
 * confidence is low, verification fails, or user requests "best quality".
 *
 * SECURITY: Never auto-sends secrets. Contexts are minimized and redacted.
 */
"use strict";

const { STEP_STATUSES } = require("./job-model");

class EscalationManager {
  /**
   * @param {object} deps
   * @param {object} deps.externalProviders - ExternalProviderManager instance
   * @param {object} deps.policyEnforcer - PolicyEnforcer instance
   */
  constructor({ externalProviders = null, policyEnforcer = null } = {}) {
    this.externalProviders = externalProviders;
    this.policyEnforcer = policyEnforcer;
    this._stats = {
      escalations: 0,
      successes: 0,
      failures: 0,
      totalCostUSD: 0,
    };
  }

  /**
   * Determine if a step should be escalated.
   * @param {object} step - Step that may need escalation
   * @param {object} policy - Job policy
   * @param {object} context
   * @param {number} context.confidence - Current confidence score (0-1)
   * @param {boolean} context.verificationFailed - Did verification fail?
   * @param {boolean} context.bestQuality - User requested best quality?
   * @param {number} context.currentCostUSD - Cost so far
   * @returns {{ shouldEscalate: boolean, reason: string }}
   */
  shouldEscalate(step, policy, context) {
    const {
      confidence = 1,
      verificationFailed = false,
      bestQuality = false,
      currentCostUSD = 0,
    } = context;

    // Check if escalation is allowed by policy
    if (this.policyEnforcer) {
      const check = this.policyEnforcer.checkEscalation(policy, currentCostUSD);
      if (!check.allowed) {
        return { shouldEscalate: false, reason: check.reason };
      }
    }

    // No external providers configured
    if (!this.externalProviders) {
      return {
        shouldEscalate: false,
        reason: "No external providers configured",
      };
    }

    // Decision logic
    if (bestQuality) {
      return { shouldEscalate: true, reason: "User requested best quality" };
    }

    if (verificationFailed) {
      return {
        shouldEscalate: true,
        reason: "Verification failed — escalating for better accuracy",
      };
    }

    if (confidence < 0.4) {
      return {
        shouldEscalate: true,
        reason: `Low confidence (${(confidence * 100).toFixed(0)}%) — escalating`,
      };
    }

    if (confidence < 0.6 && step.retryCount >= step.maxRetries) {
      return {
        shouldEscalate: true,
        reason: "Low confidence after max retries — escalating",
      };
    }

    return { shouldEscalate: false, reason: "Confidence acceptable" };
  }

  /**
   * Execute an escalated step using external API.
   * @param {object} step - Step to escalate
   * @param {object} policy - Job policy
   * @param {object} messages - LLM messages (system + user)
   * @param {object} [options]
   * @param {string} [options.preferredProvider] - "openai", "anthropic", "gemini"
   * @param {number} [options.currentCostUSD=0]
   * @returns {Promise<object>} { content, model, provider, costUSD, tokensUsed }
   */
  async escalate(step, policy, messages, options = {}) {
    const { preferredProvider, currentCostUSD = 0 } = options;

    // Double-check escalation is allowed
    if (this.policyEnforcer) {
      const check = this.policyEnforcer.checkEscalation(policy, currentCostUSD);
      if (!check.allowed) {
        throw new Error(`Escalation denied: ${check.reason}`);
      }
    }

    if (!this.externalProviders) {
      throw new Error("No external providers available for escalation");
    }

    // Redact sensitive context from messages
    const safeMessages = this._redactMessages(messages);

    // Minimize context — only send what's needed for this step
    const minimized = this._minimizeContext(safeMessages, step);

    this._stats.escalations++;
    const startTime = Date.now();

    try {
      let result;

      if (preferredProvider) {
        // Try preferred provider first
        result = await this.externalProviders.complete(
          preferredProvider,
          minimized,
          {
            maxTokens: 4096,
            temperature: 0.3, // lower temperature for tasks
          },
        );
      } else {
        // Fallback chain: cheapest first
        const providerOrder = ["gemini", "openai", "anthropic"];
        result = await this.externalProviders.completeWithFallback(
          minimized,
          {
            maxTokens: 4096,
            temperature: 0.3,
          },
          providerOrder,
        );
      }

      const costUSD = this._estimateCost(result);
      this._stats.totalCostUSD += costUSD;
      this._stats.successes++;

      return {
        content: result.content,
        model: result.model,
        provider: result.provider || preferredProvider,
        costUSD,
        tokensUsed: result.usage?.totalTokens || 0,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      this._stats.failures++;
      throw new Error(`Escalation failed: ${err.message}`);
    }
  }

  /**
   * Get escalation statistics.
   */
  getStats() {
    return { ...this._stats };
  }

  // ─── Internal ──────────────────────────────────────────────

  /**
   * Remove secrets, API keys, tokens from messages.
   */
  _redactMessages(messages) {
    return messages.map((msg) => ({
      ...msg,
      content: this._redactString(
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content),
      ),
    }));
  }

  _redactString(text) {
    if (!text) return text;
    return (
      text
        // API keys
        .replace(/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED_API_KEY]")
        .replace(/key-[a-zA-Z0-9]{20,}/g, "[REDACTED_KEY]")
        // Bearer tokens
        .replace(/Bearer\s+[a-zA-Z0-9._-]{20,}/g, "Bearer [REDACTED]")
        // Connection strings
        .replace(
          /(?:mongodb|postgres|mysql|redis):\/\/[^\s]+/g,
          "[REDACTED_CONNECTION_STRING]",
        )
        // Passwords in URLs
        .replace(/:\/\/([^:]+):([^@]+)@/g, "://$1:[REDACTED]@")
        // JWT tokens
        .replace(
          /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
          "[REDACTED_JWT]",
        )
        // AWS keys
        .replace(/AKIA[A-Z0-9]{16}/g, "[REDACTED_AWS_KEY]")
        // Private key blocks
        .replace(
          /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
          "[REDACTED_PRIVATE_KEY]",
        )
    );
  }

  /**
   * Minimize the context sent to external APIs.
   * Only include system prompt + last few relevant messages.
   */
  _minimizeContext(messages, step) {
    const minimized = [];

    // Keep system message if present
    const system = messages.find((m) => m.role === "system");
    if (system) {
      minimized.push({
        role: "system",
        content: `You are a coding assistant. Task: ${step.description}. Be concise and precise.`,
      });
    }

    // Keep only the last 3 user/assistant messages
    const nonSystem = messages.filter((m) => m.role !== "system").slice(-3);
    minimized.push(...nonSystem);

    return minimized;
  }

  /**
   * Estimate cost from usage data.
   */
  _estimateCost(result) {
    if (!result.usage) return 0;
    const { promptTokens = 0, completionTokens = 0 } = result.usage;
    // Rough estimate: $0.001 per 1K tokens average
    return ((promptTokens + completionTokens) / 1000) * 0.001;
  }
}

module.exports = {
  EscalationManager,
};
