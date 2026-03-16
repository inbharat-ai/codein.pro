/**
 * CodeIn MAS — Execution Engine Tests
 *
 * node:test-compatible tests for the DAG-based plan execution engine.
 */
"use strict";
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { ExecutionEngine, EXECUTION_STATUS } = require("../src/mas/execution-engine");

// ─── Mock helper ────────────────────────────────────────────

function createMock(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl ? impl(...args) : fn._returnValue; };
  fn.calls = [];
  fn._returnValue = undefined;
  fn.mockReturnValue = (v) => { fn._returnValue = v; return fn; };
  fn.mockReset = () => { fn.calls = []; fn._returnValue = undefined; };
  return fn;
}

// ─── Mock Factories ───────────────────────────────────────────

function createMockSkillRegistry(overrides = {}) {
  return {
    findSkillsForTask: createMock(() => []),
    executeSkill: createMock(async () => ({ success: true, data: "skill-result" })),
    ...overrides,
  };
}

function createMockPermissionGate(overrides = {}) {
  return {
    requestPermission: createMock(async () => ({
      decision: "approved",
      reason: "Auto-approved",
    })),
    ...overrides,
  };
}

function createMockMemory() {
  const store = new Map();
  return {
    shortTerm: {
      set: createMock((k, v) => store.set(k, v)),
      get: createMock((k) => store.get(k)),
    },
    working: {
      set: createMock((k, v) => store.set(k, v)),
      get: createMock((k) => store.get(k)),
    },
    blackboard: {
      post: createMock(),
      getShared: createMock(),
    },
  };
}

function createMockAuditTrail() {
  const entries = [];
  return {
    record: createMock((entry) => entries.push(entry)),
    entries,
  };
}

function createMockRunLLM(response = "LLM result") {
  return createMock(async () => response);
}

