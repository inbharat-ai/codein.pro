/**
 * CodeIn MAS — Skill Generator Tests
 *
 * node:test-compatible tests for the SkillGenerator module.
 * All external dependencies (runLLM, sandbox, skillRegistry, auditTrail) are mocked.
 */
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { SkillGenerator, MAX_CODE_SIZE, DANGEROUS_PATTERNS } = require("../src/mas/skill-generator");

// ═══════════════════════════════════════════════════════════════
// Mock helper
// ═══════════════════════════════════════════════════════════════

function createMock(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl ? impl(...args) : fn._returnValue; };
  fn.calls = [];
  fn._returnValue = undefined;
  fn.mockReturnValue = (v) => { fn._returnValue = v; return fn; };
  fn.mockReset = () => { fn.calls = []; fn._returnValue = undefined; };
  return fn;
}

function createMockWithResolvedValues(...values) {
  let callIdx = 0;
  const fn = createMock(async () => {
    const val = values[callIdx] !== undefined ? values[callIdx] : values[values.length - 1];
    callIdx++;
    return val;
  });
  return fn;
}

// ═══════════════════════════════════════════════════════════════
// Helpers — Mock Factories
// ═══════════════════════════════════════════════════════════════

function makeLLMResponse(skillDef) {
  return JSON.stringify(skillDef);
}

const VALID_SKILL_DEF = {
  name: "sum-numbers",
  description: "Sums an array of numbers",
  category: "data",
  code: 'async function execute(input) { const sum = (input.numbers || []).reduce((a, b) => a + b, 0); return { sum }; }',
  inputSchema: { type: "object", properties: { numbers: { type: "array" } }, required: ["numbers"] },
  outputSchema: { type: "object", properties: { sum: { type: "number" } } },
};

function createMockRunLLM(response) {
  return createMock(async () => typeof response === "string" ? response : makeLLMResponse(response));
}

function createMockSandbox(exitCode = 0, stdout = '{"success":true,"result":{"sum":6}}', stderr = "") {
  return {
    execute: createMock(async () => ({ exitCode, stdout, stderr, durationMs: 50, sandboxId: "test-123" })),
  };
}

function createMockSkillRegistry() {
  const skills = new Map();
  return {
    registerSkill: createMock((def) => { skills.set(def.name, def); return def; }),
    unregisterSkill: createMock((name) => skills.delete(name)),
    getSkill: createMock((name) => skills.get(name) || null),
    _skills: skills,
  };
}

