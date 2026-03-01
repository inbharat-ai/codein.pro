const assert = require("node:assert/strict");
const test = require("node:test");
const { getRouterDecision } = require("../src/router");

test("router chooses cloud when local model missing", () => {
  const decision = getRouterDecision({
    prompt: "Quick task",
    contextChars: 100,
    deepPlanning: false,
    preferAccuracy: false,
    hasLocalModel: false,
  });
  assert.equal(decision.provider, "cloud");
  assert.equal(decision.role, "coder");
});

test("router chooses reasoner for deep planning", () => {
  const decision = getRouterDecision({
    prompt: "Plan migration",
    contextChars: 20000,
    deepPlanning: true,
    preferAccuracy: false,
    hasLocalModel: true,
  });
  assert.equal(decision.provider, "local");
  assert.equal(decision.role, "reasoner");
});
