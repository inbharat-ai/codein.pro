/**
 * Integration tests for the EnhancedSkillRegistry system.
 *
 * Tests:
 * - Registration and query of builtin skills
 * - Task-description matching (findSkillsForTask)
 * - Skill execution (file ops with temp dir, terminal echo)
 * - Cost estimation
 * - Audit logging within the registry
 * - Unregister / re-register lifecycle
 * - Listing with category/trust filters
 * - Error handling and validation
 */
"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

let EnhancedSkillRegistry, SKILL_CATEGORY, SKILL_TRUST_LEVEL;

try {
  ({ EnhancedSkillRegistry, SKILL_CATEGORY, SKILL_TRUST_LEVEL } = require("../src/mas/skill-registry"));
} catch (err) {
  console.log("skill-registry.js not found — skipping:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

// ── Helpers ──────────────────────────────────────────────────────

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codin-skill-test-"));
}

function cleanupDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe("EnhancedSkillRegistry — Integration", () => {
  let registry;

  beforeEach(() => {
    registry = new EnhancedSkillRegistry();
  });

  it("registers builtin skills without error", () => {
    registry.registerBuiltinSkills();
    const all = registry.listSkills();
    assert.ok(all.length >= 10, `Expected >=10 builtin skills, got ${all.length}`);
  });

  it("getSkill returns a registered skill by name", () => {
    registry.registerBuiltinSkills();
    const skill = registry.getSkill("read-file");
    assert.ok(skill, "read-file should exist");
    assert.strictEqual(skill.name, "read-file");
    assert.strictEqual(skill.category, SKILL_CATEGORY.FILE_OPS);
    assert.strictEqual(skill.trustLevel, SKILL_TRUST_LEVEL.BUILTIN);
  });

  it("getSkill returns null for unknown skill", () => {
    registry.registerBuiltinSkills();
    assert.strictEqual(registry.getSkill("nonexistent-skill"), null);
  });

  it("findSkillsForTask returns matching skills for 'read a file'", async () => {
    registry.registerBuiltinSkills();
    const matches = await registry.findSkillsForTask("read a file");
    assert.ok(matches.length >= 1, "Should find at least 1 match");
    const names = matches.map((s) => s.name);
    assert.ok(names.includes("read-file"), `Expected read-file in matches, got ${names}`);
  });

  it("findSkillsForTask returns matching skills for 'run terminal command'", async () => {
    registry.registerBuiltinSkills();
    const matches = await registry.findSkillsForTask("run a terminal command");
    assert.ok(matches.length >= 1);
    const names = matches.map((s) => s.name);
    assert.ok(names.includes("run-terminal-command"));
  });

  it("findSkillsForTask returns matching skills for 'git status'", async () => {
    registry.registerBuiltinSkills();
    const matches = await registry.findSkillsForTask("git status of the repo");
    assert.ok(matches.length >= 1);
    const names = matches.map((s) => s.name);
    assert.ok(names.includes("git-status"), `Expected git-status, got ${names}`);
  });

  it("findSkillsForTask returns matching skills for 'run tests'", async () => {
    registry.registerBuiltinSkills();
    const matches = await registry.findSkillsForTask("run the jest tests");
    assert.ok(matches.length >= 1);
    const names = matches.map((s) => s.name);
    assert.ok(names.includes("run-tests"), `Expected run-tests, got ${names}`);
  });

  it("findSkillsForTask returns empty array for empty input", async () => {
    registry.registerBuiltinSkills();
    const matches = await registry.findSkillsForTask("");
    assert.deepStrictEqual(matches, []);
  });

  it("findSkillsForTask returns empty array for null input", async () => {
    registry.registerBuiltinSkills();
    const matches = await registry.findSkillsForTask(null);
    assert.deepStrictEqual(matches, []);
  });

  it("executes read-file skill on a real temp file", async () => {
    registry.registerBuiltinSkills();
    const tmpDir = createTempDir();
    const testFile = path.join(tmpDir, "test.txt");
    fs.writeFileSync(testFile, "hello world", "utf-8");

    try {
      const { result, durationMs } = await registry.executeSkill("read-file", { filePath: testFile });
      assert.strictEqual(result.content, "hello world");
      assert.strictEqual(result.size, 11);
      assert.strictEqual(typeof durationMs, "number");
      assert.ok(durationMs >= 0);
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it("executes write-file skill to a temp directory", async () => {
    registry.registerBuiltinSkills();
    const tmpDir = createTempDir();
    const outFile = path.join(tmpDir, "output.txt");

    try {
      const { result } = await registry.executeSkill("write-file", {
        filePath: outFile,
        content: "written by skill",
      });
      assert.ok(result.bytesWritten > 0);
      // Verify the file was actually written
      const content = fs.readFileSync(outFile, "utf-8");
      assert.strictEqual(content, "written by skill");
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it("executes run-terminal-command skill with echo", async () => {
    registry.registerBuiltinSkills();
    const { result } = await registry.executeSkill("run-terminal-command", {
      command: "echo skill-test-output",
    });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes("skill-test-output"), `Expected echo output, got: ${result.stdout}`);
  });

  it("executeSkill throws for unregistered skill", async () => {
    await assert.rejects(
      () => registry.executeSkill("no-such-skill", {}),
      (err) => {
        assert.ok(err.message.includes("not registered"));
        return true;
      }
    );
  });

  it("cost estimation returns valid numbers for builtin skills", () => {
    registry.registerBuiltinSkills();
    const cost = registry.estimateSkillCost("read-file");
    assert.ok(cost, "Should return cost estimate");
    assert.strictEqual(typeof cost.tokenEstimate, "number");
    assert.strictEqual(typeof cost.timeEstimate, "number");
    assert.strictEqual(typeof cost.costUSD, "number");
    assert.ok(cost.tokenEstimate >= 0);
    assert.ok(cost.timeEstimate >= 0);
    assert.ok(cost.costUSD >= 0);
  });

  it("cost estimation with contentLength adjusts token estimate", () => {
    registry.registerBuiltinSkills();
    const baseCost = registry.estimateSkillCost("llm-analyze");
    const adjustedCost = registry.estimateSkillCost("llm-analyze", { contentLength: 100000 });
    assert.ok(adjustedCost.tokenEstimate >= baseCost.tokenEstimate);
  });

  it("cost estimation returns null for unknown skill", () => {
    registry.registerBuiltinSkills();
    const cost = registry.estimateSkillCost("nonexistent");
    assert.strictEqual(cost, null);
  });

  it("audit log records skill executions", async () => {
    registry.registerBuiltinSkills();
    const tmpDir = createTempDir();
    const testFile = path.join(tmpDir, "audit-test.txt");
    fs.writeFileSync(testFile, "audit data", "utf-8");

    try {
      await registry.executeSkill("read-file", { filePath: testFile });
      const log = registry.getAuditLog(10);
      assert.ok(log.length >= 1, "Audit log should have at least 1 entry");
      const lastEntry = log[log.length - 1];
      assert.strictEqual(lastEntry.skillName, "read-file");
      assert.strictEqual(lastEntry.success, true);
      assert.strictEqual(typeof lastEntry.durationMs, "number");
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it("audit log records failures", async () => {
    registry.registerBuiltinSkills();
    try {
      await registry.executeSkill("read-file", { filePath: "/nonexistent/path/that/does/not/exist.xyz" });
    } catch {
      // expected
    }
    const log = registry.getAuditLog(10);
    const failEntry = log.find((e) => e.skillName === "read-file" && !e.success);
    assert.ok(failEntry, "Should have a failure audit entry");
    assert.ok(failEntry.error, "Failure entry should have error message");
  });

  it("listSkills filters by category", () => {
    registry.registerBuiltinSkills();
    const fileSkills = registry.listSkills({ category: SKILL_CATEGORY.FILE_OPS });
    assert.ok(fileSkills.length >= 1);
    for (const s of fileSkills) {
      assert.strictEqual(s.category, SKILL_CATEGORY.FILE_OPS);
    }
  });

  it("listSkills filters by trustLevel", () => {
    registry.registerBuiltinSkills();
    registry.registerSkill({
      name: "custom-untested",
      description: "An untested skill",
      category: SKILL_CATEGORY.ANALYSIS,
      trustLevel: SKILL_TRUST_LEVEL.UNTESTED,
      execute: async () => ({}),
    });

    const untested = registry.listSkills({ trustLevel: SKILL_TRUST_LEVEL.UNTESTED });
    assert.strictEqual(untested.length, 1);
    assert.strictEqual(untested[0].name, "custom-untested");
  });

  it("unregisterSkill removes a skill", () => {
    registry.registerBuiltinSkills();
    assert.ok(registry.getSkill("read-file"));
    const removed = registry.unregisterSkill("read-file");
    assert.strictEqual(removed, true);
    assert.strictEqual(registry.getSkill("read-file"), null);
  });

  it("unregisterSkill returns false for unknown skill", () => {
    assert.strictEqual(registry.unregisterSkill("nope"), false);
  });

  it("registerSkill rejects duplicate names", () => {
    registry.registerSkill({
      name: "dup-test",
      description: "First",
      category: SKILL_CATEGORY.ANALYSIS,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      execute: async () => ({}),
    });
    assert.throws(
      () =>
        registry.registerSkill({
          name: "dup-test",
          description: "Second",
          category: SKILL_CATEGORY.ANALYSIS,
          trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
          execute: async () => ({}),
        }),
      /already registered/
    );
  });

  it("registerSkill validates required fields", () => {
    assert.throws(() => registry.registerSkill(null), /non-null object/);
    assert.throws(() => registry.registerSkill({}), /string name/);
    assert.throws(
      () => registry.registerSkill({ name: "no-exec", description: "x" }),
      /execute function/
    );
  });

  it("registerSkill validates category", () => {
    assert.throws(
      () =>
        registry.registerSkill({
          name: "bad-cat",
          description: "x",
          category: "invalid_cat",
          execute: async () => ({}),
        }),
      /Invalid category/
    );
  });

  it("registerSkill validates trust level", () => {
    assert.throws(
      () =>
        registry.registerSkill({
          name: "bad-trust",
          description: "x",
          trustLevel: "super_trusted",
          execute: async () => ({}),
        }),
      /Invalid trust level/
    );
  });

  it("list-files skill lists directory contents", async () => {
    registry.registerBuiltinSkills();
    const tmpDir = createTempDir();
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "a");
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "b");

    try {
      const { result } = await registry.executeSkill("list-files", { dirPath: tmpDir });
      assert.ok(result.count >= 2, `Expected at least 2 files, got ${result.count}`);
      const names = result.files.map((f) => f.name);
      assert.ok(names.includes("a.txt"));
      assert.ok(names.includes("b.txt"));
    } finally {
      cleanupDir(tmpDir);
    }
  });

  it("SKILL_CATEGORY and SKILL_TRUST_LEVEL are frozen objects", () => {
    assert.ok(Object.isFrozen(SKILL_CATEGORY));
    assert.ok(Object.isFrozen(SKILL_TRUST_LEVEL));
  });
});
