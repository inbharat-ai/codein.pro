/**
 * CodeIn Compute — State Machine
 *
 * Manages job lifecycle transitions with guards.
 * Emits events on every transition for audit + UI streaming.
 */
"use strict";

const { EventEmitter } = require("node:events");
const { JOB_STATUSES, STEP_STATUSES } = require("./job-model");

// ─── Transition Table ────────────────────────────────────────
// { from: [allowed-to-states] }
const TRANSITIONS = Object.freeze({
  [JOB_STATUSES.QUEUED]: [
    JOB_STATUSES.PLANNING,
    JOB_STATUSES.CANCELLED,
    JOB_STATUSES.FAILED,
  ],
  [JOB_STATUSES.PLANNING]: [
    JOB_STATUSES.RUNNING,
    JOB_STATUSES.FAILED,
    JOB_STATUSES.CANCELLED,
  ],
  [JOB_STATUSES.RUNNING]: [
    JOB_STATUSES.WAITING_USER,
    JOB_STATUSES.PAUSED,
    JOB_STATUSES.COMPLETED,
    JOB_STATUSES.FAILED,
    JOB_STATUSES.CANCELLED,
  ],
  [JOB_STATUSES.WAITING_USER]: [JOB_STATUSES.RUNNING, JOB_STATUSES.CANCELLED],
  [JOB_STATUSES.PAUSED]: [JOB_STATUSES.RUNNING, JOB_STATUSES.CANCELLED],
  [JOB_STATUSES.COMPLETED]: [], // terminal
  [JOB_STATUSES.FAILED]: [], // terminal
  [JOB_STATUSES.CANCELLED]: [], // terminal
});

const TERMINAL_STATES = new Set([
  JOB_STATUSES.COMPLETED,
  JOB_STATUSES.FAILED,
  JOB_STATUSES.CANCELLED,
]);

const STEP_TRANSITIONS = Object.freeze({
  [STEP_STATUSES.PENDING]: [STEP_STATUSES.RUNNING, STEP_STATUSES.SKIPPED],
  [STEP_STATUSES.RUNNING]: [
    STEP_STATUSES.COMPLETED,
    STEP_STATUSES.FAILED,
    STEP_STATUSES.ESCALATED,
  ],
  [STEP_STATUSES.COMPLETED]: [], // terminal
  [STEP_STATUSES.FAILED]: [STEP_STATUSES.RUNNING], // retry allowed
  [STEP_STATUSES.SKIPPED]: [], // terminal
  [STEP_STATUSES.ESCALATED]: [STEP_STATUSES.COMPLETED, STEP_STATUSES.FAILED],
});

// ─── State Machine ───────────────────────────────────────────

