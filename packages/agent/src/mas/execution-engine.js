/**
 * CodeIn MAS — DAG-based Execution Engine
 *
 * Executes autonomous plans as directed acyclic graphs (DAGs) with:
 * - Parallel step scheduling (respecting dependency edges)
 * - Configurable concurrency limit
 * - Per-step retry with rollback support
 * - Pause / resume / cancel lifecycle
 * - Permission gate integration
 * - Checkpoint + audit trail recording
 * - Memory context propagation between steps
 */
"use strict";

const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");

// ─── Constants ────────────────────────────────────────────────

const EXECUTION_STATUS = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  ROLLING_BACK: "rolling_back",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

const STEP_STATUS = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  ROLLING_BACK: "rolling_back",
  ROLLED_BACK: "rolled_back",
});

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_RETRIES = 2;
const STEP_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

// ─── Execution Engine ─────────────────────────────────────────

class ExecutionEngine extends EventEmitter {
  /**
   * @param {object} opts
   * @param {object}   opts.skillRegistry   - { findSkillsForTask, executeSkill }
   * @param {object}   opts.permissionGate  - PermissionGate instance
   * @param {object}   opts.memory          - MemoryManager instance
   * @param {object}   [opts.auditTrail]    - { record(entry) }
   * @param {Function} [opts.runLLM]        - LLM call fallback
   * @param {number}   [opts.concurrency]   - Max parallel steps (default 3)
   */
  constructor({
    skillRegistry,
    permissionGate,
    memory,
    auditTrail = null,
    runLLM = null,
    concurrency = DEFAULT_CONCURRENCY,
  } = {}) {
    super();
    this._skillRegistry = skillRegistry;
    this._permissionGate = permissionGate;
    this._memory = memory;
    this._auditTrail = auditTrail;
    this._runLLM = runLLM;
    this._concurrency = Math.max(1, concurrency);

    /** @type {Map<string, ExecutionState>} */
    this._executions = new Map();
  }

  // ════════════════════════════════════════════════════════════
  // Public API
  // ════════════════════════════════════════════════════════════

  /**
   * Execute a full plan DAG.
   *
   * @param {object} plan - { id, goal, steps: [...] }
   * @param {object} [context={}] - Shared context passed to each step
   * @returns {Promise<object>} The completed/failed plan
   */
  async executePlan(plan, context = {}) {
    // 1. Validate plan structure
    this._validatePlan(plan);

    // Assign an id if missing
    if (!plan.id) {
      plan.id = `plan-${crypto.randomUUID().slice(0, 8)}`;
    }

    // Initialize execution state
    const state = {
      planId: plan.id,
      plan,
      context: { ...context },
      status: EXECUTION_STATUS.RUNNING,
      paused: false,
      cancelled: false,
      stepResults: new Map(), // stepId -> result
      startedAt: Date.now(),
    };
    this._executions.set(plan.id, state);

    this._emitEvent(plan.id, "plan_started", {
      goal: plan.goal,
      stepCount: plan.steps.length,
    });

    try {
      // 2. Resolve skills for steps that don't have one
      await this._resolveSkills(plan);

      // 3. Normalize step statuses
      for (const step of plan.steps) {
        if (
          !step.status ||
          step.status === "completed" ||
          step.status === "failed"
        ) {
          // leave as-is only if pending; otherwise reset
        }
        if (!step.status) step.status = STEP_STATUS.PENDING;
        if (!step.dependsOn) step.dependsOn = [];
        if (!step.id) step.id = `step-${crypto.randomUUID().slice(0, 6)}`;
      }

      // 4. Execute the DAG
      await this._runDAG(state);

      // 5. Determine final status
      const allCompleted = plan.steps.every(
        (s) =>
          s.status === STEP_STATUS.COMPLETED ||
          s.status === STEP_STATUS.SKIPPED,
      );
      const anyFailed = plan.steps.some((s) => s.status === STEP_STATUS.FAILED);

      if (state.cancelled) {
        state.status = EXECUTION_STATUS.CANCELLED;
      } else if (allCompleted) {
        state.status = EXECUTION_STATUS.COMPLETED;
      } else if (anyFailed) {
        state.status = EXECUTION_STATUS.FAILED;
      } else {
        state.status = EXECUTION_STATUS.COMPLETED;
      }

      this._emitEvent(plan.id, "plan_finished", {
        status: state.status,
        stepsCompleted: plan.steps.filter(
          (s) => s.status === STEP_STATUS.COMPLETED,
        ).length,
        stepsFailed: plan.steps.filter((s) => s.status === STEP_STATUS.FAILED)
          .length,
      });

      return plan;
    } catch (err) {
      state.status = EXECUTION_STATUS.FAILED;
      this._emitEvent(plan.id, "plan_error", { error: err.message });
      throw err;
    } finally {
      // Keep execution state for querying, but mark finished time
      state.finishedAt = Date.now();
    }
  }