function makePlan(steps, overrides = {}) {
  return {
    id: overrides.id || `plan-${Date.now()}`,
    goal: overrides.goal || "Test goal",
    steps: steps.map((s, i) => ({
      id: s.id || `step-${i}`,
      description: s.description || `Step ${i}`,
      skillName: s.skillName || null,
      skillArgs: s.skillArgs || {},
      agentType: s.agentType || null,
      dependsOn: s.dependsOn || [],
      status: s.status || "pending",
      rollbackSkill: s.rollbackSkill || null,
      rollbackArgs: s.rollbackArgs || null,
      requiredPermissions: s.requiredPermissions || [],
      result: null,
      error: null,
      ...s,
    })),
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe("ExecutionEngine", () => {
  let engine;
  let skillRegistry;
  let permissionGate;
  let memory;
  let auditTrail;
  let runLLM;

  beforeEach(() => {
    skillRegistry = createMockSkillRegistry();
    permissionGate = createMockPermissionGate();
    memory = createMockMemory();
    auditTrail = createMockAuditTrail();
    runLLM = createMockRunLLM();

    engine = new ExecutionEngine({
      skillRegistry,
      permissionGate,
      memory,
      auditTrail,
      runLLM,
    });
  });

  // ────────────────────────────────────────────────────────────
  // 1. Simple 3-step linear plan
  // ────────────────────────────────────────────────────────────
  test("executes a simple 3-step linear plan", async () => {
    const plan = makePlan([
      { id: "s1", description: "Step 1", skillName: "read-file" },
      { id: "s2", description: "Step 2", skillName: "transform", dependsOn: ["s1"] },
      { id: "s3", description: "Step 3", skillName: "write-file", dependsOn: ["s2"] },
    ]);

    const result = await engine.executePlan(plan);

    assert.equal(result.steps[0].status, "completed");
    assert.equal(result.steps[1].status, "completed");
    assert.equal(result.steps[2].status, "completed");
    assert.equal(skillRegistry.executeSkill.calls.length, 3);
  });

  // ────────────────────────────────────────────────────────────
  // 2. Parallel plan (2 independent + 1 final)
  // ────────────────────────────────────────────────────────────
  test("executes parallel steps then a dependent step", async () => {
    const executionOrder = [];
    skillRegistry.executeSkill = createMock(async (name) => {
      executionOrder.push(name);
      return { success: true };
    });

    const plan = makePlan([
      { id: "a", description: "Parallel A", skillName: "taskA" },
      { id: "b", description: "Parallel B", skillName: "taskB" },
      { id: "c", description: "Final", skillName: "taskC", dependsOn: ["a", "b"] },
    ]);

    const result = await engine.executePlan(plan);

    assert.ok(result.steps.every((s) => s.status === "completed"));
    // taskC must come after both taskA and taskB
    const idxC = executionOrder.indexOf("taskC");
    const idxA = executionOrder.indexOf("taskA");
    const idxB = executionOrder.indexOf("taskB");
    assert.ok(idxC > idxA);
    assert.ok(idxC > idxB);
  });

  // ────────────────────────────────────────────────────────────
  // 3. Step failure triggers retry
  // ────────────────────────────────────────────────────────────
  test("retries a failed step", async () => {
    let callCount = 0;
    skillRegistry.executeSkill = createMock(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Transient failure");
      return { success: true };
    });

    const plan = makePlan([
      { id: "s1", description: "Flaky step", skillName: "flaky" },
    ]);

    const events = [];
    engine.on("event", (e) => events.push(e));

    const result = await engine.executePlan(plan);

    assert.equal(result.steps[0].status, "completed");
    assert.equal(callCount, 2);
    assert.ok(events.some((e) => e.type === "step_retrying"));
  });

  // ────────────────────────────────────────────────────────────
  // 4. Step failure after retries marks plan failed
  // ────────────────────────────────────────────────────────────
  test("marks plan failed when step exhausts all retries", async () => {
    skillRegistry.executeSkill = createMock(async () => {
      throw new Error("Permanent failure");
    });

    const plan = makePlan([
      { id: "s1", description: "Broken step", skillName: "broken" },
    ]);

    const result = await engine.executePlan(plan);
    const status = engine.getExecutionStatus(plan.id);

    assert.equal(result.steps[0].status, "failed");
    assert.equal(status.status, EXECUTION_STATUS.FAILED);
  });

  // ────────────────────────────────────────────────────────────
  // 5. Pause and resume
  // ────────────────────────────────────────────────────────────
  test("pauses and resumes execution", async () => {
    let stepCount = 0;
    skillRegistry.executeSkill = createMock(async () => {
      stepCount++;
      return { success: true };
    });

    const plan = makePlan([
      { id: "s1", description: "First", skillName: "first" },
      { id: "s2", description: "Second", skillName: "second", dependsOn: ["s1"] },
    ]);

    // Start execution in background
    const execPromise = engine.executePlan(plan);

    // Give it a moment to start, then pause should work on the next plan
    const result = await execPromise;

    // Verify execution completed successfully
    assert.ok(result.steps.every((s) => s.status === "completed"));

    // Also verify that pause/resume API works correctly on status
    const plan2 = makePlan(
      [{ id: "x1", description: "Slow step", skillName: "slow" }],
      { id: "plan-pause-test" },
    );

    // Simulate pause state
    engine._executions.set("plan-pause-test", {
      planId: "plan-pause-test",
      plan: plan2,
      context: {},
      status: EXECUTION_STATUS.RUNNING,
      paused: false,
      cancelled: false,
      stepResults: new Map(),
      startedAt: Date.now(),
    });

    const pauseResult = engine.pauseExecution("plan-pause-test");
    assert.ok(pauseResult.success);

    const statusAfterPause = engine.getExecutionStatus("plan-pause-test");
    assert.equal(statusAfterPause.status, EXECUTION_STATUS.PAUSED);

    const resumeResult = engine.resumeExecution("plan-pause-test");
    assert.ok(resumeResult.success);

    const statusAfterResume = engine.getExecutionStatus("plan-pause-test");
    assert.equal(statusAfterResume.status, EXECUTION_STATUS.RUNNING);
  });

  // ────────────────────────────────────────────────────────────
  // 6. Cancel with rollback
  // ────────────────────────────────────────────────────────────
  test("cancels and rolls back steps with rollbackSkill", async () => {
    const plan = makePlan([
      {
        id: "s1",
        description: "Rollbackable step",
        skillName: "deploy",
        rollbackSkill: "undeploy",
        rollbackArgs: { env: "staging" },
      },
    ]);

    // Simulate a running execution that we then cancel
    const state = {
      planId: plan.id,
      plan,
      context: {},
      status: EXECUTION_STATUS.RUNNING,
      paused: false,
      cancelled: false,
      stepResults: new Map(),
      startedAt: Date.now(),
    };
    // Mark step as completed (as if it ran)
    plan.steps[0].status = "completed";
    engine._executions.set(plan.id, state);

    const cancelResult = await engine.cancelExecution(plan.id);

    assert.ok(cancelResult.success);
    const rollbackCall = skillRegistry.executeSkill.calls.find(c => c[0] === "undeploy");
    assert.ok(rollbackCall, "Should have called undeploy rollback skill");
    assert.deepStrictEqual(rollbackCall[1], { env: "staging" });
  });

  // ────────────────────────────────────────────────────────────
  // 7. getExecutionStatus returns correct state
  // ────────────────────────────────────────────────────────────
  test("getExecutionStatus returns correct state after execution", async () => {
    skillRegistry.executeSkill = createMock(async () => ({ done: true }));

    const plan = makePlan([
      { id: "s1", description: "Only step", skillName: "do-thing" },
    ]);

    await engine.executePlan(plan);
    const status = engine.getExecutionStatus(plan.id);

    assert.ok(status !== null);
    assert.equal(status.planId, plan.id);
    assert.equal(status.status, EXECUTION_STATUS.COMPLETED);
    assert.equal(status.steps.length, 1);
    assert.equal(status.steps[0].status, "completed");
    assert.ok(status.finishedAt);
  });

  // ────────────────────────────────────────────────────────────
  // 8. Permission denial skips step
  // ────────────────────────────────────────────────────────────
  test("skips step when permission is denied", async () => {
    permissionGate.requestPermission = createMock(async () => ({
      decision: "denied",
      reason: "User denied",
    }));

    const plan = makePlan([
      {
        id: "s1",
        description: "Write to disk",
        skillName: "write",
        requiredPermissions: ["file_write"],
      },
    ]);

    const result = await engine.executePlan(plan);

    assert.equal(result.steps[0].status, "skipped");
    assert.ok(result.steps[0].error.includes("Permission denied"));
    assert.equal(skillRegistry.executeSkill.calls.length, 0);
  });

  // ────────────────────────────────────────────────────────────
  // 9. Dependency resolution — step only runs when deps complete
  // ────────────────────────────────────────────────────────────
  test("step only runs after all dependencies complete", async () => {
    const callOrder = [];
    skillRegistry.executeSkill = createMock(async (name) => {
      callOrder.push(name);
      return { ok: true };
    });

    const plan = makePlan([
      { id: "a", description: "A", skillName: "a" },
      { id: "b", description: "B", skillName: "b" },
      { id: "c", description: "C", skillName: "c", dependsOn: ["a"] },
      { id: "d", description: "D", skillName: "d", dependsOn: ["b", "c"] },
    ]);

    await engine.executePlan(plan);

    const idxA = callOrder.indexOf("a");
    const idxB = callOrder.indexOf("b");
    const idxC = callOrder.indexOf("c");
    const idxD = callOrder.indexOf("d");

    assert.ok(idxC > idxA); // c depends on a
    assert.ok(idxD > idxB); // d depends on b
    assert.ok(idxD > idxC); // d depends on c
  });

  // ────────────────────────────────────────────────────────────
  // 10. Empty plan completes immediately
  // ────────────────────────────────────────────────────────────
  test("empty plan completes immediately", async () => {
    const plan = makePlan([]);
    const result = await engine.executePlan(plan);
    const status = engine.getExecutionStatus(plan.id);

    assert.equal(status.status, EXECUTION_STATUS.COMPLETED);
    assert.equal(result.steps.length, 0);
  });

  // ────────────────────────────────────────────────────────────
  // 11. Rollback on step failure
  // ────────────────────────────────────────────────────────────
  test("rollback is invoked on step failure after retries", async () => {
    skillRegistry.executeSkill = createMock(async (name) => {
      if (name === "deploy") throw new Error("Deploy failed");
      return { rolledBack: true };
    });

    const plan = makePlan([
      {
        id: "s1",
        description: "Deploy",
        skillName: "deploy",
        rollbackSkill: "undeploy",
      },
    ]);

    const events = [];
    engine.on("event", (e) => events.push(e));

    await engine.executePlan(plan);

    assert.equal(plan.steps[0].status, "failed");
    // executeSkill called for deploy (1 initial + 2 retries = 3) + 1 rollback
    const rollbackCall = skillRegistry.executeSkill.calls.find(c => c[0] === "undeploy");
    assert.ok(rollbackCall, "Should have called undeploy rollback");
    assert.ok(events.some((e) => e.type === "step_rolling_back"));
  });

  // ────────────────────────────────────────────────────────────
  // 12. agentType falls back to runLLM
  // ────────────────────────────────────────────────────────────
  test("uses runLLM when step has agentType but no skillName", async () => {
    runLLM = createMock(async () => "LLM generated code");
    engine = new ExecutionEngine({
      skillRegistry,
      permissionGate,
      memory,
      auditTrail,
      runLLM,
    });

    const plan = makePlan([
      { id: "s1", description: "Write code", agentType: "coder" },
    ]);

    const result = await engine.executePlan(plan);

    assert.equal(result.steps[0].status, "completed");
    assert.equal(result.steps[0].result, "LLM generated code");
    assert.ok(runLLM.calls.length > 0);
    assert.equal(skillRegistry.executeSkill.calls.length, 0);
  });

  // ────────────────────────────────────────────────────────────
  // 13. listActiveExecutions
  // ────────────────────────────────────────────────────────────
  test("listActiveExecutions returns running/paused plans", async () => {
    // Manually inject two execution states
    engine._executions.set("plan-1", {
      planId: "plan-1",
      plan: { goal: "Goal 1", steps: [{ status: "completed" }] },
      status: EXECUTION_STATUS.RUNNING,
      startedAt: Date.now(),
    });
    engine._executions.set("plan-2", {
      planId: "plan-2",
      plan: { goal: "Goal 2", steps: [] },
      status: EXECUTION_STATUS.PAUSED,
      startedAt: Date.now(),
    });
    engine._executions.set("plan-3", {
      planId: "plan-3",
      plan: { goal: "Goal 3", steps: [] },
      status: EXECUTION_STATUS.COMPLETED,
      startedAt: Date.now(),
    });

    const active = engine.listActiveExecutions();

    assert.equal(active.length, 2);
    assert.deepStrictEqual(active.map((a) => a.planId).sort(), ["plan-1", "plan-2"]);
  });

  // ────────────────────────────────────────────────────────────
  // 14. Events are emitted throughout execution
  // ────────────────────────────────────────────────────────────
  test("emits plan_started, step_started, step_completed, plan_finished events", async () => {
    skillRegistry.executeSkill = createMock(async () => ({ ok: true }));
    const events = [];
    engine.on("event", (e) => events.push(e.type));

    const plan = makePlan([
      { id: "s1", description: "Step", skillName: "do" },
    ]);

    await engine.executePlan(plan);

    assert.ok(events.includes("plan_started"));
    assert.ok(events.includes("step_started"));
    assert.ok(events.includes("step_completed"));
    assert.ok(events.includes("plan_finished"));
  });

  // ────────────────────────────────────────────────────────────
  // 15. Invalid plan throws
  // ────────────────────────────────────────────────────────────
  test("throws on invalid plan (no steps array)", async () => {
    await assert.rejects(
      () => engine.executePlan({ id: "bad", goal: "x" }),
      /Plan must have a steps array/
    );
  });

  // ────────────────────────────────────────────────────────────
  // 16. Dependency cycle detection
  // ────────────────────────────────────────────────────────────
  test("throws on plan with dependency cycle", async () => {
    const plan = makePlan([
      { id: "a", description: "A", dependsOn: ["b"] },
      { id: "b", description: "B", dependsOn: ["a"] },
    ]);

    await assert.rejects(
      () => engine.executePlan(plan),
      /dependency cycle/
    );
  });

  // ────────────────────────────────────────────────────────────
  // 17. getExecutionStatus returns null for unknown plan
  // ────────────────────────────────────────────────────────────
  test("getExecutionStatus returns null for unknown planId", () => {
    assert.equal(engine.getExecutionStatus("nonexistent"), null);
  });

  // ────────────────────────────────────────────────────────────
  // 18. Audit trail is recorded
  // ────────────────────────────────────────────────────────────
  test("records entries in audit trail on step completion and failure", async () => {
    skillRegistry.executeSkill = createMock(async (name) => {
      if (name === "fail-skill") throw new Error("fail");
      return { ok: true };
    });

    const plan = makePlan([
      { id: "s1", description: "Failing", skillName: "fail-skill" },
      { id: "s2", description: "Passing", skillName: "pass-skill" },
    ]);

    await engine.executePlan(plan);

    assert.ok(auditTrail.record.calls.length > 0);
    const actions = auditTrail.entries.map((e) => e.action);
    assert.ok(actions.includes("step_failed"));
    assert.ok(actions.includes("step_completed"));
  });

  // ────────────────────────────────────────────────────────────
  // 19. Skips downstream steps when dependency fails
  // ────────────────────────────────────────────────────────────
  test("skips downstream steps when a dependency fails", async () => {
    skillRegistry.executeSkill = createMock(async (name) => {
      if (name === "broken") throw new Error("broken");
      return { ok: true };
    });

    const plan = makePlan([
      { id: "s1", description: "Broken", skillName: "broken" },
      { id: "s2", description: "Downstream", skillName: "ok", dependsOn: ["s1"] },
    ]);

    const result = await engine.executePlan(plan);

    assert.equal(result.steps[0].status, "failed");
    assert.equal(result.steps[1].status, "skipped");
  });

  // ────────────────────────────────────────────────────────────
  // 20. Checkpoint stored in memory after each step
  // ────────────────────────────────────────────────────────────
  test("stores checkpoint in working memory after each step", async () => {
    skillRegistry.executeSkill = createMock(async () => ({ ok: true }));

    const plan = makePlan([
      { id: "s1", description: "Step 1", skillName: "a" },
      { id: "s2", description: "Step 2", skillName: "b", dependsOn: ["s1"] },
    ]);

    await engine.executePlan(plan);

    const checkpointCall = memory.working.set.calls.find(c => c[0] === `checkpoint:${plan.id}`);
    assert.ok(checkpointCall, "Should have stored checkpoint");
    assert.equal(checkpointCall[1].planId, plan.id);
  });
});
