/**
 * CodeIn MAS — Autonomous Planning Loop
 *
 * Implements the plan → execute → test → diagnose → revise → retry loop.
 * This is the core autonomy engine that allows CodeIn to handle complex
 * multi-step tasks without human intervention.
 */
"use strict";

const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");

const MAX_RETRIES = 3;
const MAX_PLAN_REVISIONS = 5;
const STEP_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per step

/**
 * @typedef {Object} PlanStep
 * @property {string} id
 * @property {string} description
 * @property {string} agentType
 * @property {string} status - pending | running | passed | failed | skipped
 * @property {string|null} result
 * @property {string|null} error
 * @property {number} retryCount
 * @property {string[]} dependsOn
 */

/**
 * @typedef {Object} Plan
 * @property {string} id
 * @property {string} goal
 * @property {PlanStep[]} steps
 * @property {string} status - planning | executing | testing | diagnosing | revising | completed | failed
 * @property {number} revision
 * @property {string[]} diagnostics
 * @property {number} startedAt
 */

class AutonomousPlanner extends EventEmitter {
  /**
   * @param {object} opts
   * @param {Function} opts.runLLM - LLM call function
   * @param {Function} opts.executeStep - (step, context) => Promise<{success, result, error}>
   * @param {Function} opts.runTests - (context) => Promise<{passed, failures}>
   */
  constructor(opts = {}) {
    super();
    this._runLLM = opts.runLLM;
    this._executeStep = opts.executeStep;
    this._runTests = opts.runTests;
    this._activePlans = new Map();

    // Autonomous computer subsystem integrations (optional)
    this._skillRegistry = opts.skillRegistry || null;
    this._executionEngine = opts.executionEngine || null;
    this._contextualMemory = opts.contextualMemory || null;
    this._auditTrail = opts.auditTrail || null;
  }

  /**
   * Run the full autonomous loop for a goal.
   * @param {string} goal
   * @param {object} context - Additional context (files, workspace info)
   * @returns {Promise<Plan>}
   */
  async run(goal, context = {}) {
    const plan = {
      id: `plan-${crypto.randomUUID().slice(0, 8)}`,
      goal,
      steps: [],
      status: "planning",
      revision: 0,
      diagnostics: [],
      startedAt: Date.now(),
    };

    this._activePlans.set(plan.id, plan);
    this._emit(plan, "plan_started", { goal });

    try {
      // Phase 1: Generate initial plan
      plan.steps = await this._generatePlan(goal, context);
      this._emit(plan, "plan_generated", { stepCount: plan.steps.length });

      // Loop: execute → test → diagnose → revise
      for (let rev = 0; rev < MAX_PLAN_REVISIONS; rev++) {
        plan.revision = rev;
        plan.status = "executing";

        // Phase 2: Execute all steps
        await this._executePlan(plan, context);

        // Check if all steps passed
        const allPassed = plan.steps.every(
          (s) => s.status === "passed" || s.status === "skipped",
        );

        if (!allPassed) {
          const failedSteps = plan.steps.filter((s) => s.status === "failed");
          plan.status = "diagnosing";
          this._emit(plan, "plan_diagnosing", {
            failedCount: failedSteps.length,
          });

          // Phase 3: Diagnose failures
          const diagnosis = await this._diagnose(plan, failedSteps, context);
          plan.diagnostics.push(diagnosis);

          // Phase 4: Revise plan
          plan.status = "revising";
          this._emit(plan, "plan_revising", { revision: rev + 1 });
          plan.steps = await this._revisePlan(plan, diagnosis, context);

          continue;
        }

        // Phase 5: Run tests (if test runner available)
        if (this._runTests) {
          plan.status = "testing";
          this._emit(plan, "plan_testing", {});

          const testResult = await this._runTests(context);

          if (!testResult.passed) {
            plan.status = "diagnosing";
            const diagnosis = await this._diagnoseTestFailures(
              plan,
              testResult.failures,
              context,
            );
            plan.diagnostics.push(diagnosis);

            if (rev < MAX_PLAN_REVISIONS - 1) {
              plan.status = "revising";
              plan.steps = await this._revisePlan(plan, diagnosis, context);
              continue;
            }
          }
        }

        // All steps passed and tests pass — done
        plan.status = "completed";
        this._emit(plan, "plan_completed", {
          revisions: rev,
          totalSteps: plan.steps.length,
        });
        return plan;
      }

      // Exhausted revisions
      plan.status = "failed";
      this._emit(plan, "plan_failed", {
        reason: "Max revisions exceeded",
        revisions: plan.revision,
      });
      return plan;
    } catch (err) {
      plan.status = "failed";
      this._emit(plan, "plan_failed", { reason: err.message });
      return plan;
    } finally {
      this._activePlans.delete(plan.id);
    }
  }

