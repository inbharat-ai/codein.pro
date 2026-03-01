/**
 * CodeIn Compute — Module Index
 *
 * Public API for the compute module.
 * Import everything from here.
 */
"use strict";

const {
  JOB_STATUSES,
  STEP_STATUSES,
  createJob,
  createStep,
  createDefaultPolicy,
  validateJob,
  validateStep,
  validatePolicy,
} = require("./job-model");
const {
  ComputeStateMachine,
  TRANSITIONS,
  STEP_TRANSITIONS,
  TERMINAL_STATES,
  stateMachine,
} = require("./state-machine");
const { JobStore } = require("./job-store");
const {
  ComputeEventStream,
  EVENT_TYPES,
  eventStream,
} = require("./event-stream");
const {
  ArtifactManager,
  ARTIFACT_TYPES,
  artifactManager,
} = require("./artifact-manager");
const { PolicyEnforcer, policyEnforcer } = require("./policy");
const { ComputeSandbox } = require("./sandbox");
const { EscalationManager } = require("./escalation");
const {
  ComputePlanner,
  PLANNER_SYSTEM_PROMPT,
  TOOL_CATALOG,
} = require("./planner");
const { ComputeExecutor, EXECUTOR_SYSTEM_PROMPT } = require("./executor");
const { ComputeMultilingualAdapter } = require("./multilingual");
const { ComputeOrchestrator } = require("./orchestrator");

module.exports = {
  // Models
  JOB_STATUSES,
  STEP_STATUSES,
  createJob,
  createStep,
  createDefaultPolicy,
  validateJob,
  validateStep,
  validatePolicy,

  // State Machine
  ComputeStateMachine,
  TRANSITIONS,
  STEP_TRANSITIONS,
  TERMINAL_STATES,
  stateMachine,

  // Storage
  JobStore,

  // Events
  ComputeEventStream,
  EVENT_TYPES,
  eventStream,

  // Artifacts
  ArtifactManager,
  ARTIFACT_TYPES,
  artifactManager,

  // Security
  PolicyEnforcer,
  policyEnforcer,
  ComputeSandbox,

  // Escalation
  EscalationManager,

  // Planning
  ComputePlanner,
  PLANNER_SYSTEM_PROMPT,
  TOOL_CATALOG,

  // Execution
  ComputeExecutor,
  EXECUTOR_SYSTEM_PROMPT,

  // Multilingual
  ComputeMultilingualAdapter,

  // Orchestrator (main API)
  ComputeOrchestrator,
};