  /**
   * Pause a running execution. Stops scheduling new steps.
   * @param {string} planId
   * @returns {{ success: boolean, error?: string }}
   */
  pauseExecution(planId) {
    const state = this._executions.get(planId);
    if (!state) return { success: false, error: "Execution not found" };
    if (state.status !== EXECUTION_STATUS.RUNNING) {
      return {
        success: false,
        error: `Cannot pause: status is ${state.status}`,
      };
    }
    state.paused = true;
    state.status = EXECUTION_STATUS.PAUSED;
    this._emitEvent(planId, "plan_paused", {});
    return { success: true };
  }

  /**
   * Resume a paused execution.
   * @param {string} planId
   * @returns {{ success: boolean, error?: string }}
   */
  resumeExecution(planId) {
    const state = this._executions.get(planId);
    if (!state) return { success: false, error: "Execution not found" };
    if (state.status !== EXECUTION_STATUS.PAUSED) {
      return {
        success: false,
        error: `Cannot resume: status is ${state.status}`,
      };
    }
    state.paused = false;
    state.status = EXECUTION_STATUS.RUNNING;
    this._emitEvent(planId, "plan_resumed", {});

    // Kick off the DAG loop again (it will pick up where it left off)
    if (state._resumeResolve) {
      state._resumeResolve();
      state._resumeResolve = null;
    }
    return { success: true };
  }

  /**
   * Cancel a running or paused execution.
   * Rolls back in-progress steps that have rollbackSkill defined.
   * @param {string} planId
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async cancelExecution(planId) {
    const state = this._executions.get(planId);
    if (!state) return { success: false, error: "Execution not found" };
    if (
      state.status !== EXECUTION_STATUS.RUNNING &&
      state.status !== EXECUTION_STATUS.PAUSED
    ) {
      return {
        success: false,
        error: `Cannot cancel: status is ${state.status}`,
      };
    }

    state.cancelled = true;
    state.status = EXECUTION_STATUS.CANCELLED;

    // If paused, unblock the wait loop
    if (state._resumeResolve) {
      state._resumeResolve();
      state._resumeResolve = null;
    }

    // Roll back running/completed steps that have rollback defined
    const rollbackSteps = state.plan.steps.filter(
      (s) =>
        s.rollbackSkill &&
        (s.status === STEP_STATUS.RUNNING ||
          s.status === STEP_STATUS.COMPLETED),
    );

    for (const step of rollbackSteps) {
      await this._rollbackStep(step, state);
    }

    // Mark pending steps as skipped
    for (const step of state.plan.steps) {
      if (
        step.status === STEP_STATUS.PENDING ||
        step.status === STEP_STATUS.RUNNING
      ) {
        step.status = STEP_STATUS.SKIPPED;
      }
    }

    this._emitEvent(planId, "plan_cancelled", {
      rolledBack: rollbackSteps.length,
    });
    return { success: true };
  }

  /**
   * Get current execution status and step statuses.
   * @param {string} planId
   * @returns {object|null}
   */
  getExecutionStatus(planId) {
    const state = this._executions.get(planId);
    if (!state) return null;
    return {
      planId: state.planId,
      status: state.status,
      goal: state.plan.goal,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt || null,
      steps: state.plan.steps.map((s) => ({
        id: s.id,
        description: s.description,
        status: s.status,
        result: s.result || null,
        error: s.error || null,
      })),
    };
  }

