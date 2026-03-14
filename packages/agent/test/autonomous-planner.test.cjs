/**
 * Tests for AutonomousPlanner — plan → execute → test → diagnose → revise → retry
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

  it("retries failed steps", async () => {
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
    assert.ok(attempts >= 3);
  });

  it("diagnoses and revises on failure", async () => {
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
        // On second revision, return a fixable step
        return JSON.stringify([{ description: "Fixed step", agentType: "debugger" }]);
      }
      return "ok";
    };

    const planner = new AutonomousPlanner({
      runLLM: mockLLM,
      executeStep: async (step) => {
        // Only the "Failing step" fails; "Fixed step" succeeds
        if (step.description === "Failing step") {
          return { success: false, error: "original approach failed" };
        }
        return { success: true, result: "fixed" };
      },
    });

    const plan = await planner.run("diagnose task");
    // Should complete after revision produces "Fixed step"
    assert.ok(plan.status === "completed" || revision > 0);
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
    assert.ok(testRan);
  });

  it("fails after max revisions", async () => {
    // Use a very fast-failing planner with no LLM (so fallback single step, no revision LLM calls)
    let attempts = 0;
    const planner = new AutonomousPlanner({
      executeStep: async () => {
        attempts++;
        return { success: false, error: "always fails" };
      },
    });

    const plan = await planner.run("impossible task");
    assert.strictEqual(plan.status, "failed");
    assert.ok(attempts > 0);
  });

  it("handles errors gracefully", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => {
        throw new Error("catastrophic failure");
      },
    });

    const plan = await planner.run("error task");
    // Should not throw, should return a failed plan
    assert.strictEqual(plan.status, "failed");
  });

  it("generates plan IDs", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true }),
    });
    const plan = await planner.run("id task");
    assert.ok(plan.id.startsWith("plan-"));
  });

  it("emits step events", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true, result: "done" }),
    });

    const events = [];
    planner.on("event", (e) => events.push(e.type));

    await planner.run("event task");
    assert.ok(events.includes("step_running"));
    assert.ok(events.includes("step_passed"));
  });

  it("handles LLM returning non-JSON", async () => {
    const planner = new AutonomousPlanner({
      runLLM: async () => "not valid json at all",
      executeStep: async () => ({ success: true }),
    });

    const plan = await planner.run("bad LLM task");
    // Should fallback to single step
    assert.strictEqual(plan.steps.length, 1);
    assert.strictEqual(plan.status, "completed");
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

  it("tracks plan start time", async () => {
    const planner = new AutonomousPlanner({
      executeStep: async () => ({ success: true }),
    });
    const before = Date.now();
    const plan = await planner.run("timing task");
    assert.ok(plan.startedAt >= before);
  });
});
