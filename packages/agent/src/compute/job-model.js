/**
 * CodeIn Compute — Job Model
 *
 * Data models for compute jobs and steps with validation.
 * Persisted as JSON files in ~/.codin/compute/jobs/
 */
"use strict";

const crypto = require("node:crypto");

// ─── Status Enums ────────────────────────────────────────────
const JOB_STATUSES = Object.freeze({
  QUEUED: "queued",
  PLANNING: "planning",
  RUNNING: "running",
  WAITING_USER: "waiting_user",
  PAUSED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

const STEP_STATUSES = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  ESCALATED: "escalated",
});

// ─── Factories ───────────────────────────────────────────────

/**
 * Create a new Job object.
 * @param {object} params
 * @param {string} params.goal - User's outcome description
 * @param {string} [params.userId] - Owner user ID
 * @param {string} [params.language] - Detected/specified language code
 * @param {object} [params.policy] - Permission policy overrides
 * @returns {object} Job
 */
function createJob({ goal, userId = "local", language = "en", policy = null }) {
  if (!goal || typeof goal !== "string" || goal.trim().length === 0) {
    throw new Error("Job goal is required and must be a non-empty string");
  }
  if (goal.length > 10000) {
    throw new Error("Job goal exceeds maximum length of 10000 characters");
  }

  const now = new Date().toISOString();
  return {
    id: `job_${crypto.randomBytes(12).toString("hex")}`,
    userId,
    status: JOB_STATUSES.QUEUED,
    createdAt: now,
    updatedAt: now,
    goal: goal.trim(),
    goalOriginal: goal.trim(), // preserve pre-translation text
    language,
    plan: null, // set after planning phase
    steps: [], // Step[]
    artifacts: [], // { id, type, name, path, createdAt }
    logs: [], // { timestamp, level, message, stepId? }
    error: null, // set on failure
    policy: policy || createDefaultPolicy(),
    metadata: {
      totalCostEstimate: 0,
      tokensUsed: 0,
      modelsUsed: [],
      startedAt: null,
      completedAt: null,
      escalationCount: 0,
    },
  };
}

/**
 * Create a new Step object.
 * @param {object} params
 * @param {string} params.description - What this step does
 * @param {string} [params.agentName] - Agent to use
 * @param {string[]} [params.tools] - Tool names this step may call
 * @param {object} [params.input] - Step input data
 * @returns {object} Step
 */
function createStep({
  description,
  agentName = "default",
  tools = [],
  input = {},
}) {
  if (!description || typeof description !== "string") {
    throw new Error("Step description is required");
  }

  const now = new Date().toISOString();
  return {
    id: `step_${crypto.randomBytes(8).toString("hex")}`,
    status: STEP_STATUSES.PENDING,
    description,
    agentName,
    tools,
    toolCalls: [], // { toolName, input, output, durationMs }
    input,
    output: null,
    confidence: null, // 0-1 score after execution
    costEstimate: 0,
    tokensUsed: 0,
    model: null, // which model was used
    escalated: false, // was this escalated to external API
    startedAt: null,
    endedAt: null,
    error: null,
    retryCount: 0,
    maxRetries: 2,
    createdAt: now,
  };
}

/**
 * Create the default permission policy for a job.
 * Fail-closed: everything OFF by default.
 */
function createDefaultPolicy() {
  return {
    allowNetwork: false,
    allowBrowser: false,
    allowFSWrite: true, // within sandbox only
    allowRepoWrite: false, // user's actual repo
    allowedDomains: [],
    allowedTools: ["*"], // all registered tools
    blockedTools: [],
    maxSteps: 20,
    maxDurationMs: 600000, // 10 minutes
    maxCostUSD: 1.0, // external API budget cap
    allowEscalation: false, // external API usage
  };
}

// ─── Validation ──────────────────────────────────────────────

function validateJob(job) {
  const errors = [];
  if (!job.id || !job.id.startsWith("job_")) errors.push("Invalid job ID");
  if (!job.goal) errors.push("Missing goal");
  if (!Object.values(JOB_STATUSES).includes(job.status))
    errors.push(`Invalid status: ${job.status}`);
  if (!job.createdAt) errors.push("Missing createdAt");
  if (!job.policy) errors.push("Missing policy");
  return { valid: errors.length === 0, errors };
}

function validateStep(step) {
  const errors = [];
  if (!step.id || !step.id.startsWith("step_")) errors.push("Invalid step ID");
  if (!step.description) errors.push("Missing description");
  if (!Object.values(STEP_STATUSES).includes(step.status))
    errors.push(`Invalid status: ${step.status}`);
  return { valid: errors.length === 0, errors };
}

function validatePolicy(policy) {
  const errors = [];
  if (typeof policy.allowNetwork !== "boolean")
    errors.push("allowNetwork must be boolean");
  if (typeof policy.allowBrowser !== "boolean")
    errors.push("allowBrowser must be boolean");
  if (typeof policy.allowFSWrite !== "boolean")
    errors.push("allowFSWrite must be boolean");
  if (typeof policy.allowRepoWrite !== "boolean")
    errors.push("allowRepoWrite must be boolean");
  if (!Array.isArray(policy.allowedDomains))
    errors.push("allowedDomains must be array");
  if (!Array.isArray(policy.allowedTools))
    errors.push("allowedTools must be array");
  if (typeof policy.maxSteps !== "number" || policy.maxSteps < 1)
    errors.push("maxSteps must be >= 1");
  if (typeof policy.maxDurationMs !== "number" || policy.maxDurationMs < 1000)
    errors.push("maxDurationMs must be >= 1000");
  if (typeof policy.maxCostUSD !== "number" || policy.maxCostUSD < 0)
    errors.push("maxCostUSD must be >= 0");
  return { valid: errors.length === 0, errors };
}

module.exports = {
  JOB_STATUSES,
  STEP_STATUSES,
  createJob,
  createStep,
  createDefaultPolicy,
  validateJob,
  validateStep,
  validatePolicy,
};
