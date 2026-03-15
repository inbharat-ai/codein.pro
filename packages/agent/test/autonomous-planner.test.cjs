/**
 * Tests for AutonomousPlanner — plan -> execute -> test -> diagnose -> revise -> retry
 */
"use strict";

const assert = require("node:assert");

let AutonomousPlanner;
try {
  ({ AutonomousPlanner } = require("../src/mas/autonomous-planner"));
} catch (err) {
  console.log("autonomous-planner.js not found — skipping:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

// Jest handles cleanup automatically

describe("AutonomousPlanner", () => {
  it("creates a plan and runs it to completion", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async (step) => ({ success: true, result: "done" }),
    });

    const events = [];
    planner.on("event", (e) => events.push(e));

    const plan = await planner.run("simple task");
    assert.strictEqual(plan.status, "completed");
    assert.ok(plan.steps.length >= 1);
    assert.ok(events.some((e) => e.type === "plan_started"));
    assert.ok(events.some((e) => e.type === "plan_completed"));
  });

  it("uses LLM to generate plan steps", async () => {
    const mockLLM = async () =>
      JSON.stringify([
        { description: "Step 1", agentType: "coder" },
        { description: "Step 2", agentType: "tester", dependsOn: [] },
      ]);

    const planner = new AutonomousPlanner({
      runLLM: mockLLM,
      executeStep: async () => ({ success: true, result: "ok" }),
    });

    const plan = await planner.run("multi-step task");
    assert.strictEqual(plan.status, "completed");
    assert.strictEqual(plan.steps.length, 2);
  });

  it("retries failed steps up to MAX_RETRIES then marks them failed", async () => {
    let attempts = 0;
    const planner = new AutonomousPlanner({
      executeStep: async () => {
        attempts++;
        if (attempts <= 2) return { success: false, error: "temporary failure" };
        return { success: true, result: "ok" };
      },
    });

    const plan = await planner.run("retry task");
    assert.strictEqual(plan.status, "completed");
    // Must have retried at least twice before succeeding on 3rd
    assert.strictEqual(attempts >= 3, true, `Expected >=3 attempts, got ${attempts}`);
  });

  it("diagnoses and revises on failure — strict completion after revision", async () => {
    let revision = 0;
    const mockLLM = async (prompt) => {
      if (prompt.includes("Break down")) {
        return JSON.stringify([{ description: "Failing step", agentType: "coder" }]);
      }
      if (prompt.includes("Diagnose")) {
        return "Need to fix the approach";
      }
      if (prompt.includes("Revise")) {
        revision++;
        return JSON.stringify([{ description: "Fixed step", agentType: "debugger" }]);
      }
      return "ok";
    };

    const planner = new AutonomousPlanner({
      runLLM: mockLLM,
      executeStep: async (step) => {
        if (step.description === "Failing step") {
          return { success: false, error: "original approach failed" };
        }
        return { success: true, result: "fixed" };
      },
    });

    const plan = await planner.run("diagnose task");
    // After revision the "Fixed step" should succeed, so plan MUST complete
    assert.strictEqual(plan.status, "completed");
    assert.ok(revision >= 1, `Expected at least 1 revision, got ${revision}`);
  });

  it("runs tests after execution if test runner provided", async () => {
    let testRan = false;
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true, result: "ok" }),
      runTests: async () => {
        testRan = true;
        return { passed: true, failures: [] };
      },
    });

    const plan = await planner.run("test task");
    assert.strictEqual(plan.status, "completed");
    assert.strictEqual(testRan, true);
  });

  it("fails after max revisions", async () => {
    let attempts = 0;
    const planner = new AutonomousPlanner({
      executeStep: async () => {
        attempts++;
        return { success: false, error: "always fails" };
      },
    });

    const plan = await planner.run("impossible task");
    assert.strictEqual(plan.status, "failed");
    assert.ok(attempts > 0, "Should have attempted at least once");
  });

  it("handles errors gracefully", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => {
        throw new Error("catastrophic failure");
      },
    });

    const plan = await planner.run("error task");
    assert.strictEqual(plan.status, "failed");
  });

  it("generates plan IDs with correct prefix", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true }),
    });
    const plan = await planner.run("id task");
    assert.ok(plan.id.startsWith("plan-"), `Expected plan- prefix, got ${plan.id}`);
    assert.strictEqual(typeof plan.id, "string");
    assert.ok(plan.id.length > 5, "Plan ID should be longer than prefix");
  });

  it("emits step events in correct order", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true, result: "done" }),
    });

    const events = [];
    planner.on("event", (e) => events.push(e.type));

    await planner.run("event task");
    assert.ok(events.includes("step_running"), "Should emit step_running");
    assert.ok(events.includes("step_passed"), "Should emit step_passed");
    // step_running must come before step_passed
    const runIdx = events.indexOf("step_running");
    const passIdx = events.indexOf("step_passed");
    assert.ok(runIdx < passIdx, "step_running should precede step_passed");
  });

  it("handles LLM returning non-JSON gracefully", async () => {
    const planner = new AutonomousPlanner({
      runLLM: async () => "not valid json at all",
      executeStep: async () => ({ success: true }),
    });

    const plan = await planner.run("bad LLM task");
    assert.strictEqual(plan.steps.length, 1);
    assert.strictEqual(plan.status, "completed");
    // Fallback step should have the goal as description
    assert.strictEqual(plan.steps[0].description, "bad LLM task");
  });

  it("skips steps with unmet dependencies", async () => {
    const mockLLM = async () =>
      JSON.stringify([
        { description: "Step A", agentType: "coder", dependsOn: [] },
        { description: "Step B", agentType: "tester", dependsOn: ["nonexistent-dep"] },
      ]);

    const planner = new AutonomousPlanner({
      runLLM: mockLLM,
      executeStep: async () => ({ success: true }),
    });

    const plan = await planner.run("dep task");
    const stepB = plan.steps.find((s) => s.description === "Step B");
    assert.strictEqual(stepB.status, "skipped");
  });

  it("tracks plan start time accurately", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true }),
    });
    const before = Date.now();
    const plan = await planner.run("timing task");
    const after = Date.now();
    assert.ok(plan.startedAt >= before, `startedAt ${plan.startedAt} should be >= ${before}`);
    assert.ok(plan.startedAt <= after, `startedAt ${plan.startedAt} should be <= ${after}`);
  });

  // ─── New tests: plan structure and lifecycle ─────────────────

  it("plan has all required fields", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true, result: "ok" }),
    });
    const plan = await planner.run("fields task");
    assert.strictEqual(typeof plan.id, "string");
    assert.strictEqual(plan.goal, "fields task");
    assert.ok(Array.isArray(plan.steps));
    assert.strictEqual(typeof plan.status, "string");
    assert.strictEqual(typeof plan.revision, "number");
    assert.ok(Array.isArray(plan.diagnostics));
    assert.strictEqual(typeof plan.startedAt, "number");
  });

  it("each step has all required fields after completion", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true, result: "step done" }),
    });
    const plan = await planner.run("step fields");
    for (const step of plan.steps) {
      assert.strictEqual(typeof step.id, "string");
      assert.ok(step.id.startsWith("step-"), `Step ID should start with step-, got ${step.id}`);
      assert.strictEqual(typeof step.description, "string");
      assert.strictEqual(typeof step.agentType, "string");
      assert.ok(["pending", "running", "passed", "failed", "skipped"].includes(step.status));
      assert.ok(Array.isArray(step.dependsOn));
      assert.strictEqual(typeof step.retryCount, "number");
    }
  });

  it("diagnose without LLM returns plain-text error summary", async () => {
    let diagnoseCalled = false;
    const planner = new AutonomousPlanner({
      executeStep: async () => {
        return { success: false, error: "no LLM diagnosis" };
      },
    });

    planner.on("event", (e) => {
      if (e.type === "plan_diagnosing") diagnoseCalled = true;
    });

    const plan = await planner.run("diag no llm");
    assert.strictEqual(plan.status, "failed");
    // diagnostics should contain plain-text error
    assert.ok(plan.diagnostics.length >= 1, "Should have at least 1 diagnostic entry");
    assert.ok(
      plan.diagnostics[0].includes("no LLM diagnosis"),
      `Diagnostic should contain the error text, got: ${plan.diagnostics[0]}`
    );
  });

  it("activePlans map is empty after run completes", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true }),
    });
    await planner.run("map cleanup");
    // Access internal state to verify cleanup
    const plans = planner.listPlans();
    assert.strictEqual(plans.length, 0, "Active plans should be empty after completion");
  });

  it("getPlan returns null for unknown plan ID", () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true }),
    });
    const result = planner.getPlan("nonexistent-id");
    assert.strictEqual(result, null);
  });

  it("listPlans returns empty array when no plans are active", () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true }),
    });
    const plans = planner.listPlans();
    assert.ok(Array.isArray(plans));
    assert.strictEqual(plans.length, 0);
  });

  it("handles test failures and triggers re-diagnosis", async () => {
    let testCallCount = 0;
    const mockLLM = async (prompt) => {
      if (prompt.includes("Break down")) {
        return JSON.stringify([{ description: "code step", agentType: "coder" }]);
      }
      if (prompt.includes("Tests failed")) {
        return "Tests failed because of missing edge case";
      }
      if (prompt.includes("Revise")) {
        return JSON.stringify([{ description: "fixed code step", agentType: "coder" }]);
      }
      return "ok";
    };

    const planner = new AutonomousPlanner({
      runLLM: mockLLM,
      executeStep: async () => ({ success: true, result: "code written" }),
      runTests: async () => {
        testCallCount++;
        if (testCallCount <= 1) {
          return { passed: false, failures: ["edge case missed"] };
        }
        return { passed: true, failures: [] };
      },
    });

    const plan = await planner.run("test re-diagnosis task");
    assert.strictEqual(plan.status, "completed");
    assert.ok(testCallCount >= 2, `Tests should run at least 2 times, ran ${testCallCount}`);
  });

  it("revision counter increments correctly", async () => {
    let revisionsSeen = [];
    const planner = new AutonomousPlanner({
      executeStep: async (step) => {
        // Every step always fails — forces revision loop until MAX_PLAN_REVISIONS
        return { success: false, error: "always fail" };
      },
    });

    planner.on("event", (e) => {
      if (e.type === "plan_revising") {
        revisionsSeen.push(e.data.revision);
      }
    });

    const plan = await planner.run("fail always to track revisions");
    // With no LLM, the fallback single step always fails → exhausts revisions → "failed"
    assert.strictEqual(plan.status, "failed");
    // Revisions should be sequential
    for (let i = 1; i < revisionsSeen.length; i++) {
      assert.ok(
        revisionsSeen[i] > revisionsSeen[i - 1],
        "Revisions should be strictly increasing"
      );
    }
  });

  it("context is passed to executeStep", async () => {
    let receivedContext = null;
    const planner = new AutonomousPlanner({
      executeStep: async (step, ctx) => {
        receivedContext = ctx;
        return { success: true };
      },
    });

    await planner.run("context task", { files: ["a.js", "b.js"], workspace: "/tmp" });
    // Context should have been passed (at least to the _generatePlan call)
    // The executeStep receives (step, context) from _executePlan
    // But AutonomousPlanner passes context through
    assert.ok(receivedContext !== null, "Context should be passed to executeStep");
  });

  it("LLM returning markdown-wrapped JSON is handled", async () => {
    const mockLLM = async () =>
      "```json\n" +
      JSON.stringify([
        { description: "Parse markdown", agentType: "coder" },
      ]) +
      "\n```";

    const planner = new AutonomousPlanner({
      runLLM: mockLLM,
      executeStep: async () => ({ success: true, result: "parsed" }),
    });

    const plan = await planner.run("markdown json task");
    assert.strictEqual(plan.status, "completed");
    assert.strictEqual(plan.steps.length, 1);
    assert.strictEqual(plan.steps[0].description, "Parse markdown");
  });

  it("empty goal still produces a valid plan", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true }),
    });
    const plan = await planner.run("");
    assert.strictEqual(plan.status, "completed");
    assert.ok(plan.steps.length >= 1);
  });
});
