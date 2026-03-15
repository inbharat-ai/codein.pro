/**
 * MAS — Cost Router Smoke Tests
 */
const assert = require("node:assert/strict");

const { CostRouter, MODEL_PRICING, COMPLEXITY_KEYWORDS } = require("../src/mas/cost-router");

// ── Constructor ──

test("CostRouter constructor requires positive budgetUSD", () => {
  assert.throws(() => new CostRouter({ budgetUSD: 0 }), /positive number/);
  assert.throws(() => new CostRouter({ budgetUSD: -1 }), /positive number/);
  assert.throws(() => new CostRouter({ budgetUSD: "5" }), /positive number/);
});

test("CostRouter constructor validates thresholds", () => {
  assert.throws(
    () => new CostRouter({ budgetUSD: 5, warningThresholdPercent: -1 }),
    /0-100/
  );
  assert.throws(
    () => new CostRouter({ budgetUSD: 5, warningThresholdPercent: 90, hardStopPercent: 80 }),
    /hardStopPercent must be >= warningThresholdPercent/
  );
});

test("CostRouter creates with valid params", () => {
  const router = new CostRouter({ budgetUSD: 5.0 });
  const status = router.getBudgetStatus();
  assert.equal(status.budgetUSD, 5.0);
  assert.equal(status.totalSpent, 0);
  assert.equal(status.remaining, 5.0);
  assert.equal(status.warning, false);
  assert.equal(status.hardStop, false);
});

// ── Model Selection ──

test("selectModel returns model, tier, cost, and reasoning", () => {
  const router = new CostRouter({ budgetUSD: 10 });
  const result = router.selectModel({
    goal: "fix typo in README",
    agentType: "docs",
  });
  assert.ok(result.model);
  assert.ok(result.tier);
  assert.equal(typeof result.estimatedCostUSD, "number");
  assert.ok(result.reasoning);
});

test("selectModel validates task object", () => {
  const router = new CostRouter({ budgetUSD: 10 });
  assert.throws(() => router.selectModel(null), /task object is required/);
  assert.throws(() => router.selectModel({}), /task.goal is required/);
});

test("selectModel picks premium for security agent with complex goal", () => {
  const router = new CostRouter({ budgetUSD: 10 });
  const result = router.selectModel({
    goal: "security audit of the authentication system",
    agentType: "security",
  });
  assert.equal(result.tier, "premium");
});

test("selectModel picks fast for simple tasks", () => {
  const router = new CostRouter({ budgetUSD: 10 });
  const result = router.selectModel({
    goal: "fix typo in the header",
    agentType: "docs",
  });
  assert.equal(result.tier, "fast");
});

test("selectModel returns null model when budget exhausted", () => {
  const router = new CostRouter({ budgetUSD: 0.01 });
  // Exhaust budget
  router.trackSpend(0.01, "claude-sonnet", "coder");
  const result = router.selectModel({
    goal: "write some code",
    agentType: "coder",
  });
  assert.equal(result.model, null);
  assert.ok(result.reasoning.includes("exhausted"));
});

// ── Cost Estimation ──

test("estimateCost calculates correctly", () => {
  const router = new CostRouter({ budgetUSD: 10 });
  // claude-sonnet: input $3/M, output $15/M
  const cost = router.estimateCost("claude-sonnet", 1_000_000, 1_000_000);
  assert.equal(cost, 3 + 15);
});

test("estimateCost returns 0 for unknown model", () => {
  const router = new CostRouter({ budgetUSD: 10 });
  assert.equal(router.estimateCost("nonexistent-model", 1000, 1000), 0);
});

test("estimateCost returns 0 for local models", () => {
  const router = new CostRouter({ budgetUSD: 10 });
  const cost = router.estimateCost("llama-3.1-8b", 100000, 100000);
  assert.equal(cost, 0);
});

// ── Spend Tracking ──

test("trackSpend accumulates and returns correct status", () => {
  const router = new CostRouter({ budgetUSD: 1.0 });
  const s1 = router.trackSpend(0.3, "claude-sonnet", "coder");
  assert.equal(s1.totalSpent, 0.3);
  assert.ok(Math.abs(s1.remaining - 0.7) < 0.0001);
  assert.equal(s1.warning, false);

  const s2 = router.trackSpend(0.5, "claude-sonnet", "coder");
  assert.ok(Math.abs(s2.totalSpent - 0.8) < 0.0001);
  assert.equal(s2.warning, true); // 80% threshold
  assert.equal(s2.hardStop, false);

  const s3 = router.trackSpend(0.2, "claude-sonnet", "coder");
  assert.equal(s3.hardStop, true); // 100%
});

test("trackSpend rejects negative amounts", () => {
  const router = new CostRouter({ budgetUSD: 5 });
  assert.throws(() => router.trackSpend(-1, "m", "a"), /non-negative/);
});

// ── Cost Optimization ──

test("suggestCostOptimization returns suggestions array", () => {
  const router = new CostRouter({ budgetUSD: 10 });
  const result = router.suggestCostOptimization();
  assert.ok(Array.isArray(result.suggestions));
  assert.equal(typeof result.potentialSavings, "number");
});

test("suggestCostOptimization analyzes spending history", () => {
  const router = new CostRouter({ budgetUSD: 10 });
  router.trackSpend(0.5, "claude-opus", "planner");
  router.trackSpend(0.2, "claude-sonnet", "docs");
  const result = router.suggestCostOptimization();
  assert.ok(result.suggestions.length > 0);
});

// ── MODEL_PRICING ──

test("MODEL_PRICING is frozen and has expected models", () => {
  assert.ok(Object.isFrozen(MODEL_PRICING));
  assert.ok("claude-opus" in MODEL_PRICING);
  assert.ok("claude-sonnet" in MODEL_PRICING);
  assert.ok("gpt-4o" in MODEL_PRICING);
  assert.ok("gemini-2.0-flash" in MODEL_PRICING);
  assert.ok("deepseek-chat" in MODEL_PRICING);
  assert.ok("llama-3.1-8b" in MODEL_PRICING);
});

test("COMPLEXITY_KEYWORDS has three levels", () => {
  assert.ok(Object.isFrozen(COMPLEXITY_KEYWORDS));
  assert.ok(Array.isArray(COMPLEXITY_KEYWORDS.simple));
  assert.ok(Array.isArray(COMPLEXITY_KEYWORDS.moderate));
  assert.ok(Array.isArray(COMPLEXITY_KEYWORDS.complex));
});

// ── getModelPricing ──

test("getModelPricing returns the pricing table", () => {
  const router = new CostRouter({ budgetUSD: 1 });
  const pricing = router.getModelPricing();
  assert.equal(pricing, MODEL_PRICING);
});
