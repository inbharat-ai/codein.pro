/**
 * CodeIn Compute — Orchestrator
 *
 * Main entry point for the compute pipeline.
 * Coordinates: input processing → planning → execution → output.
 *
 * This is the top-level API that routes/compute.js calls.
 */
"use strict";

const { EventEmitter } = require("node:events");
const { createJob, JOB_STATUSES } = require("./job-model");
const { ComputeStateMachine } = require("./state-machine");
const { JobStore } = require("./job-store");
const { ComputeEventStream } = require("./event-stream");
const { ComputePlanner } = require("./planner");
const { ComputeExecutor } = require("./executor");
const { PolicyEnforcer } = require("./policy");
const { ComputeMultilingualAdapter } = require("./multilingual");

class ComputeOrchestrator extends EventEmitter {
  /**
   * @param {object} deps - Injected dependencies from the main server
   * @param {object} [deps.modelRuntime]
   * @param {object} [deps.modelRouter]
   * @param {object} [deps.externalProviders]
   * @param {object} [deps.i18nOrchestrator]
   * @param {object} [deps.languageDetector]
   * @param {object} [deps.termPreservator]
   * @param {object} [deps.mcpClientManager]
   */
  constructor(deps = {}) {
    super();

    // Core components
    this.stateMachine = new ComputeStateMachine();
    this.jobStore = new JobStore();
    this.eventStream = new ComputeEventStream();
    this.policyEnforcer = new PolicyEnforcer();

    // Planner
    this.planner = new ComputePlanner({
      modelRuntime: deps.modelRuntime,
      modelRouter: deps.modelRouter,
      externalProviders: deps.externalProviders,
    });

    // Executor
    this.executor = new ComputeExecutor({
      modelRuntime: deps.modelRuntime,
      modelRouter: deps.modelRouter,
      externalProviders: deps.externalProviders,
      eventStream: this.eventStream,
      stateMachine: this.stateMachine,
      jobStore: this.jobStore,
      policyEnforcer: this.policyEnforcer,
      mcpClientManager: deps.mcpClientManager,
    });

    // Multilingual
    this.multilingual = new ComputeMultilingualAdapter({
      i18nOrchestrator: deps.i18nOrchestrator,
      languageDetector: deps.languageDetector,
      termPreservator: deps.termPreservator,
    });

    // Forward state machine events
    this.stateMachine.on("job:transition", (data) =>
      this.emit("job:transition", data),
    );
    this.stateMachine.on("step:transition", (data) =>
      this.emit("step:transition", data),
    );
  }

  /**
   * Submit a new compute job.
   * @param {object} params
   * @param {string} params.goal - User's goal
   * @param {string} [params.userId] - User ID
   * @param {string} [params.language] - Language hint
   * @param {string} [params.audioPath] - Voice input audio path
   * @param {object} [params.policy] - Policy overrides
   * @param {object} [params.context] - Additional context
   * @returns {Promise<object>} The created job (with status: queued or planning)
   */
  async submitJob({ goal, userId, language, audioPath, policy, context }) {
    // Step 1: Process multilingual input
    const inputResult = await this.multilingual.processInput({
      text: goal,
      audioPath,
      hintLanguage: language,
    });

    // Step 2: Create job
    const mergedPolicy = this.policyEnforcer.mergeWithDefaults(policy);
    const job = createJob({
      goal: inputResult.english, // Internal goal is always English
      userId,
      language: inputResult.language,
      policy: mergedPolicy,
    });
    job.goalOriginal = inputResult.original;

    // Save immediately
    this.jobStore.save(job);

    // Step 3: If language detection confidence is low, ask for confirmation
    if (inputResult.needsConfirmation) {
      this.stateMachine.transitionJob(job, JOB_STATUSES.WAITING_USER, {
        reason: `Language detected as '${inputResult.language}' with low confidence (${(inputResult.confidence * 100).toFixed(0)}%). Please confirm.`,
      });
      this.jobStore.save(job);
      return job;
    }

    // Step 4: Start planning (async — don't block response)
    this._startPipeline(job, context).catch((err) => {
      // Pipeline error — mark job as failed
      try {
        if (!this.stateMachine.isTerminal(job)) {
          this.stateMachine.transitionJob(job, JOB_STATUSES.FAILED, {
            error: err,
          });
          this.jobStore.save(job);
          this.eventStream.emitError(job.id, {
            error: err.message,
            recoverable: false,
          });
        }
      } catch {
        /* ignore double-transition */
      }
    });

    return job;
  }