  /**
   * Generate a plan from a goal using LLM.
   */
  async _generatePlan(goal, context) {
    if (!this._runLLM) {
      return [
        {
          id: `step-${crypto.randomUUID().slice(0, 6)}`,
          description: goal,
          agentType: "coder",
          status: "pending",
          result: null,
          error: null,
          retryCount: 0,
          dependsOn: [],
          skillName: null,
          skillArgs: null,
        },
      ];
    }

    const contextStr = context.files
      ? `\nRelevant files: ${context.files.join(", ")}`
      : "";

    // Build skill catalog section if skill registry is available
    let skillSection = "";
    if (
      this._skillRegistry &&
      typeof this._skillRegistry.listSkills === "function"
    ) {
      try {
        const skills = this._skillRegistry.listSkills();
        if (skills && skills.length > 0) {
          const skillList = skills
            .map(
              (s) =>
                `  - ${s.name}: ${s.description} (category: ${s.category})`,
            )
            .join("\n");
          skillSection = `\n\nAvailable skills (use skillName + skillArgs when a step maps to a skill):\n${skillList}`;
        }
      } catch {
        // Non-fatal — generate plan without skill info
      }
    }

    const stepFormat = skillSection
      ? `[{"description": "...", "agentType": "coder|tester|debugger|refactorer|architect|docs|security|devops", "dependsOn": [], "skillName": "skill-name-or-null", "skillArgs": {"key": "value"}}]`
      : `[{"description": "...", "agentType": "coder|tester|debugger|refactorer|architect|docs|security|devops", "dependsOn": []}]`;

    const prompt = `Break down this goal into concrete steps. Each step should be a specific, actionable task.
Goal: ${goal}${contextStr}${skillSection}

Return a JSON array of steps:
${stepFormat}

Only return the JSON array, no other text.`;

    try {
      const result = await this._runLLM(prompt, { maxTokens: 1000 });
      const text = typeof result === "string" ? result : result.text || "[]";
      const cleaned = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const steps = JSON.parse(cleaned);

      if (!Array.isArray(steps)) {
        throw new Error("Expected array");
      }

      const mapped = steps.map((s, i) => ({
        id: `step-${crypto.randomUUID().slice(0, 6)}`,
        description: String(s.description || `Step ${i + 1}`),
        agentType: String(s.agentType || "coder"),
        status: "pending",
        result: null,
        error: null,
        retryCount: 0,
        dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn : [],
        skillName: s.skillName || null,
        skillArgs:
          s.skillArgs && typeof s.skillArgs === "object" ? s.skillArgs : null,
      }));

      // Post-process: resolve skills for steps that don't have one
      await this._resolveSkills(mapped);

      return mapped;
    } catch {
      // Fallback: single step
      return [
        {
          id: `step-${crypto.randomUUID().slice(0, 6)}`,
          description: goal,
          agentType: "coder",
          status: "pending",
          result: null,
          error: null,
          retryCount: 0,
          dependsOn: [],
          skillName: null,
          skillArgs: null,
        },
      ];
    }
  }

  /**
   * Resolve skills for steps that don't have an explicit skillName.
   * Uses skillRegistry.findSkillsForTask() for best-effort matching.
   * @param {PlanStep[]} steps
   */
  async _resolveSkills(steps) {
    if (
      !this._skillRegistry ||
      typeof this._skillRegistry.findSkillsForTask !== "function"
    ) {
      return;
    }
    for (const step of steps) {
      if (step.skillName) continue;
      try {
        const matches = await this._skillRegistry.findSkillsForTask(
          step.description,
        );
        if (matches && matches.length > 0) {
          step.skillName = matches[0].name;
        }
      } catch {
        // Non-fatal — step will use fallback execution
      }
    }
  }

  /**
   * Execute all pending steps in order, respecting dependencies.
   * If an ExecutionEngine is available, delegate to it for DAG-based
   * parallel execution. Otherwise fall back to the original sequential logic.
   */
  async _executePlan(plan, context) {
    // Delegate to ExecutionEngine if available (supports parallel DAG, pause/resume/cancel)
    if (
      this._executionEngine &&
      typeof this._executionEngine.executePlan === "function"
    ) {
      try {
        await this._executionEngine.executePlan(plan, context);
        // Sync step statuses back: ExecutionEngine uses "completed"/"failed"/"skipped",
        // but AutonomousPlanner expects "passed"/"failed"/"skipped"
        for (const step of plan.steps) {
          if (step.status === "completed") step.status = "passed";
        }
        return;
      } catch {
        // If execution engine fails entirely, fall back to legacy execution
      }
    }

    const completed = new Set();

    // Topological execution
    let progress = true;
    while (progress) {
      progress = false;

      for (const step of plan.steps) {
        if (step.status !== "pending") continue;

        // Check dependencies
        const depsReady = step.dependsOn.every((depId) => completed.has(depId));
        if (!depsReady) continue;

        progress = true;
        step.status = "running";
        this._emit(plan, "step_running", {
          stepId: step.id,
          description: step.description,
        });

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            let result;
            if (this._executeStep) {
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                  () => reject(new Error("Step timeout")),
                  STEP_TIMEOUT_MS,
                );
              });
              result = await Promise.race([
                this._executeStep(step, context),
                timeoutPromise,
              ]);
            } else {
              result = { success: true, result: "No executor configured" };
            }