class ComputeStateMachine extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Transition a job to a new status.
   * @param {object} job - Job object (mutated in-place)
   * @param {string} newStatus - Target status
   * @param {object} [context] - Additional context (error, reason, etc.)
   * @returns {object} The updated job
   * @throws {Error} If transition is not allowed
   */
  transitionJob(job, newStatus, context = {}) {
    const oldStatus = job.status;

    if (oldStatus === newStatus) return job; // no-op

    const allowed = TRANSITIONS[oldStatus];
    if (!allowed) {
      throw new Error(`Unknown job status: ${oldStatus}`);
    }
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid job transition: ${oldStatus} → ${newStatus}. Allowed: [${allowed.join(", ")}]`,
      );
    }

    // Apply transition
    job.status = newStatus;
    job.updatedAt = new Date().toISOString();

    // Status-specific side effects
    if (newStatus === JOB_STATUSES.RUNNING && !job.metadata.startedAt) {
      job.metadata.startedAt = job.updatedAt;
    }
    if (TERMINAL_STATES.has(newStatus)) {
      job.metadata.completedAt = job.updatedAt;
    }
    if (newStatus === JOB_STATUSES.FAILED && context.error) {
      job.error =
        typeof context.error === "string"
          ? context.error
          : context.error.message;
    }

    // Add log entry
    job.logs.push({
      timestamp: job.updatedAt,
      level: newStatus === JOB_STATUSES.FAILED ? "error" : "info",
      message: `Job transition: ${oldStatus} → ${newStatus}${context.reason ? ` (${context.reason})` : ""}`,
    });

    this.emit("job:transition", {
      jobId: job.id,
      from: oldStatus,
      to: newStatus,
      timestamp: job.updatedAt,
      context,
    });

    return job;
  }

  /**
   * Transition a step to a new status.
   * @param {object} job - Parent job (for logging)
   * @param {object} step - Step object (mutated in-place)
   * @param {string} newStatus - Target status
   * @param {object} [context] - Additional context
   * @returns {object} The updated step
   */
  transitionStep(job, step, newStatus, context = {}) {
    const oldStatus = step.status;

    if (oldStatus === newStatus) return step;

    const allowed = STEP_TRANSITIONS[oldStatus];
    if (!allowed) {
      throw new Error(`Unknown step status: ${oldStatus}`);
    }
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid step transition: ${oldStatus} → ${newStatus}. Allowed: [${allowed.join(", ")}]`,
      );
    }

    step.status = newStatus;

    if (newStatus === STEP_STATUSES.RUNNING) {
      step.startedAt = new Date().toISOString();
    }
    if (
      [
        STEP_STATUSES.COMPLETED,
        STEP_STATUSES.FAILED,
        STEP_STATUSES.SKIPPED,
      ].includes(newStatus)
    ) {
      step.endedAt = new Date().toISOString();
    }
    if (newStatus === STEP_STATUSES.FAILED && context.error) {
      step.error =
        typeof context.error === "string"
          ? context.error
          : context.error.message;
      step.retryCount = (step.retryCount || 0) + (context.isRetry ? 0 : 1);
    }
    if (newStatus === STEP_STATUSES.ESCALATED) {
      step.escalated = true;
    }
    if (context.output !== undefined) {
      step.output = context.output;
    }
    if (context.confidence !== undefined) {
      step.confidence = context.confidence;
    }
    if (context.model) {
      step.model = context.model;
    }
    if (context.tokensUsed) {
      step.tokensUsed = (step.tokensUsed || 0) + context.tokensUsed;
    }

    // Log to parent job
    job.logs.push({
      timestamp: new Date().toISOString(),
      level: newStatus === STEP_STATUSES.FAILED ? "error" : "info",
      message: `Step [${step.id}] ${step.description}: ${oldStatus} → ${newStatus}`,
      stepId: step.id,
    });
    job.updatedAt = new Date().toISOString();

    this.emit("step:transition", {
      jobId: job.id,
      stepId: step.id,
      from: oldStatus,
      to: newStatus,
      timestamp: job.updatedAt,
      context,
    });

    return step;
  }

  /**
   * Check if a job is in a terminal state.
   */
  isTerminal(job) {
    return TERMINAL_STATES.has(job.status);
  }

  /**
   * Check if a transition is valid without performing it.
   */
  canTransitionJob(job, newStatus) {
    const allowed = TRANSITIONS[job.status];
    return allowed ? allowed.includes(newStatus) : false;
  }

  canTransitionStep(step, newStatus) {
    const allowed = STEP_TRANSITIONS[step.status];
    return allowed ? allowed.includes(newStatus) : false;
  }

  /**
   * Get allowed transitions for current job status.
   */
  getAllowedJobTransitions(job) {
    return TRANSITIONS[job.status] || [];
  }

  getAllowedStepTransitions(step) {
    return STEP_TRANSITIONS[step.status] || [];
  }
}

module.exports = {
  ComputeStateMachine,
  TRANSITIONS,
  STEP_TRANSITIONS,
  TERMINAL_STATES,
  stateMachine: new ComputeStateMachine(),
};