  /**
   * Run the full pipeline: plan → execute → output.
   */
  async _startPipeline(job, context = {}) {
    // Plan
    this.stateMachine.transitionJob(job, JOB_STATUSES.PLANNING);
    this.jobStore.save(job);
    this.eventStream.emitJobProgress(job.id, {
      status: "planning",
      progress: 0,
      message: "Generating execution plan...",
    });

    const plan = await this.planner.plan({
      goal: job.goal,
      policy: job.policy,
      context,
    });

    job.plan = plan.summary;
    job.steps = plan.steps;
    this.jobStore.save(job);

    this.eventStream.emitPlanReady(job.id, {
      plan: plan.summary,
      stepCount: plan.steps.length,
    });

    // Execute
    this.stateMachine.transitionJob(job, JOB_STATUSES.RUNNING);
    this.jobStore.save(job);

    await this.executor.executeJob(job);

    // Translate outputs if needed
    if (job.language !== "en" && job.status === JOB_STATUSES.COMPLETED) {
      await this._translateOutputs(job);
    }

    this.jobStore.save(job);
  }

  /**
   * Translate job outputs back to user's language.
   */
  async _translateOutputs(job) {
    for (const step of job.steps) {
      if (step.output && typeof step.output === "string") {
        try {
          const result = await this.multilingual.processOutput({
            text: step.output,
            language: job.language,
          });
          step.outputTranslated = result.translated;
        } catch {
          // Keep English output
        }
      }
    }
  }

  // ─── Job Management API ────────────────────────────────────

  /**
   * Get a job by ID.
   */
  getJob(jobId) {
    return this.jobStore.load(jobId);
  }

  /**
   * List jobs.
   */
  listJobs(filters = {}) {
    return this.jobStore.list(filters);
  }

  /**
   * Cancel a job.
   */
  cancelJob(jobId) {
    const job = this.jobStore.load(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    // Try to cancel active execution first
    if (this.executor.isJobActive(jobId)) {
      this.executor.cancelJob(jobId);
    } else if (!this.stateMachine.isTerminal(job)) {
      this.stateMachine.transitionJob(job, JOB_STATUSES.CANCELLED, {
        reason: "User cancelled",
      });
      this.jobStore.save(job);
      this.eventStream.complete(job.id, "job.cancelled", {
        reason: "Cancelled by user",
      });
    }

    return this.jobStore.load(jobId);
  }

  /**
   * Pause a running job.
   */
  pauseJob(jobId) {
    if (this.executor.isJobActive(jobId)) {
      this.executor.pauseJob(jobId);
      return true;
    }
    return false;
  }

  /**
   * Resume a paused job.
   */
  resumeJob(jobId) {
    const job = this.jobStore.load(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    if (job.status === JOB_STATUSES.PAUSED) {
      this.executor.resumeJob(jobId);
      return true;
    }
    if (job.status === JOB_STATUSES.WAITING_USER) {
      // User confirmed — resume pipeline
      this.stateMachine.transitionJob(job, JOB_STATUSES.PLANNING);
      this.jobStore.save(job);
      this._startPipeline(job).catch((err) => {
        this.stateMachine.transitionJob(job, JOB_STATUSES.FAILED, {
          error: err,
        });
        this.jobStore.save(job);
      });
      return true;
    }
    return false;
  }

  /**
   * Delete a job.
   */
  deleteJob(jobId) {
    if (this.executor.isJobActive(jobId)) {
      this.executor.cancelJob(jobId);
    }
    return this.jobStore.delete(jobId);
  }

  /**
   * Get job artifacts.
   */
  getJobArtifacts(jobId) {
    const { ArtifactManager } = require("./artifact-manager");
    const am = new ArtifactManager();
    const workspaceDir = this.jobStore.getWorkspaceDir(jobId);
    return am.list(workspaceDir);
  }

  /**
   * Read a specific artifact.
   */
  readArtifact(jobId, artifactId) {
    const { ArtifactManager } = require("./artifact-manager");
    const am = new ArtifactManager();
    const workspaceDir = this.jobStore.getWorkspaceDir(jobId);
    return am.read(workspaceDir, artifactId);
  }

  /**
   * Subscribe to job events (SSE).
   */
  subscribeToEvents(jobId, res, req) {
    this.eventStream.subscribe(jobId, res, req);
  }

  /**
   * Get compute statistics.
   */
  getStats() {
    return {
      jobs: this.jobStore.getStats(),
      events: this.eventStream.getStats(),
      escalation: this.executor.escalationManager.getStats(),
      multilingual: this.multilingual.getCapabilities(),
    };
  }

  /**
   * Cleanup old jobs.
   */
  cleanup(maxAgeMs) {
    return this.jobStore.cleanup(maxAgeMs);
  }

  /**
   * Shutdown: disconnect all SSE clients.
   */
  shutdown() {
    this.eventStream.disconnectAll();
  }
}

module.exports = {
  ComputeOrchestrator,
};