  /**
   * List all active (running or paused) executions.
   * @returns {Array<object>}
   */
  listActiveExecutions() {
    const active = [];
    for (const [planId, state] of this._executions) {
      if (
        state.status === EXECUTION_STATUS.RUNNING ||
        state.status === EXECUTION_STATUS.PAUSED
      ) {
        active.push({
          planId,
          status: state.status,
          goal: state.plan.goal,
          startedAt: state.startedAt,
          stepsTotal: state.plan.steps.length,
          stepsCompleted: state.plan.steps.filter(
            (s) => s.status === STEP_STATUS.COMPLETED,
          ).length,
        });
      }
    }
    return active;
  }

  // ════════════════════════════════════════════════════════════
  // Internal: DAG Scheduler
  // ════════════════════════════════════════════════════════════

  /**
   * Run the DAG to completion (or until paused/cancelled).
   */
  async _runDAG(state) {
    const { plan } = state;
    const completed = new Set();
    const failed = new Set();
    const running = new Set();

    // Seed with already-completed steps (e.g., after resume)
    for (const step of plan.steps) {
      if (step.status === STEP_STATUS.COMPLETED) completed.add(step.id);
      if (step.status === STEP_STATUS.FAILED) failed.add(step.id);
    }

    const maxIterations = plan.steps.length * (DEFAULT_MAX_RETRIES + 2) + 10; // safety
    let iterations = 0;

    while (iterations++ < maxIterations) {
      if (state.cancelled) break;

      // If paused, wait for resume
      if (state.paused) {
        await new Promise((resolve) => {
          state._resumeResolve = resolve;
        });
        if (state.cancelled) break;
        continue;
      }

      // Find steps that are ready to run
      const readySteps = plan.steps.filter((step) => {
        if (step.status !== STEP_STATUS.PENDING) return false;
        if (running.has(step.id)) return false;

        // Check all dependencies are completed
        const depsReady = step.dependsOn.every((depId) => completed.has(depId));
        // Check no dependency has failed (skip the step if so)
        const depFailed = step.dependsOn.some((depId) => failed.has(depId));

        if (depFailed) {
          step.status = STEP_STATUS.SKIPPED;
          step.error = "Skipped: upstream dependency failed";
          this._emitEvent(state.planId, "step_skipped", {
            stepId: step.id,
            reason: "dependency_failed",
          });
          return false;
        }

        return depsReady;
      });

      // Check termination: nothing ready and nothing running
      if (readySteps.length === 0 && running.size === 0) {
        break;
      }

      if (readySteps.length === 0 && running.size > 0) {
        // Wait for at least one running step to finish — but they run in parallel batches below
        // So this shouldn't happen within a single iteration. Safety break.
        break;
      }

      // Schedule batch (up to concurrency limit)
      const batch = readySteps.slice(0, this._concurrency - running.size);
      if (batch.length === 0 && running.size > 0) {
        break; // waiting on running steps, but we execute synchronously per batch
      }

      // Mark batch as running
      for (const step of batch) {
        step.status = STEP_STATUS.RUNNING;
        running.add(step.id);
      }

      // Execute batch in parallel
      const results = await Promise.allSettled(
        batch.map((step) => this._executeStep(step, state)),
      );

      // Process results
      for (let i = 0; i < batch.length; i++) {
        const step = batch[i];
        running.delete(step.id);

        if (step.status === STEP_STATUS.COMPLETED) {
          completed.add(step.id);
        } else if (step.status === STEP_STATUS.FAILED) {
          failed.add(step.id);
        }
        // SKIPPED steps from permission denial are also terminal
        if (step.status === STEP_STATUS.SKIPPED) {
          // Treat as non-blocking — downstream steps will be skipped too
          failed.add(step.id);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // Internal: Step Execution
  // ════════════════════════════════════════════════════════════

  async _executeStep(step, state) {
    this._emitEvent(state.planId, "step_started", {
      stepId: step.id,
      description: step.description,
    });

    // 1. Check permission gate (if step declares permissions)
    if (
      step.requiredPermissions &&
      step.requiredPermissions.length > 0 &&
      this._permissionGate
    ) {
      for (const perm of step.requiredPermissions) {
        const decision = await this._permissionGate.requestPermission({
          nodeId: step.id,
          agentId: step.agentType || "execution-engine",
          permissionType: perm,
          action: step.description || step.id,
        });
        if (decision.decision === "denied") {
          step.status = STEP_STATUS.SKIPPED;
          step.error = `Permission denied: ${perm} — ${decision.reason}`;
          this._emitEvent(state.planId, "step_skipped", {
            stepId: step.id,
            reason: "permission_denied",
          });
          this._audit("step_permission_denied", step, state);
          return;
        }
      }
    }

    // 2. Execute with retries
    const maxRetries =
      typeof step.maxRetries === "number"
        ? step.maxRetries
        : DEFAULT_MAX_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (state.cancelled) {
        step.status = STEP_STATUS.SKIPPED;
        return;
      }

      try {
        let result;

        if (step.skillName && this._skillRegistry) {
          // Execute via skill registry
          result = await this._withTimeout(
            this._skillRegistry.executeSkill(
              step.skillName,
              step.skillArgs || {},
              state.context,
            ),
            STEP_TIMEOUT_MS,
          );
        } else if (step.agentType && this._runLLM) {
          // Fall back to LLM with agent context
          const prompt = this._buildStepPrompt(step, state);
          const llmResult = await this._withTimeout(
            this._runLLM(prompt, { maxTokens: 2000 }),
            STEP_TIMEOUT_MS,
          );
          result =
            typeof llmResult === "string"
              ? llmResult
              : llmResult.text || llmResult;
        } else if (
          this._skillRegistry &&
          this._skillRegistry.findSkillsForTask
        ) {
          // Try to find a matching skill by description
          const skills = this._skillRegistry.findSkillsForTask(
            step.description || step.id,
          );
          if (skills && skills.length > 0) {
            result = await this._withTimeout(
              this._skillRegistry.executeSkill(
                skills[0].name,
                step.skillArgs || {},
                state.context,
              ),
              STEP_TIMEOUT_MS,
            );
          } else {
            result = {
              success: true,
              message: "No executor available — step passed through",
            };
          }
        } else {
          result = {
            success: true,
            message: "No executor available — step passed through",
          };
        }

        // Success
        step.status = STEP_STATUS.COMPLETED;
        step.result = result;
        state.stepResults.set(step.id, result);

        // Record in memory
        if (this._memory) {
          this._memory.shortTerm.set(`exec:${state.planId}:${step.id}`, {
            status: "completed",
            result:
              typeof result === "string"
                ? result.slice(0, 500)
                : JSON.stringify(result).slice(0, 500),
          });
        }

        // Checkpoint
        this._checkpoint(state);
        this._audit("step_completed", step, state);
        this._emitEvent(state.planId, "step_completed", {
          stepId: step.id,
          attempt: attempt + 1,
        });
        return;
      } catch (err) {
        step.error = err.message || String(err);

        if (attempt < maxRetries) {
          this._emitEvent(state.planId, "step_retrying", {
            stepId: step.id,
            attempt: attempt + 1,
            error: step.error,
          });
          continue;
        }

        // All retries exhausted — attempt rollback if defined
        if (step.rollbackSkill) {
          await this._rollbackStep(step, state);
        }

        step.status = STEP_STATUS.FAILED;
        this._audit("step_failed", step, state);
        this._emitEvent(state.planId, "step_failed", {
          stepId: step.id,
          error: step.error,
        });
        return;
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // Internal: Rollback
  // ════════════════════════════════════════════════════════════

  async _rollbackStep(step, state) {
    if (!step.rollbackSkill || !this._skillRegistry) return;

    this._emitEvent(state.planId, "step_rolling_back", { stepId: step.id });
    step.status = STEP_STATUS.ROLLING_BACK;

    try {
      await this._withTimeout(
        this._skillRegistry.executeSkill(
          step.rollbackSkill,
          step.rollbackArgs || {},
          state.context,
        ),
        STEP_TIMEOUT_MS,
      );
      step.status = STEP_STATUS.ROLLED_BACK;
      this._emitEvent(state.planId, "step_rolled_back", { stepId: step.id });
    } catch (err) {
      // Rollback failure is non-fatal to the engine — log and move on
      this._emitEvent(state.planId, "step_rollback_failed", {
        stepId: step.id,
        error: err.message,
      });
    }
  }

  // ════════════════════════════════════════════════════════════
  // Internal: Helpers
  // ════════════════════════════════════════════════════════════

  _validatePlan(plan) {
    if (!plan || typeof plan !== "object") {
      throw new Error("Plan must be a non-null object");
    }
    if (!Array.isArray(plan.steps)) {
      throw new Error("Plan must have a steps array");
    }

    // Check for dependency cycles
    const stepIds = new Set(plan.steps.map((s) => s.id).filter(Boolean));
    const visited = new Set();
    const visiting = new Set();
    const adjMap = new Map();

    for (const step of plan.steps) {
      const id = step.id || step.description;
      adjMap.set(
        id,
        (step.dependsOn || []).filter((d) => stepIds.has(d)),
      );
    }

    const hasCycle = (id) => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const dep of adjMap.get(id) || []) {
        if (hasCycle(dep)) return true;
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };

    for (const id of adjMap.keys()) {
      if (hasCycle(id)) {
        throw new Error("Plan contains a dependency cycle");
      }
    }
  }

  async _resolveSkills(plan) {
    if (!this._skillRegistry || !this._skillRegistry.findSkillsForTask) return;

    for (const step of plan.steps) {
      if (!step.skillName && !step.agentType && step.description) {
        try {
          const skills = this._skillRegistry.findSkillsForTask(
            step.description,
          );
          if (skills && skills.length > 0) {
            step.skillName = skills[0].name;
          }
        } catch {
          // Non-fatal — step will use fallback execution
        }
      }
    }
  }

  _buildStepPrompt(step, state) {
    const previousResults = [];
    for (const depId of step.dependsOn || []) {
      const res = state.stepResults.get(depId);
      if (res) {
        const preview =
          typeof res === "string"
            ? res.slice(0, 500)
            : JSON.stringify(res).slice(0, 500);
        previousResults.push(`[${depId}]: ${preview}`);
      }
    }

    return [
      `Task: ${step.description || step.id}`,
      step.agentType ? `Role: ${step.agentType}` : "",
      state.plan.goal ? `Overall goal: ${state.plan.goal}` : "",
      previousResults.length > 0
        ? `Previous results:\n${previousResults.join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Step execution timeout")),
        ms,
      );
      if (timer.unref) timer.unref();
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  _checkpoint(state) {
    if (!this._memory) return;
    try {
      const snapshot = {
        planId: state.planId,
        status: state.status,
        completedSteps: state.plan.steps
          .filter((s) => s.status === STEP_STATUS.COMPLETED)
          .map((s) => s.id),
        timestamp: Date.now(),
      };
      this._memory.working.set(`checkpoint:${state.planId}`, snapshot);
    } catch {
      // Non-fatal
    }
  }

  _audit(action, step, state) {
    if (!this._auditTrail) return;
    try {
      this._auditTrail.record({
        action,
        planId: state.planId,
        stepId: step.id,
        stepDescription: step.description,
        status: step.status,
        error: step.error || null,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Non-fatal
    }
  }

  _emitEvent(planId, type, data) {
    this.emit("event", {
      planId,
      type,
      data,
      timestamp: Date.now(),
    });
  }
}

module.exports = { ExecutionEngine, EXECUTION_STATUS };
