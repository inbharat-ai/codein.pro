/**
 * Hybrid Intelligence Orchestrator
 *
 * This is the CORE competitive advantage of CodeIn.
 *
 * World-class pattern:
 *   User Prompt
 *        ↓
 *   Complexity Classifier
 *        ↓
 *   Local Model (Qwen / DeepSeek)
 *        ↓
 *   Verification Engine
 *        ↓
 *   Confidence Score
 *        ↓
 *   Escalate? → Premium API (GPT-4 / Claude)
 *        ↓
 *   Final Verified Output + Confidence Badge
 *
 * Key design principles:
 *   - Local-first: always try local model first (free + fast)
 *   - Verify everything: typecheck, lint, import check
 *   - Escalate intelligently: only when needed, within budget
 *   - Log everything: full decision transparency
 *   - Budget-aware: never surprise users with costs
 */

const { EventEmitter } = require("events");
const { ComplexityClassifier } = require("./complexity-classifier");
const { VerificationEngine } = require("./verification-engine");
const { ConfidenceScorer } = require("./confidence-scorer");
const { BudgetGuardrails } = require("./budget-guardrails");
const { IntelligenceLogger } = require("./decision-logger");

class HybridIntelligenceOrchestrator extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.modelRouter - ModelRouter instance
   * @param {Object} options.externalProviders - ExternalProviderManager instance
   * @param {Object} options.modelRuntime - Local model runtime instance
   * @param {Function} options.localComplete - async (prompt, model, options) => response
   * @param {Function} options.premiumComplete - async (provider, messages, options) => response
   * @param {Object} options.budgetLimits - Override budget limits
   */
  constructor(options = {}) {
    super();

    this.classifier = new ComplexityClassifier(options.classifierOptions);
    this.verifier = new VerificationEngine(options.verifierOptions);
    this.scorer = new ConfidenceScorer(options.scorerOptions);
    this.budget = new BudgetGuardrails(options.budgetLimits);
    this.logger = new IntelligenceLogger(options.loggerOptions);

    // External dependencies (injected)
    this.modelRouter = options.modelRouter || null;
    this.externalProviders = options.externalProviders || null;
    this.localComplete = options.localComplete || null;
    this.premiumComplete = options.premiumComplete || null;

    // Config
    this.config = {
      autoEscalate: options.autoEscalate !== false,
      maxEscalationAttempts: options.maxEscalationAttempts ?? 2,
      verifyPremium: options.verifyPremium !== false,
      escalationThreshold: options.escalationThreshold ?? 0.45,
      preferredPremiumOrder: options.preferredPremiumOrder || [
        "anthropic",
        "openai",
        "gemini",
      ],
    };
  }

  /**
   * Process a user request through the full hybrid intelligence pipeline.
   *
   * @param {Object} request
   * @param {string} request.prompt - User prompt
   * @param {Array<{role: string, content: string}>} request.messages - Full conversation
   * @param {Object} request.context - { fileCount, contextTokens, filePaths, mode }
   * @param {string} request.preference - "auto" | "local" | "quality" | "fast" | "cost"
   * @param {boolean} request.stream - Whether to stream response
   * @returns {Promise<HybridResult>}
   */
  async process(request) {
    const startTime = Date.now();
    const timing = {};
    const requestId = `hiq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    this.emit("pipeline-start", {
      requestId,
      prompt: request.prompt?.slice(0, 100),
    });

    try {
      // ── Step 1: Classify complexity ──────────────────────────────────────
      const classifyStart = Date.now();
      const classification = this.classifier.classify(request.prompt, {
        fileCount: request.context?.fileCount || 0,
        contextTokens: request.context?.contextTokens || 0,
        mode: request.context?.mode || "ask",
        previousFailures: 0,
      });
      timing.classificationMs = Date.now() - classifyStart;

      this.emit("classified", { requestId, classification });

      // ── Step 2: Route to model ───────────────────────────────────────────
      const routeStart = Date.now();
      const routing = this.modelRouter
        ? this.modelRouter.route({
            prompt: request.prompt,
            mode: request.context?.mode || "ask",
            contextLength: request.context?.contextTokens || 0,
            preference: request.preference || "auto",
          })
        : {
            modelId: "qwen2.5-coder-7b",
            taskCategory: "general",
            confidence: 0.7,
            fallback: true,
          };
      timing.routingMs = Date.now() - routeStart;

      this.emit("routed", { requestId, routing });

      // ── Step 3: Check if we should pre-emptively escalate ────────────────
      const modelProfile = this.modelRouter?.profiles?.[routing.modelId] || {
        qualityScore: 0.7,
        isLocal: true,
      };
      const preemptive = this.scorer.shouldPreemptivelyEscalate(
        classification,
        modelProfile.qualityScore,
      );

      let useLocal = true;
      if (
        preemptive &&
        request.preference === "quality" &&
        this._hasPremiumProviders()
      ) {
        useLocal = false;
      }

      // ── Step 4: Generate with local model ────────────────────────────────
      let localResult = null;
      let localVerification = null;

      if (useLocal && this.localComplete) {
        const genStart = Date.now();
        try {
          this.emit("generating", {
            requestId,
            model: routing.modelId,
            type: "local",
          });

          localResult = await this.localComplete(
            request.prompt,
            routing.modelId,
            { messages: request.messages, stream: false, ...request.options },
          );
          timing.localGenerationMs = Date.now() - genStart;

          // ── Step 5: Verify local output ──────────────────────────────────
          const verifyStart = Date.now();
          localVerification = await this.verifier.verify(localResult, {
            language: request.context?.language,
            projectRoot: request.context?.projectRoot,
            existingImports: request.context?.existingImports,
          });
          timing.localVerificationMs = Date.now() - verifyStart;

          this.emit("verified", {
            requestId,
            verification: localVerification,
            model: routing.modelId,
          });
        } catch (err) {
          localResult = null;
          timing.localGenerationMs = Date.now() - genStart;
          this.emit("local-error", { requestId, error: err.message });
        }
      }

      // ── Step 6: Score confidence ─────────────────────────────────────────
      const confidence = this.scorer.score({
        verification: localVerification || { confidence: 0.3, passed: false },
        classification,
        model: {
          qualityScore: modelProfile.qualityScore || 0.7,
          isLocal: !modelProfile.cloud,
          type: modelProfile.type,
        },
        context: {
          tokensCovered: request.context?.contextTokens || 0,
          tokensAvailable: request.context?.totalTokens || 0,
          filesAnalyzed: request.context?.fileCount || 0,
        },
        wasEscalated: false,
      });

      this.emit("scored", { requestId, confidence });

      // ── Step 7: Escalate if needed ───────────────────────────────────────
      let escalated = false;
      let premiumResult = null;
      let premiumVerification = null;
      let escalationReason = null;
      let finalModel = routing.modelId;
      let usedProvider = null;

      const shouldEscalate =
        this.config.autoEscalate &&
        (confidence.shouldEscalate || !localResult) &&
        this._hasPremiumProviders();

      if (shouldEscalate) {
        // Budget check
        const estimatedCost = this.budget.estimateCost(
          this.config.preferredPremiumOrder[0],
          request.context?.contextTokens || 2000,
          2000, // estimated output
          { input: 5, output: 15 }, // conservative estimate
        );

        const budgetCheck = this.budget.checkBudget(estimatedCost);

        if (budgetCheck.allowed) {
          escalationReason = !localResult
            ? "Local model failed to generate"
            : !localVerification?.passed
              ? "Verification failed: " +
                (localVerification?.issues
                  ?.filter((i) => i.severity === "error")
                  .map((i) => i.message)
                  .join("; ") || "unknown issues")
              : `Low confidence (${(confidence.score * 100).toFixed(0)}%)`;

          this.emit("escalating", { requestId, reason: escalationReason });

          const escStart = Date.now();
          const escResult = await this._escalateToPremium(
            request,
            classification.complexity,
          );
          timing.premiumGenerationMs = Date.now() - escStart;

          if (escResult) {
            premiumResult = escResult.content;
            usedProvider = escResult.provider;
            finalModel = `${escResult.provider}/${escResult.model || "default"}`;
            escalated = true;

            // Record spend
            if (escResult.usage) {
              const cost = this.budget.estimateCost(
                escResult.provider,
                escResult.usage.promptTokens || 0,
                escResult.usage.completionTokens || 0,
                escResult.costPerMTok || { input: 5, output: 15 },
              );
              this.budget.recordSpend({
                provider: escResult.provider,
                model: escResult.model,
                cost,
                inputTokens: escResult.usage.promptTokens,
                outputTokens: escResult.usage.completionTokens,
              });
            }

            // Verify premium output too
            if (this.config.verifyPremium) {
              const pvStart = Date.now();
              premiumVerification = await this.verifier.verify(premiumResult, {
                language: request.context?.language,
                projectRoot: request.context?.projectRoot,
              });
              timing.premiumVerificationMs = Date.now() - pvStart;
            }
          }
        } else {
          escalationReason = `Budget exceeded: ${budgetCheck.reason}`;
          this.emit("budget-blocked", {
            requestId,
            reason: budgetCheck.reason,
          });
        }
      }

      // ── Step 8: Select best output ───────────────────────────────────────
      let finalOutput;
      let finalVerification;

      if (escalated && premiumResult) {
        // Use premium if it verified better, or local failed
        if (!localResult || !localVerification?.passed) {
          finalOutput = premiumResult;
          finalVerification = premiumVerification || localVerification;
        } else if (
          premiumVerification &&
          premiumVerification.confidence > localVerification.confidence
        ) {
          finalOutput = premiumResult;
          finalVerification = premiumVerification;
        } else {
          // Local was actually fine — use it (cheaper)
          finalOutput = localResult;
          finalVerification = localVerification;
          finalModel = routing.modelId;
          escalated = false; // didn't actually need escalation
        }
      } else {
        finalOutput = localResult || "[No output generated]";
        finalVerification = localVerification;
      }

      // Re-score final confidence with correct model
      const finalConfidence = this.scorer.score({
        verification: finalVerification || { confidence: 0.5, passed: true },
        classification,
        model: {
          qualityScore: escalated ? 0.95 : modelProfile.qualityScore || 0.7,
          isLocal: !escalated,
        },
        context: {
          tokensCovered: request.context?.contextTokens || 0,
          tokensAvailable: request.context?.totalTokens || 0,
        },
        wasEscalated: escalated,
      });

      timing.totalMs = Date.now() - startTime;

      // ── Step 9: Log decision ─────────────────────────────────────────────
      this.logger.log({
        requestId,
        prompt: request.prompt,
        classification,
        routing,
        verification: finalVerification,
        confidence: finalConfidence,
        escalation: {
          escalated,
          reason: escalationReason,
          fromModel: routing.modelId,
          toModel: escalated ? finalModel : null,
          provider: usedProvider,
        },
        timing,
        finalModel,
        success: !!finalOutput && finalOutput !== "[No output generated]",
      });

      // Record outcome for router feedback loop
      if (this.modelRouter) {
        this.modelRouter.recordOutcome(finalModel, {
          success: finalVerification?.passed || !!finalOutput,
          latencyMs: timing.totalMs,
          taskCategory: routing.taskCategory,
          instruction: request.prompt,
          response:
            typeof finalOutput === "string" ? finalOutput.slice(0, 500) : "",
        });
      }

      // ── Build result ─────────────────────────────────────────────────────
      const result = {
        requestId,
        output: finalOutput,
        confidence: finalConfidence,
        model: finalModel,
        escalated,
        escalationReason,
        classification: {
          complexity: classification.complexity,
          risk: classification.risk,
          score: classification.score,
        },
        verification: finalVerification
          ? {
              passed: finalVerification.passed,
              level: finalVerification.verificationLevel,
              issues: finalVerification.summary,
            }
          : null,
        timing,
        budget: this.budget.getBudgetSummary(),
        display: {
          ...finalConfidence.display,
          model: finalModel,
          escalated,
          analysisInfo: this._buildAnalysisInfo(
            request,
            classification,
            timing,
          ),
        },
      };

      this.emit("pipeline-complete", result);
      return result;
    } catch (err) {
      timing.totalMs = Date.now() - startTime;

      this.logger.log({
        requestId,
        prompt: request.prompt,
        timing,
        finalModel: "error",
        success: false,
        escalation: {
          escalated: false,
          reason: `Pipeline error: ${err.message}`,
        },
      });

      this.emit("pipeline-error", { requestId, error: err.message });

      return {
        requestId,
        output: null,
        error: err.message,
        confidence: {
          score: 0,
          level: "low",
          display: { badge: "🔴", label: "Error", percentage: 0 },
        },
        timing,
      };
    }
  }

  /**
   * Process with streaming support.
   * Returns the same result shape but streams tokens via events.
   */
  async processStream(request) {
    // For streaming, we skip the verify-then-escalate pattern.
    // Instead: classify → route → stream from best model → score after done.
    const classification = this.classifier.classify(request.prompt, {
      fileCount: request.context?.fileCount || 0,
      contextTokens: request.context?.contextTokens || 0,
      mode: request.context?.mode || "ask",
    });

    const shouldUsePremium =
      classification.needsPremium &&
      request.preference !== "local" &&
      this._hasPremiumProviders();

    if (shouldUsePremium) {
      return {
        streamFrom: "premium",
        classification,
        provider: this.config.preferredPremiumOrder[0],
      };
    }

    return {
      streamFrom: "local",
      classification,
      modelId: this.modelRouter?.route({ prompt: request.prompt })?.modelId,
    };
  }

  // ── Premium Escalation ─────────────────────────────────────────────────

  async _escalateToPremium(request, complexity) {
    if (!this.externalProviders) return null;

    const messages = request.messages || [
      {
        role: "system",
        content:
          "You are CodeIn, a world-class coding assistant. Provide accurate, verified code.",
      },
      { role: "user", content: request.prompt },
    ];

    // Choose provider based on complexity
    const providerOrder =
      complexity === "high"
        ? ["anthropic", "openai", "gemini"] // Claude best for complex reasoning
        : this.config.preferredPremiumOrder;

    for (const providerId of providerOrder) {
      if (!this.externalProviders.isConfigured(providerId)) continue;

      try {
        const result = await this.externalProviders.complete(
          providerId,
          messages,
          {
            maxTokens: complexity === "high" ? 8192 : 4096,
            temperature: complexity === "high" ? 0.3 : 0.7,
          },
        );

        return {
          content: result.content,
          provider: providerId,
          model: result.model,
          usage: result.usage,
          latencyMs: result.latencyMs,
        };
      } catch (err) {
        this.emit("premium-error", {
          provider: providerId,
          error: err.message,
        });
        continue;
      }
    }

    return null; // All premium providers failed
  }

  _hasPremiumProviders() {
    if (!this.externalProviders) return false;
    return this.config.preferredPremiumOrder.some((p) =>
      this.externalProviders.isConfigured(p),
    );
  }

  _buildAnalysisInfo(request, classification, timing) {
    const parts = [];
    if (request.context?.fileCount) {
      parts.push(`${request.context.fileCount} files analyzed`);
    }
    if (request.context?.contextTokens) {
      parts.push(`${request.context.contextTokens} tokens`);
    }
    parts.push(`Complexity: ${classification.complexity}`);
    if (timing.totalMs) {
      parts.push(`${timing.totalMs}ms`);
    }
    return parts.join(" · ");
  }

  // ── Public API ─────────────────────────────────────────────────────────

  getStats() {
    return {
      classifier: this.classifier.getStats(),
      verifier: this.verifier.getStats(),
      scorer: this.scorer.getStats(),
      budget: this.budget.getBudgetSummary(),
      decisions: this.logger.getDecisionStats(),
    };
  }

  getRecentDecisions(limit = 20) {
    return this.logger.getRecentDecisions(limit);
  }

  setBudgetLimits(limits) {
    this.budget.setLimits(limits);
  }

  destroy() {
    this.logger.destroy();
  }
}

module.exports = {
  HybridIntelligenceOrchestrator,
  ComplexityClassifier,
  VerificationEngine,
  ConfidenceScorer,
  BudgetGuardrails,
  IntelligenceLogger,
};