function createMockAuditTrail() {
  return {
    record: createMock((entry) => ({ ...entry, id: "audit_test", timestamp: Date.now() })),
  };
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe("SkillGenerator", () => {
  // ─── Constructor ──────────────────────────────────────────

  test("constructor requires runLLM function", () => {
    assert.throws(() => new SkillGenerator({}), /requires a runLLM function/);
    assert.throws(() => new SkillGenerator({ runLLM: "not-a-function" }), /requires a runLLM function/);
  });

  test("constructor accepts valid dependencies", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    assert.ok(gen instanceof SkillGenerator);
  });

  // ─── generateSkill: success path ──────────────────────────

  test("generates a simple skill with mock LLM returning valid code", async () => {
    const runLLM = createMockWithResolvedValues(
      makeLLMResponse(VALID_SKILL_DEF),
      '[{"numbers": [1, 2, 3]}]'
    );
    const sandbox = createMockSandbox();
    const registry = createMockSkillRegistry();
    const audit = createMockAuditTrail();

    const gen = new SkillGenerator({ runLLM, sandbox, skillRegistry: registry, auditTrail: audit });
    const result = await gen.generateSkill("Sum an array of numbers");

    assert.ok(result.success);
    assert.equal(result.skillName, "sum-numbers");
    assert.ok(result.skill);
    assert.equal(result.skill.trustLevel, "generated");
  });

  test("skill is registered in the registry after generation", async () => {
    const runLLM = createMockWithResolvedValues(
      makeLLMResponse(VALID_SKILL_DEF),
      '[{"numbers": [1]}]'
    );

    const sandbox = createMockSandbox();
    const registry = createMockSkillRegistry();

    const gen = new SkillGenerator({ runLLM, sandbox, skillRegistry: registry });
    await gen.generateSkill("Sum numbers");

    assert.equal(registry.registerSkill.calls.length, 1);
    const regArg = registry.registerSkill.calls[0][0];
    assert.equal(regArg.name, "sum-numbers");
    assert.equal(regArg.trustLevel, "generated");
  });

  test("audit trail is recorded on successful generation", async () => {
    const runLLM = createMockWithResolvedValues(
      makeLLMResponse(VALID_SKILL_DEF),
      '[{}]'
    );

    const sandbox = createMockSandbox();
    const audit = createMockAuditTrail();

    const gen = new SkillGenerator({ runLLM, sandbox, auditTrail: audit });
    await gen.generateSkill("Sum numbers");

    assert.ok(audit.record.calls.length > 0);
    const recordArg = audit.record.calls.find(c => c[0].action === "skill_generated");
    assert.ok(recordArg);
    assert.equal(recordArg[0].skillName, "sum-numbers");
  });

  // ─── _validateCode: dangerous patterns ────────────────────

  test("rejects code containing require('child_process')", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = gen._validateCode("const cp = require('child_process'); cp.exec('rm -rf /')");
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("child_process")));
  });

  test("rejects code containing require('node:child_process')", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = gen._validateCode("const cp = require('node:child_process')");
    assert.ok(!result.valid);
  });

  test("rejects code containing eval()", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = gen._validateCode("const x = eval('1+1')");
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("eval")));
  });

  test("rejects code containing new Function()", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = gen._validateCode("const fn = new Function('return 1')");
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("Function")));
  });

  test("rejects code containing process.exit()", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = gen._validateCode("process.exit(1)");
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("process")));
  });

  test("rejects code containing require('fs').rmSync", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = gen._validateCode("const fs = require('fs'); fs.rmSync('/')");
    assert.ok(!result.valid);
  });

  test("rejects oversized code (> 10 KB)", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const bigCode = "const x = " + "'a'.repeat(1);\n".repeat(1000);
    // Ensure it's actually over 10KB
    const oversized = bigCode + "x".repeat(MAX_CODE_SIZE);
    const result = gen._validateCode(oversized);
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("maximum size")));
  });

  test("rejects code with syntax errors", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = gen._validateCode("function( { broken syntax");
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("Syntax error")));
  });

  test("accepts valid safe code", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = gen._validateCode('async function execute(input) { return { ok: true }; }');
    assert.ok(result.valid);
    assert.equal(result.errors.length, 0);
  });

  test("rejects null/empty code", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    assert.ok(!gen._validateCode(null).valid);
    assert.ok(!gen._validateCode("").valid);
    assert.ok(!gen._validateCode(123).valid);
  });

  // ─── Sandbox testing flow ─────────────────────────────────

  test("sandbox testing passes when sandbox returns exit code 0", async () => {
    const runLLM = createMockWithResolvedValues(
      makeLLMResponse(VALID_SKILL_DEF),
      '[{"numbers": [1, 2]}]'
    );

    const sandbox = createMockSandbox(0, '{"success":true,"result":{"sum":3}}');
    const gen = new SkillGenerator({ runLLM, sandbox });

    const result = await gen.generateSkill("Sum numbers");
    assert.ok(result.success);
    assert.ok(sandbox.execute.calls.length > 0);
  });

  test("failed sandbox test triggers retry", async () => {
    let callIdx = 0;
    const responses = [
      makeLLMResponse(VALID_SKILL_DEF),
      '[{"numbers": [1]}]',
      makeLLMResponse(VALID_SKILL_DEF),
      '[{"numbers": [1]}]',
    ];
    const runLLM = createMock(async () => {
      const val = responses[callIdx] || responses[responses.length - 1];
      callIdx++;
      return val;
    });

    let sandboxCallIdx = 0;
    const sandboxResponses = [
      { exitCode: 1, stdout: "", stderr: "TypeError", durationMs: 10, sandboxId: "t1" },
      { exitCode: 0, stdout: '{"success":true,"result":{"sum":1}}', stderr: "", durationMs: 10, sandboxId: "t2" },
    ];
    const sandbox = {
      execute: createMock(async () => {
        const val = sandboxResponses[sandboxCallIdx] || sandboxResponses[sandboxResponses.length - 1];
        sandboxCallIdx++;
        return val;
      }),
    };

    const gen = new SkillGenerator({ runLLM, sandbox });
    const result = await gen.generateSkill("Sum numbers");

    assert.ok(result.success);
    // LLM was called for 2 generation attempts (2 skill gen + 2 test gen = 4 total)
    assert.equal(runLLM.calls.length, 4);
    assert.equal(sandbox.execute.calls.length, 2);
  });

  test("max retries exhausted returns failure", async () => {
    const badSkill = { ...VALID_SKILL_DEF, code: "const cp = require('child_process')" };
    const runLLM = createMockRunLLM(badSkill);

    const gen = new SkillGenerator({ runLLM });
    const result = await gen.generateSkill("Do something dangerous");

    assert.ok(!result.success);
    assert.ok(result.error.includes("Failed after 3 attempts"));
  });

  test("audit trail records failure when all attempts exhausted", async () => {
    const badSkill = { ...VALID_SKILL_DEF, code: "const cp = require('child_process')" };
    const runLLM = createMockRunLLM(badSkill);
    const audit = createMockAuditTrail();

    const gen = new SkillGenerator({ runLLM, auditTrail: audit });
    await gen.generateSkill("Dangerous task");

    const failRecord = audit.record.calls.find(c =>
      c[0].action === "skill_generated" && c[0].error && c[0].error.includes("Validation failed")
    );
    assert.ok(failRecord, "Should have recorded a failure audit entry");
    assert.ok(failRecord[0].metadata.exhausted);
  });

  // ─── Works without optional dependencies ──────────────────

  test("works without sandbox (validation only, no sandbox testing)", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    const gen = new SkillGenerator({ runLLM });

    const result = await gen.generateSkill("Sum numbers");
    assert.ok(result.success);
    assert.equal(result.skillName, "sum-numbers");
  });

  test("works without audit trail", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    const gen = new SkillGenerator({ runLLM });

    // Should not throw
    const result = await gen.generateSkill("Sum numbers");
    assert.ok(result.success);
  });

  test("works without skill registry", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    const gen = new SkillGenerator({ runLLM });

    const result = await gen.generateSkill("Sum numbers");
    assert.ok(result.success);
    assert.equal(result.skill.name, "sum-numbers");
  });

  // ─── refineSkill ──────────────────────────────────────────

  test("refines an existing generated skill", async () => {
    const refinedDef = {
      ...VALID_SKILL_DEF,
      code: 'async function execute(input) { return { sum: (input.numbers || []).reduce((a, b) => a + b, 0), count: (input.numbers || []).length }; }',
    };
    let callIdx = 0;
    const responses = [
      makeLLMResponse(VALID_SKILL_DEF),
      makeLLMResponse(refinedDef),
    ];
    const runLLM = createMock(async () => {
      const val = responses[callIdx] || responses[responses.length - 1];
      callIdx++;
      return val;
    });

    const registry = createMockSkillRegistry();
    const gen = new SkillGenerator({ runLLM, skillRegistry: registry });

    // First generate
    await gen.generateSkill("Sum numbers");
    assert.equal(registry.registerSkill.calls.length, 1);

    // Then refine
    const result = await gen.refineSkill("sum-numbers", "Also return the count of numbers");
    assert.ok(result.success);
    assert.equal(result.skillName, "sum-numbers");
    // Registry should have been called again (unregister + register)
    assert.ok(registry.unregisterSkill.calls.some(c => c[0] === "sum-numbers"));
    assert.equal(registry.registerSkill.calls.length, 2);
  });

  test("refineSkill fails for non-existent skill", async () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = await gen.refineSkill("nonexistent-skill", "Fix it");
    assert.ok(!result.success);
    assert.ok(result.error.includes("was not generated"));
  });

  test("refineSkill requires feedback", async () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = await gen.refineSkill("some-skill", "");
    assert.ok(!result.success);
    assert.ok(result.error.includes("Feedback is required"));
  });

  // ─── generateSkill: edge cases ────────────────────────────

  test("returns error for empty task description", async () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = await gen.generateSkill("");
    assert.ok(!result.success);
    assert.ok(result.error.includes("Task description is required"));
  });

  test("returns error for non-string task description", async () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const result = await gen.generateSkill(123);
    assert.ok(!result.success);
  });

  test("handles LLM returning code wrapped in markdown fences", async () => {
    const fencedResponse = "```json\n" + makeLLMResponse(VALID_SKILL_DEF) + "\n```";
    const runLLM = createMock(async () => fencedResponse);

    const gen = new SkillGenerator({ runLLM });
    const result = await gen.generateSkill("Sum numbers");
    assert.ok(result.success);
  });

  test("handles LLM returning invalid JSON gracefully with retries", async () => {
    let callIdx = 0;
    const responses = [
      "this is not json at all",
      "still not json {{{",
      makeLLMResponse(VALID_SKILL_DEF),
    ];
    const runLLM = createMock(async () => {
      const val = responses[callIdx] || responses[responses.length - 1];
      callIdx++;
      return val;
    });

    const gen = new SkillGenerator({ runLLM });
    const result = await gen.generateSkill("Sum numbers");
    assert.ok(result.success);
    assert.equal(runLLM.calls.length, 3);
  });

  // ─── _wrapAsSkill ─────────────────────────────────────────

  test("wrapped skill execute throws without sandbox", async () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    const skill = gen._wrapAsSkill("test-skill", "async function execute(input) { return {}; }", {
      description: "test",
    });

    await assert.rejects(() => skill.execute({ foo: "bar" }), /no sandbox available/);
  });

  test("wrapped skill execute runs code in sandbox", async () => {
    const sandbox = createMockSandbox(0, '{"__ok":true,"result":{"sum":3}}');
    const gen = new SkillGenerator({ runLLM: createMock(), sandbox });

    const skill = gen._wrapAsSkill("test-skill", "async function execute(input) { return { sum: 3 }; }", {
      description: "test",
    });

    const result = await skill.execute({ numbers: [1, 2] });
    assert.deepStrictEqual(result, { sum: 3 });
    assert.ok(sandbox.execute.calls.length > 0);
    assert.equal(sandbox.execute.calls[0][0].runtime, "node");
  });

  // ─── Events ───────────────────────────────────────────────

  test("emits generation:success event on successful generation", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    const gen = new SkillGenerator({ runLLM });

    const events = [];
    gen.on("generation:success", (data) => events.push(data));

    await gen.generateSkill("Sum numbers");
    assert.equal(events.length, 1);
    assert.equal(events[0].skillName, "sum-numbers");
  });

  test("emits generation:exhausted when all attempts fail", async () => {
    const badSkill = { ...VALID_SKILL_DEF, code: "eval('bad')" };
    const runLLM = createMockRunLLM(badSkill);
    const gen = new SkillGenerator({ runLLM });

    const events = [];
    gen.on("generation:exhausted", (data) => events.push(data));

    await gen.generateSkill("Bad task");
    assert.equal(events.length, 1);
    assert.ok(events[0].lastError.includes("Validation failed"));
  });

  // ─── Dangerous pattern coverage ───────────────────────────

  test("rejects require('net')", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    assert.ok(!gen._validateCode("require('net')").valid);
  });

  test("rejects require('worker_threads')", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    assert.ok(!gen._validateCode("require('worker_threads')").valid);
  });

  test("rejects require('cluster')", () => {
    const gen = new SkillGenerator({ runLLM: createMock() });
    assert.ok(!gen._validateCode("require('cluster')").valid);
  });
});