            if (result.success) {
              step.status = "passed";
              step.result = result.result;
              completed.add(step.id);
              this._emit(plan, "step_passed", { stepId: step.id });
              break;
            } else {
              step.error = result.error || "Unknown failure";
              if (attempt < MAX_RETRIES) {
                step.retryCount++;
                this._emit(plan, "step_retrying", {
                  stepId: step.id,
                  attempt: attempt + 1,
                });
              } else {
                step.status = "failed";
                this._emit(plan, "step_failed", {
                  stepId: step.id,
                  error: step.error,
                });
              }
            }
          } catch (err) {
            step.error = err.message;
            if (attempt < MAX_RETRIES) {
              step.retryCount++;
            } else {
              step.status = "failed";
              this._emit(plan, "step_failed", {
                stepId: step.id,
                error: err.message,
              });
            }
          }
        }
      }
    }

    // Mark any pending steps with unmet deps as skipped
    for (const step of plan.steps) {
      if (step.status === "pending") {
        step.status = "skipped";
        this._emit(plan, "step_skipped", { stepId: step.id });
      }
    }
  }

  /**
   * Diagnose step failures using LLM.
   */
  async _diagnose(plan, failedSteps, context) {
    if (!this._runLLM) {
      return failedSteps.map((s) => `${s.description}: ${s.error}`).join("\n");
    }

    const failures = failedSteps
      .map(
        (s) =>
          `Step: ${s.description}\nAgent: ${s.agentType}\nError: ${s.error}`,
      )
      .join("\n\n");

    const prompt = `Diagnose these failures and suggest fixes:\n\n${failures}\n\nGoal: ${plan.goal}`;

    try {
      const result = await this._runLLM(prompt, { maxTokens: 500 });
      return typeof result === "string"
        ? result
        : result.text || "Unknown issue";
    } catch {
      return failedSteps.map((s) => `${s.description}: ${s.error}`).join("\n");
    }
  }

  /**
   * Diagnose test failures.
   */
  async _diagnoseTestFailures(plan, failures, context) {
    if (!this._runLLM) {
      return `Test failures: ${JSON.stringify(failures)}`;
    }

    const prompt = `Tests failed after completing plan "${plan.goal}".\n\nFailures:\n${JSON.stringify(failures, null, 2)}\n\nSuggest fixes.`;

    try {
      const result = await this._runLLM(prompt, { maxTokens: 500 });
      return typeof result === "string"
        ? result
        : result.text || "Unknown test failure";
    } catch {
      return `Test failures: ${JSON.stringify(failures)}`;
    }
  }

  /**
   * Revise plan based on diagnosis.
   */
  async _revisePlan(plan, diagnosis, context) {
    if (!this._runLLM) {
      // Reset failed steps to pending for retry
      return plan.steps.map((s) =>
        s.status === "failed"
          ? { ...s, status: "pending", retryCount: 0, error: null }
          : s,
      );
    }

    const currentSteps = plan.steps.map((s) => ({
      description: s.description,
      agentType: s.agentType,
      status: s.status,
      error: s.error,
    }));

    const prompt = `Revise this plan based on the diagnosis.
Original goal: ${plan.goal}
Current steps: ${JSON.stringify(currentSteps)}
Diagnosis: ${diagnosis}

Return a revised JSON array of steps (same format). Include fixed/new steps as needed.`;

    try {
      const result = await this._runLLM(prompt, { maxTokens: 1000 });
      const text = typeof result === "string" ? result : result.text || "[]";
      const cleaned = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const steps = JSON.parse(cleaned);

      if (!Array.isArray(steps)) throw new Error("Expected array");

      return steps.map((s, i) => ({
        id: `step-${crypto.randomUUID().slice(0, 6)}`,
        description: String(s.description || `Step ${i + 1}`),
        agentType: String(s.agentType || "coder"),
        status: "pending",
        result: null,
        error: null,
        retryCount: 0,
        dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn : [],
      }));
    } catch {
      // Fallback: reset failed steps
      return plan.steps.map((s) =>
        s.status === "failed"
          ? { ...s, status: "pending", retryCount: 0, error: null }
          : s,
      );
    }
  }

  /**
   * Get active plan by ID.
   */
  getPlan(id) {
    return this._activePlans.get(id) || null;
  }

  /**
   * List active plans.
   */
  listPlans() {
    return Array.from(this._activePlans.values());
  }

  _emit(plan, type, data) {
    this.emit("event", {
      planId: plan.id,
      type,
      data,
      timestamp: Date.now(),
    });
  }
}

module.exports = { AutonomousPlanner };
