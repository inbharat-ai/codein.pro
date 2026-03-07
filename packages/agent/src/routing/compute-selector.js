/**
 * Compute Selector — Intelligent Task Routing
 *
 * Routes tasks to optimal compute resource based on:
 * - Task complexity (from ComplexityClassifier)
 * - Task type (code generation, analysis, image processing, etc.)
 * - Resource availability
 * - Cost optimization
 *
 * Routing Strategy:
 *
 * SMALL TASKS (complexity < 0.35):
 *   - Simple edits, refactoring, explanations
 *   → Route to LOCAL model (fast, free)
 *
 * MEDIUM TASKS (0.35 ≤ complexity < 0.65):
 *   - Multi-file reasoning, debugging, architecture
 *   → Route to SWARM (collaborative, specialized)
 *
 * HEAVY TASKS (complexity ≥ 0.65 OR special workload):
 *   - Large codebase indexing
 *   - Image/video generation
 *   - Model inference at scale
 *   - Embedding pipelines
 *   → Route to GPU (parallel, accelerated)
 */

"use strict";

const {
  ComplexityClassifier,
} = require("../intelligence/complexity-classifier");
const { logger } = require("../logger");

const COMPUTE_TARGET = {
  LOCAL: "local",
  SWARM: "swarm",
  GPU: "gpu",
  HYBRID: "hybrid",
};

const TASK_CATEGORY = {
  CODE_EDIT: "code_edit",
  CODE_GENERATION: "code_generation",
  ANALYSIS: "analysis",
  REFACTORING: "refactoring",
  DEBUGGING: "debugging",
  ARCHITECTURE: "architecture",
  IMAGE_GENERATION: "image_generation",
  EMBEDDING: "embedding",
  INDEXING: "indexing",
  TESTING: "testing",
};

// GPU-preferred workloads
const GPU_WORKLOADS = new Set([
  TASK_CATEGORY.IMAGE_GENERATION,
  TASK_CATEGORY.EMBEDDING,
  TASK_CATEGORY.INDEXING,
]);

class ComputeSelector {
  /**
   * @param {Object} options
   * @param {Object} options.complexityClassifier - ComplexityClassifier instance
   * @param {Object} options.swarmManager - SwarmManager instance
   * @param {Object} options.gpuProvider - GPU provider instance
   * @param {Object} options.modelRuntime - Local model runtime
   * @param {Object} [options.costLimits] - Budget limits per compute type
   * @param {Object} [options.thresholds] - Custom complexity thresholds
   */
  constructor(options = {}) {
    this.classifier =
      options.complexityClassifier || new ComplexityClassifier();
    this.swarmManager = options.swarmManager || null;
    this.gpuProvider = options.gpuProvider || null;
    this.modelRuntime = options.modelRuntime || null;

    this.costLimits = {
      localBudget: options.costLimits?.localBudget || Infinity,
      swarmBudget: options.costLimits?.swarmBudget || 10.0, // $10 per session
      gpuBudget: options.costLimits?.gpuBudget || 2.0, // $2 per session
      ...(options.costLimits || {}),
    };

    this.thresholds = {
      smallComplexity: options.thresholds?.smallComplexity || 0.35,
      mediumComplexity: options.thresholds?.mediumComplexity || 0.65,
      gpuMinCost: options.thresholds?.gpuMinCost || 0.1, // Min $0.10 to justify GPU spin-up
      ...(options.thresholds || {}),
    };

    // Track resource usage
    this.usage = {
      local: { calls: 0, totalCost: 0, totalTimeMs: 0 },
      swarm: { calls: 0, totalCost: 0, totalTimeMs: 0 },
      gpu: { calls: 0, totalCost: 0, totalTimeMs: 0 },
    };

    logger.info("ComputeSelector initialized", {
      thresholds: this.thresholds,
      costLimits: this.costLimits,
    });
  }

