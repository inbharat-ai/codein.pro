/**
 * CodeIn MAS — Execution Engine Tests
 *
 * Jest-compatible tests for the DAG-based plan execution engine.
 */
"use strict";

const { ExecutionEngine, EXECUTION_STATUS } = require("../src/mas/execution-engine");

// ─── Mock Factories ───────────────────────────────────────────

function createMockSkillRegistry(overrides = {}) {
  return {
    findSkillsForTask: jest.fn(() => []),
    executeSkill: jest.fn(async () => ({ success: true, data: "skill-result" })),
    ...overrides,
  };
}

function createMockPermissionGate(overrides = {}) {
  return {
    requestPermission: jest.fn(async () => ({
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
      set: jest.fn((k, v) => store.set(k, v)),
      get: jest.fn((k) => store.get(k)),
    },
    working: {
      set: jest.fn((k, v) => store.set(k, v)),
      get: jest.fn((k) => store.get(k)),
    },
    blackboard: {
      post: jest.fn(),
      getShared: jest.fn(),
    },
  };
}

function createMockAuditTrail() {
  const entries = [];
  return {
    record: jest.fn((entry) => entries.push(entry)),
    entries,
  };
}

function createMockRunLLM(response = "LLM result") {
  return jest.fn(async () => response);
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

    expect(result.steps[0].status).toBe("completed");
    expect(result.steps[1].status).toBe("completed");
    expect(result.steps[2].status).toBe("completed");
    expect(skillRegistry.executeSkill).toHaveBeenCalledTimes(3);
  });

  // ────────────────────────────────────────────────────────────
  // 2. Parallel plan (2 independent + 1 final)
  // ────────────────────────────────────────────────────────────
  test("executes parallel steps then a dependent step", async () => {
    const executionOrder = [];
    skillRegistry.executeSkill = jest.fn(async (name) => {
      executionOrder.push(name);
      return { success: true };
    });

    const plan = makePlan([
      { id: "a", description: "Parallel A", skillName: "taskA" },
      { id: "b", description: "Parallel B", skillName: "taskB" },
      { id: "c", description: "Final", skillName: "taskC", dependsOn: ["a", "b"] },
    ]);

    const result = await engine.executePlan(plan);

    expect(result.steps.every((s) => s.status === "completed")).toBe(true);
    // taskC must come after both taskA and taskB
    const idxC = executionOrder.indexOf("taskC");
    const idxA = executionOrder.indexOf("taskA");
    const idxB = executionOrder.indexOf("taskB");
    expect(idxC).toBeGreaterThan(idxA);
    expect(idxC).toBeGreaterThan(idxB);
  });

  // ────────────────────────────────────────────────────────────
  // 3. Step failure triggers retry
  // ────────────────────────────────────────────────────────────
  test("retries a failed step", async () => {
    let callCount = 0;
    skillRegistry.executeSkill = jest.fn(async () => {
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

    expect(result.steps[0].status).toBe("completed");
    expect(callCount).toBe(2);
    expect(events.some((e) => e.type === "step_retrying")).toBe(true);
  });

  // ────────────────────────────────────────────────────────────
  // 4. Step failure after retries marks plan failed
  // ────────────────────────────────────────────────────────────
  test("marks plan failed when step exhausts all retries", async () => {
    skillRegistry.executeSkill = jest.fn(async () => {
      throw new Error("Permanent failure");
    });

    const plan = makePlan([
      { id: "s1", description: "Broken step", skillName: "broken" },
    ]);

    const result = await engine.executePlan(plan);
    const status = engine.getExecutionStatus(plan.id);

    expect(result.steps[0].status).toBe("failed");
    expect(status.status).toBe(EXECUTION_STATUS.FAILED);
  });

  // ────────────────────────────────────────────────────────────
  // 5. Pause and resume
  // ────────────────────────────────────────────────────────────
  test("pauses and resumes execution", async () => {
    let stepCount = 0;
    skillRegistry.executeSkill = jest.fn(async () => {
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
    expect(result.steps.every((s) => s.status === "completed")).toBe(true);

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
    expect(pauseResult.success).toBe(true);

    const statusAfterPause = engine.getExecutionStatus("plan-pause-test");
    expect(statusAfterPause.status).toBe(EXECUTION_STATUS.PAUSED);

    const resumeResult = engine.resumeExecution("plan-pause-test");
    expect(resumeResult.success).toBe(true);

    const statusAfterResume = engine.getExecutionStatus("plan-pause-test");
    expect(statusAfterResume.status).toBe(EXECUTION_STATUS.RUNNING);
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

    expect(cancelResult.success).toBe(true);
    expect(skillRegistry.executeSkill).toHaveBeenCalledWith(
      "undeploy",
      { env: "staging" },
      expect.any(Object),
    );
  });

  // ────────────────────────────────────────────────────────────
  // 7. getExecutionStatus returns correct state
  // ────────────────────────────────────────────────────────────
  test("getExecutionStatus returns correct state after execution", async () => {
    skillRegistry.executeSkill = jest.fn(async () => ({ done: true }));

    const plan = makePlan([
      { id: "s1", description: "Only step", skillName: "do-thing" },
    ]);

    await engine.executePlan(plan);
    const status = engine.getExecutionStatus(plan.id);

    expect(status).not.toBeNull();
    expect(status.planId).toBe(plan.id);
    expect(status.status).toBe(EXECUTION_STATUS.COMPLETED);
    expect(status.steps).toHaveLength(1);
    expect(status.steps[0].status).toBe("completed");
    expect(status.finishedAt).toBeTruthy();
  });

  // ────────────────────────────────────────────────────────────
  // 8. Permission denial skips step
  // ────────────────────────────────────────────────────────────
  test("skips step when permission is denied", async () => {
    permissionGate.requestPermission = jest.fn(async () => ({
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

    expect(result.steps[0].status).toBe("skipped");
    expect(result.steps[0].error).toContain("Permission denied");
    expect(skillRegistry.executeSkill).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────
  // 9. Dependency resolution — step only runs when deps complete
  // ────────────────────────────────────────────────────────────
  test("step only runs after all dependencies complete", async () => {
    const callOrder = [];
    skillRegistry.executeSkill = jest.fn(async (name) => {
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

    expect(idxC).toBeGreaterThan(idxA); // c depends on a
    expect(idxD).toBeGreaterThan(idxB); // d depends on b
    expect(idxD).toBeGreaterThan(idxC); // d depends on c
  });

  // ────────────────────────────────────────────────────────────
  // 10. Empty plan completes immediately
  // ────────────────────────────────────────────────────────────
  test("empty plan completes immediately", async () => {
    const plan = makePlan([]);
    const result = await engine.executePlan(plan);
    const status = engine.getExecutionStatus(plan.id);

    expect(status.status).toBe(EXECUTION_STATUS.COMPLETED);
    expect(result.steps).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────
  // 11. Rollback on step failure
  // ────────────────────────────────────────────────────────────
  test("rollback is invoked on step failure after retries", async () => {
    skillRegistry.executeSkill = jest.fn(async (name) => {
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

    expect(plan.steps[0].status).toBe("failed");
    // executeSkill called for deploy (1 initial + 2 retries = 3) + 1 rollback
    expect(skillRegistry.executeSkill).toHaveBeenCalledWith(
      "undeploy",
      expect.any(Object),
      expect.any(Object),
    );
    expect(events.some((e) => e.type === "step_rolling_back")).toBe(true);
  });

  // ────────────────────────────────────────────────────────────
  // 12. agentType falls back to runLLM
  // ────────────────────────────────────────────────────────────
  test("uses runLLM when step has agentType but no skillName", async () => {
    runLLM.mockResolvedValue("LLM generated code");

    const plan = makePlan([
      { id: "s1", description: "Write code", agentType: "coder" },
    ]);

    const result = await engine.executePlan(plan);

    expect(result.steps[0].status).toBe("completed");
    expect(result.steps[0].result).toBe("LLM generated code");
    expect(runLLM).toHaveBeenCalled();
    expect(skillRegistry.executeSkill).not.toHaveBeenCalled();
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

    expect(active).toHaveLength(2);
    expect(active.map((a) => a.planId).sort()).toEqual(["plan-1", "plan-2"]);
  });

  // ────────────────────────────────────────────────────────────
  // 14. Events are emitted throughout execution
  // ────────────────────────────────────────────────────────────
  test("emits plan_started, step_started, step_completed, plan_finished events", async () => {
    skillRegistry.executeSkill = jest.fn(async () => ({ ok: true }));
    const events = [];
    engine.on("event", (e) => events.push(e.type));

    const plan = makePlan([
      { id: "s1", description: "Step", skillName: "do" },
    ]);

    await engine.executePlan(plan);

    expect(events).toContain("plan_started");
    expect(events).toContain("step_started");
    expect(events).toContain("step_completed");
    expect(events).toContain("plan_finished");
  });

  // ────────────────────────────────────────────────────────────
  // 15. Invalid plan throws
  // ────────────────────────────────────────────────────────────
  test("throws on invalid plan (no steps array)", async () => {
    await expect(engine.executePlan({ id: "bad", goal: "x" })).rejects.toThrow(
      "Plan must have a steps array",
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

    await expect(engine.executePlan(plan)).rejects.toThrow("dependency cycle");
  });

  // ────────────────────────────────────────────────────────────
  // 17. getExecutionStatus returns null for unknown plan
  // ────────────────────────────────────────────────────────────
  test("getExecutionStatus returns null for unknown planId", () => {
    expect(engine.getExecutionStatus("nonexistent")).toBeNull();
  });

  // ────────────────────────────────────────────────────────────
  // 18. Audit trail is recorded
  // ────────────────────────────────────────────────────────────
  test("records entries in audit trail on step completion and failure", async () => {
    skillRegistry.executeSkill = jest.fn(async (name) => {
      if (name === "fail-skill") throw new Error("fail");
      return { ok: true };
    });

    const plan = makePlan([
      { id: "s1", description: "Failing", skillName: "fail-skill" },
      { id: "s2", description: "Passing", skillName: "pass-skill" },
    ]);

    await engine.executePlan(plan);

    expect(auditTrail.record).toHaveBeenCalled();
    const actions = auditTrail.entries.map((e) => e.action);
    expect(actions).toContain("step_failed");
    expect(actions).toContain("step_completed");
  });

  // ────────────────────────────────────────────────────────────
  // 19. Skips downstream steps when dependency fails
  // ────────────────────────────────────────────────────────────
  test("skips downstream steps when a dependency fails", async () => {
    skillRegistry.executeSkill = jest.fn(async (name) => {
      if (name === "broken") throw new Error("broken");
      return { ok: true };
    });

    const plan = makePlan([
      { id: "s1", description: "Broken", skillName: "broken" },
      { id: "s2", description: "Downstream", skillName: "ok", dependsOn: ["s1"] },
    ]);

    const result = await engine.executePlan(plan);

    expect(result.steps[0].status).toBe("failed");
    expect(result.steps[1].status).toBe("skipped");
  });

  // ────────────────────────────────────────────────────────────
  // 20. Checkpoint stored in memory after each step
  // ────────────────────────────────────────────────────────────
  test("stores checkpoint in working memory after each step", async () => {
    skillRegistry.executeSkill = jest.fn(async () => ({ ok: true }));

    const plan = makePlan([
      { id: "s1", description: "Step 1", skillName: "a" },
      { id: "s2", description: "Step 2", skillName: "b", dependsOn: ["s1"] },
    ]);

    await engine.executePlan(plan);

    expect(memory.working.set).toHaveBeenCalledWith(
      `checkpoint:${plan.id}`,
      expect.objectContaining({ planId: plan.id }),
    );
  });
});
