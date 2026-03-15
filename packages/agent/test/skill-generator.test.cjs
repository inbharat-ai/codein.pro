/**
 * CodeIn MAS — Skill Generator Tests
 *
 * Jest-compatible tests for the SkillGenerator module.
 * All external dependencies (runLLM, sandbox, skillRegistry, auditTrail) are mocked.
 */
"use strict";

const { SkillGenerator, MAX_CODE_SIZE, DANGEROUS_PATTERNS } = require("../src/mas/skill-generator");

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
  return jest.fn().mockResolvedValue(typeof response === "string" ? response : makeLLMResponse(response));
}

function createMockSandbox(exitCode = 0, stdout = '{"success":true,"result":{"sum":6}}', stderr = "") {
  return {
    execute: jest.fn().mockResolvedValue({ exitCode, stdout, stderr, durationMs: 50, sandboxId: "test-123" }),
  };
}

function createMockSkillRegistry() {
  const skills = new Map();
  return {
    registerSkill: jest.fn((def) => { skills.set(def.name, def); return def; }),
    unregisterSkill: jest.fn((name) => skills.delete(name)),
    getSkill: jest.fn((name) => skills.get(name) || null),
    _skills: skills,
  };
}

function createMockAuditTrail() {
  return {
    record: jest.fn((entry) => ({ ...entry, id: "audit_test", timestamp: Date.now() })),
  };
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe("SkillGenerator", () => {
  // ─── Constructor ──────────────────────────────────────────

  test("constructor requires runLLM function", () => {
    expect(() => new SkillGenerator({})).toThrow("requires a runLLM function");
    expect(() => new SkillGenerator({ runLLM: "not-a-function" })).toThrow("requires a runLLM function");
  });

  test("constructor accepts valid dependencies", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    expect(gen).toBeInstanceOf(SkillGenerator);
  });

  // ─── generateSkill: success path ──────────────────────────

  test("generates a simple skill with mock LLM returning valid code", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    const sandbox = createMockSandbox();
    const registry = createMockSkillRegistry();
    const audit = createMockAuditTrail();

    // First call: skill generation. Second call: test input generation.
    runLLM
      .mockResolvedValueOnce(makeLLMResponse(VALID_SKILL_DEF))
      .mockResolvedValueOnce('[{"numbers": [1, 2, 3]}]');

    const gen = new SkillGenerator({ runLLM, sandbox, skillRegistry: registry, auditTrail: audit });
    const result = await gen.generateSkill("Sum an array of numbers");

    expect(result.success).toBe(true);
    expect(result.skillName).toBe("sum-numbers");
    expect(result.skill).toBeDefined();
    expect(result.skill.trustLevel).toBe("generated");
  });

  test("skill is registered in the registry after generation", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    runLLM
      .mockResolvedValueOnce(makeLLMResponse(VALID_SKILL_DEF))
      .mockResolvedValueOnce('[{"numbers": [1]}]');

    const sandbox = createMockSandbox();
    const registry = createMockSkillRegistry();

    const gen = new SkillGenerator({ runLLM, sandbox, skillRegistry: registry });
    await gen.generateSkill("Sum numbers");

    expect(registry.registerSkill).toHaveBeenCalledTimes(1);
    expect(registry.registerSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: "sum-numbers", trustLevel: "generated" })
    );
  });

  test("audit trail is recorded on successful generation", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    runLLM
      .mockResolvedValueOnce(makeLLMResponse(VALID_SKILL_DEF))
      .mockResolvedValueOnce('[{}]');

    const sandbox = createMockSandbox();
    const audit = createMockAuditTrail();

    const gen = new SkillGenerator({ runLLM, sandbox, auditTrail: audit });
    await gen.generateSkill("Sum numbers");

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "skill_generated",
        skillName: "sum-numbers",
      })
    );
  });

  // ─── _validateCode: dangerous patterns ────────────────────

  test("rejects code containing require('child_process')", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = gen._validateCode("const cp = require('child_process'); cp.exec('rm -rf /')");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("child_process"))).toBe(true);
  });

  test("rejects code containing require('node:child_process')", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = gen._validateCode("const cp = require('node:child_process')");
    expect(result.valid).toBe(false);
  });

  test("rejects code containing eval()", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = gen._validateCode("const x = eval('1+1')");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("eval"))).toBe(true);
  });

  test("rejects code containing new Function()", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = gen._validateCode("const fn = new Function('return 1')");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Function"))).toBe(true);
  });

  test("rejects code containing process.exit()", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = gen._validateCode("process.exit(1)");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("process"))).toBe(true);
  });

  test("rejects code containing require('fs').rmSync", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = gen._validateCode("const fs = require('fs'); fs.rmSync('/')");
    expect(result.valid).toBe(false);
  });

  test("rejects oversized code (> 10 KB)", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const bigCode = "const x = " + "'a'.repeat(1);\n".repeat(1000);
    // Ensure it's actually over 10KB
    const oversized = bigCode + "x".repeat(MAX_CODE_SIZE);
    const result = gen._validateCode(oversized);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("maximum size"))).toBe(true);
  });

  test("rejects code with syntax errors", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = gen._validateCode("function( { broken syntax");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Syntax error"))).toBe(true);
  });

  test("accepts valid safe code", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = gen._validateCode('async function execute(input) { return { ok: true }; }');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects null/empty code", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    expect(gen._validateCode(null).valid).toBe(false);
    expect(gen._validateCode("").valid).toBe(false);
    expect(gen._validateCode(123).valid).toBe(false);
  });

  // ─── Sandbox testing flow ─────────────────────────────────

  test("sandbox testing passes when sandbox returns exit code 0", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    runLLM
      .mockResolvedValueOnce(makeLLMResponse(VALID_SKILL_DEF))
      .mockResolvedValueOnce('[{"numbers": [1, 2]}]');

    const sandbox = createMockSandbox(0, '{"success":true,"result":{"sum":3}}');
    const gen = new SkillGenerator({ runLLM, sandbox });

    const result = await gen.generateSkill("Sum numbers");
    expect(result.success).toBe(true);
    expect(sandbox.execute).toHaveBeenCalled();
  });

  test("failed sandbox test triggers retry", async () => {
    const runLLM = jest.fn();

    // Attempt 1: valid code but sandbox fails
    runLLM.mockResolvedValueOnce(makeLLMResponse(VALID_SKILL_DEF));
    runLLM.mockResolvedValueOnce('[{"numbers": [1]}]');

    // Attempt 2: valid code and sandbox succeeds
    runLLM.mockResolvedValueOnce(makeLLMResponse(VALID_SKILL_DEF));
    runLLM.mockResolvedValueOnce('[{"numbers": [1]}]');

    const sandbox = {
      execute: jest.fn()
        .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "TypeError", durationMs: 10, sandboxId: "t1" })
        .mockResolvedValueOnce({ exitCode: 0, stdout: '{"success":true,"result":{"sum":1}}', stderr: "", durationMs: 10, sandboxId: "t2" }),
    };

    const gen = new SkillGenerator({ runLLM, sandbox });
    const result = await gen.generateSkill("Sum numbers");

    expect(result.success).toBe(true);
    // LLM was called for 2 generation attempts (2 skill gen + 2 test gen = 4 total)
    expect(runLLM).toHaveBeenCalledTimes(4);
    expect(sandbox.execute).toHaveBeenCalledTimes(2);
  });

  test("max retries exhausted returns failure", async () => {
    const badSkill = { ...VALID_SKILL_DEF, code: "const cp = require('child_process')" };
    const runLLM = createMockRunLLM(badSkill);

    const gen = new SkillGenerator({ runLLM });
    const result = await gen.generateSkill("Do something dangerous");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed after 3 attempts");
  });

  test("audit trail records failure when all attempts exhausted", async () => {
    const badSkill = { ...VALID_SKILL_DEF, code: "const cp = require('child_process')" };
    const runLLM = createMockRunLLM(badSkill);
    const audit = createMockAuditTrail();

    const gen = new SkillGenerator({ runLLM, auditTrail: audit });
    await gen.generateSkill("Dangerous task");

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "skill_generated",
        error: expect.stringContaining("Validation failed"),
        metadata: expect.objectContaining({ exhausted: true }),
      })
    );
  });

  // ─── Works without optional dependencies ──────────────────

  test("works without sandbox (validation only, no sandbox testing)", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    const gen = new SkillGenerator({ runLLM });

    const result = await gen.generateSkill("Sum numbers");
    expect(result.success).toBe(true);
    expect(result.skillName).toBe("sum-numbers");
  });

  test("works without audit trail", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    const gen = new SkillGenerator({ runLLM });

    // Should not throw
    const result = await gen.generateSkill("Sum numbers");
    expect(result.success).toBe(true);
  });

  test("works without skill registry", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    const gen = new SkillGenerator({ runLLM });

    const result = await gen.generateSkill("Sum numbers");
    expect(result.success).toBe(true);
    expect(result.skill.name).toBe("sum-numbers");
  });

  // ─── refineSkill ──────────────────────────────────────────

  test("refines an existing generated skill", async () => {
    const runLLM = jest.fn();
    // Generation call
    runLLM.mockResolvedValueOnce(makeLLMResponse(VALID_SKILL_DEF));
    // Refinement call
    const refinedDef = {
      ...VALID_SKILL_DEF,
      code: 'async function execute(input) { return { sum: (input.numbers || []).reduce((a, b) => a + b, 0), count: (input.numbers || []).length }; }',
    };
    runLLM.mockResolvedValueOnce(makeLLMResponse(refinedDef));

    const registry = createMockSkillRegistry();
    const gen = new SkillGenerator({ runLLM, skillRegistry: registry });

    // First generate
    await gen.generateSkill("Sum numbers");
    expect(registry.registerSkill).toHaveBeenCalledTimes(1);

    // Then refine
    const result = await gen.refineSkill("sum-numbers", "Also return the count of numbers");
    expect(result.success).toBe(true);
    expect(result.skillName).toBe("sum-numbers");
    // Registry should have been called again (unregister + register)
    expect(registry.unregisterSkill).toHaveBeenCalledWith("sum-numbers");
    expect(registry.registerSkill).toHaveBeenCalledTimes(2);
  });

  test("refineSkill fails for non-existent skill", async () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = await gen.refineSkill("nonexistent-skill", "Fix it");
    expect(result.success).toBe(false);
    expect(result.error).toContain("was not generated");
  });

  test("refineSkill requires feedback", async () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = await gen.refineSkill("some-skill", "");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Feedback is required");
  });

  // ─── generateSkill: edge cases ────────────────────────────

  test("returns error for empty task description", async () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = await gen.generateSkill("");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Task description is required");
  });

  test("returns error for non-string task description", async () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const result = await gen.generateSkill(123);
    expect(result.success).toBe(false);
  });

  test("handles LLM returning code wrapped in markdown fences", async () => {
    const fencedResponse = "```json\n" + makeLLMResponse(VALID_SKILL_DEF) + "\n```";
    const runLLM = jest.fn().mockResolvedValue(fencedResponse);

    const gen = new SkillGenerator({ runLLM });
    const result = await gen.generateSkill("Sum numbers");
    expect(result.success).toBe(true);
  });

  test("handles LLM returning invalid JSON gracefully with retries", async () => {
    const runLLM = jest.fn()
      .mockResolvedValueOnce("this is not json at all")
      .mockResolvedValueOnce("still not json {{{")
      .mockResolvedValueOnce(makeLLMResponse(VALID_SKILL_DEF));

    const gen = new SkillGenerator({ runLLM });
    const result = await gen.generateSkill("Sum numbers");
    expect(result.success).toBe(true);
    expect(runLLM).toHaveBeenCalledTimes(3);
  });

  // ─── _wrapAsSkill ─────────────────────────────────────────

  test("wrapped skill execute throws without sandbox", async () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    const skill = gen._wrapAsSkill("test-skill", "async function execute(input) { return {}; }", {
      description: "test",
    });

    await expect(skill.execute({ foo: "bar" })).rejects.toThrow("no sandbox available");
  });

  test("wrapped skill execute runs code in sandbox", async () => {
    const sandbox = createMockSandbox(0, '{"__ok":true,"result":{"sum":3}}');
    const gen = new SkillGenerator({ runLLM: jest.fn(), sandbox });

    const skill = gen._wrapAsSkill("test-skill", "async function execute(input) { return { sum: 3 }; }", {
      description: "test",
    });

    const result = await skill.execute({ numbers: [1, 2] });
    expect(result).toEqual({ sum: 3 });
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.objectContaining({ runtime: "node" })
    );
  });

  // ─── Events ───────────────────────────────────────────────

  test("emits generation:success event on successful generation", async () => {
    const runLLM = createMockRunLLM(VALID_SKILL_DEF);
    const gen = new SkillGenerator({ runLLM });

    const events = [];
    gen.on("generation:success", (data) => events.push(data));

    await gen.generateSkill("Sum numbers");
    expect(events).toHaveLength(1);
    expect(events[0].skillName).toBe("sum-numbers");
  });

  test("emits generation:exhausted when all attempts fail", async () => {
    const badSkill = { ...VALID_SKILL_DEF, code: "eval('bad')" };
    const runLLM = createMockRunLLM(badSkill);
    const gen = new SkillGenerator({ runLLM });

    const events = [];
    gen.on("generation:exhausted", (data) => events.push(data));

    await gen.generateSkill("Bad task");
    expect(events).toHaveLength(1);
    expect(events[0].lastError).toContain("Validation failed");
  });

  // ─── Dangerous pattern coverage ───────────────────────────

  test("rejects require('net')", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    expect(gen._validateCode("require('net')").valid).toBe(false);
  });

  test("rejects require('worker_threads')", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    expect(gen._validateCode("require('worker_threads')").valid).toBe(false);
  });

  test("rejects require('cluster')", () => {
    const gen = new SkillGenerator({ runLLM: jest.fn() });
    expect(gen._validateCode("require('cluster')").valid).toBe(false);
  });
});