  /**
   * Select optimal compute target for a task
   *
   * @param {Object} task
   * @param {string} task.prompt - User prompt/goal
   * @param {string} [task.category] - Task category hint
   * @param {Object} [task.context] - Context (fileCount, tokens, etc.)
   * @param {string} [task.preference] - User preference ("auto", "local", "quality", "fast", "cost")
   * @returns {Object} { target: "local"|"swarm"|"gpu", reason: string, costEstimate: number, classification: {...} }
   */
  selectCompute(task) {
    const startTime = Date.now();

    // Step 1: Classify complexity
    const classification = this.classifier.classify(task.prompt, {
      fileCount: task.context?.fileCount || 0,
      contextTokens: task.context?.contextTokens || 0,
      mode: task.context?.mode || "edit",
    });

    // Step 2: Determine task category
    const category = task.category || this._inferCategory(task.prompt);

    // Step 3: Check user preference
    if (task.preference) {
      const overrideTarget = this._handlePreference(
        task.preference,
        classification,
        category,
      );
      if (overrideTarget) {
        return {
          target: overrideTarget.target,
          reason: overrideTarget.reason,
          costEstimate: overrideTarget.costEstimate,
          classification,
          category,
          selectionTimeMs: Date.now() - startTime,
        };
      }
    }

    // Step 4: Check for GPU-preferred workloads
    if (GPU_WORKLOADS.has(category)) {
      if (this._isGpuAvailable() && this._hasGpuBudget(0.1)) {
        return {
          target: COMPUTE_TARGET.GPU,
          reason: `GPU-preferred workload: ${category}`,
          costEstimate: 0.5,
          classification,
          category,
          selectionTimeMs: Date.now() - startTime,
        };
      } else {
        logger.warn("GPU-preferred workload but GPU unavailable/over-budget", {
          category,
          gpuAvailable: this._isGpuAvailable(),
          gpuBudget: this.costLimits.gpuBudget - this.usage.gpu.totalCost,
        });
      }
    }

    // Step 5: Route by complexity score
    const complexity = classification.complexityScore;

    // SMALL TASKS → LOCAL
    if (complexity < this.thresholds.smallComplexity) {
      return {
        target: COMPUTE_TARGET.LOCAL,
        reason: `Low complexity (${complexity.toFixed(2)}) — local model sufficient`,
        costEstimate: 0.001,
        classification,
        category,
        selectionTimeMs: Date.now() - startTime,
      };
    }

    // HEAVY TASKS → GPU (if available and budget permits)
    if (
      complexity >= this.thresholds.mediumComplexity &&
      classification.riskScore > 0.5
    ) {
      if (this._isGpuAvailable() && this._hasGpuBudget(0.3)) {
        return {
          target: COMPUTE_TARGET.GPU,
          reason: `High complexity (${complexity.toFixed(2)}) + high risk — GPU compute recommended`,
          costEstimate: 0.3,
          classification,
          category,
          selectionTimeMs: Date.now() - startTime,
        };
      }
    }

    // MEDIUM TASKS → SWARM
    if (this._isSwarmAvailable() && this._hasSwarmBudget(0.05)) {
      return {
        target: COMPUTE_TARGET.SWARM,
        reason: `Medium complexity (${complexity.toFixed(2)}) — multi-agent swarm optimal`,
        costEstimate: 0.05,
        classification,
        category,
        selectionTimeMs: Date.now() - startTime,
      };
    }

    // FALLBACK → LOCAL (always available)
    return {
      target: COMPUTE_TARGET.LOCAL,
      reason: "Fallback to local due to resource constraints",
      costEstimate: 0.001,
      classification,
      category,
      selectionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Execute task on selected compute target
   *
   * @param {string} target - Compute target from selectCompute()
   * @param {Object} task - Task configuration
   * @returns {Promise<Object>} Execution result
   */
  async execute(target, task) {
    const startTime = Date.now();
    let result;
    let cost = 0;

    try {
      switch (target) {
        case COMPUTE_TARGET.LOCAL:
          result = await this._executeLocal(task);
          cost = 0.001;
          break;

        case COMPUTE_TARGET.SWARM:
          result = await this._executeSwarm(task);
          cost = 0.05;
          break;

        case COMPUTE_TARGET.GPU:
          result = await this._executeGpu(task);
          cost = 0.3;
          break;

        default:
          throw new Error(`Unknown compute target: ${target}`);
      }

      // Track usage
      const elapsed = Date.now() - startTime;
      this.usage[target].calls++;
      this.usage[target].totalCost += cost;
      this.usage[target].totalTimeMs += elapsed;

      logger.info("Task executed successfully", {
        target,
        cost,
        timeMs: elapsed,
      });

      return {
        success: true,
        result,
        target,
        cost,
        timeMs: elapsed,
      };
    } catch (error) {
      logger.error("Task execution failed", {
        target,
        error: error.message,
        timeMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Get current resource usage statistics
   */
  getUsage() {
    return {
      local: { ...this.usage.local },
      swarm: { ...this.usage.swarm },
      gpu: { ...this.usage.gpu },
      limits: { ...this.costLimits },
      remaining: {
        swarm: this.costLimits.swarmBudget - this.usage.swarm.totalCost,
        gpu: this.costLimits.gpuBudget - this.usage.gpu.totalCost,
      },
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsage() {
    this.usage.local = { calls: 0, totalCost: 0, totalTimeMs: 0 };
    this.usage.swarm = { calls: 0, totalCost: 0, totalTimeMs: 0 };
    this.usage.gpu = { calls: 0, totalCost: 0, totalTimeMs: 0 };
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  _inferCategory(prompt) {
    const lower = prompt.toLowerCase();

    if (/generate.*image|create.*image|draw|visualize/.test(lower)) {
      return TASK_CATEGORY.IMAGE_GENERATION;
    }
    if (/index|embed|vector|search/.test(lower)) {
      return TASK_CATEGORY.EMBEDDING;
    }
    if (/refactor|restructure|reorganize/.test(lower)) {
      return TASK_CATEGORY.REFACTORING;
    }
    if (/debug|fix.*bug|trace|diagnose/.test(lower)) {
      return TASK_CATEGORY.DEBUGGING;
    }
    if (/architect|design|pattern|structure/.test(lower)) {
      return TASK_CATEGORY.ARCHITECTURE;
    }
    if (/test|spec|coverage/.test(lower)) {
      return TASK_CATEGORY.TESTING;
    }
    if (/analyze|review|explain/.test(lower)) {
      return TASK_CATEGORY.ANALYSIS;
    }
    if (/create|generate|build|implement/.test(lower)) {
      return TASK_CATEGORY.CODE_GENERATION;
    }

    return TASK_CATEGORY.CODE_EDIT;
  }

  _handlePreference(preference, _classification, _category) {
    switch (preference) {
      case "local":
        return {
          target: COMPUTE_TARGET.LOCAL,
          reason: "User preference: local",
          costEstimate: 0.001,
        };

      case "quality":
        // Always use GPU for quality
        if (this._isGpuAvailable() && this._hasGpuBudget(0.3)) {
          return {
            target: COMPUTE_TARGET.GPU,
            reason: "User preference: maximum quality",
            costEstimate: 0.3,
          };
        }
        // Fallback to swarm
        if (this._isSwarmAvailable()) {
          return {
            target: COMPUTE_TARGET.SWARM,
            reason: "User preference: quality (GPU unavailable)",
            costEstimate: 0.05,
          };
        }
        return null; // Use auto selection

      case "fast":
        // Fast = local (no network latency)
        return {
          target: COMPUTE_TARGET.LOCAL,
          reason: "User preference: speed (local execution)",
          costEstimate: 0.001,
        };

      case "cost":
        // Cost = local (free)
        return {
          target: COMPUTE_TARGET.LOCAL,
          reason: "User preference: minimize cost",
          costEstimate: 0.001,
        };

      case "auto":
      default:
        return null; // Use auto selection
    }
  }

  _isGpuAvailable() {
    return this.gpuProvider && typeof this.gpuProvider.createPod === "function";
  }

  _isSwarmAvailable() {
    return (
      this.swarmManager &&
      typeof this.swarmManager.taskOrchestrate === "function"
    );
  }

  _hasGpuBudget(cost) {
    return this.usage.gpu.totalCost + cost <= this.costLimits.gpuBudget;
  }

  _hasSwarmBudget(cost) {
    return this.usage.swarm.totalCost + cost <= this.costLimits.swarmBudget;
  }

  async _executeLocal(task) {
    if (!this.modelRuntime) {
      throw new Error("Local model runtime not available");
    }

    // Execute with local model
    const response = await this.modelRuntime.complete({
      prompt: task.prompt,
      maxTokens: task.maxTokens || 2048,
      temperature: task.temperature || 0.7,
    });

    return {
      type: "local",
      response,
      model: this.modelRuntime.currentModel || "unknown",
    };
  }

  async _executeSwarm(task) {
    if (!this.swarmManager) {
      throw new Error("Swarm manager not available");
    }

    // Orchestrate with multi-agent swarm
    const swarmResult = await this.swarmManager.taskOrchestrate({
      goal: task.prompt,
      topology: task.topology || "mesh",
      strategy: task.strategy || "collaborative",
      context: task.context || {},
    });

    return {
      type: "swarm",
      taskId: swarmResult.taskId,
      status: swarmResult.status,
    };
  }

  async _executeGpu(task) {
    if (!this.gpuProvider) {
      throw new Error("GPU provider not available");
    }

    // Create GPU pod and submit job
    const pod = await this.gpuProvider.createPod({
      gpuType: task.gpuType || "RTX4090",
      image: task.image || "pytorch/pytorch:latest",
    });

    const job = await this.gpuProvider.submitJob(pod.podId, {
      command: task.command || "python main.py",
      args: task.args || [],
    });

    return {
      type: "gpu",
      podId: pod.podId,
      jobId: job.jobId,
      status: job.status,
    };
  }
}

module.exports = {
  ComputeSelector,
  COMPUTE_TARGET,
  TASK_CATEGORY,
};
