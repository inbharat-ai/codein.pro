/**
 * Tests for EnhancedSkillRegistry
 *
 * Jest-compatible format — describe/it/beforeAll/afterAll globals
 */
"use strict";

const assert = require("node:assert");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const {
  EnhancedSkillRegistry,
  SKILL_CATEGORY,
  SKILL_TRUST_LEVEL,
} = require("../src/mas/skill-registry");

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

let tmpDir;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-reg-test-"));
});

afterAll(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════
// 1. Enum exports
// ═══════════════════════════════════════════════════════════════

describe("SKILL_CATEGORY enum", () => {
  it("exports all 10 categories", () => {
    assert.strictEqual(Object.keys(SKILL_CATEGORY).length, 10);
    assert.strictEqual(SKILL_CATEGORY.FILE_OPS, "file_ops");
    assert.strictEqual(SKILL_CATEGORY.TERMINAL, "terminal");
    assert.strictEqual(SKILL_CATEGORY.GIT, "git");
    assert.strictEqual(SKILL_CATEGORY.BROWSER, "browser");
    assert.strictEqual(SKILL_CATEGORY.CODE_GEN, "code_gen");
    assert.strictEqual(SKILL_CATEGORY.API, "api");
    assert.strictEqual(SKILL_CATEGORY.TESTING, "testing");
    assert.strictEqual(SKILL_CATEGORY.DEPLOYMENT, "deployment");
    assert.strictEqual(SKILL_CATEGORY.DATA, "data");
    assert.strictEqual(SKILL_CATEGORY.ANALYSIS, "analysis");
  });
});

describe("SKILL_TRUST_LEVEL enum", () => {
  it("exports all 4 trust levels", () => {
    assert.strictEqual(Object.keys(SKILL_TRUST_LEVEL).length, 4);
    assert.strictEqual(SKILL_TRUST_LEVEL.BUILTIN, "builtin");
    assert.strictEqual(SKILL_TRUST_LEVEL.VERIFIED, "verified");
    assert.strictEqual(SKILL_TRUST_LEVEL.GENERATED, "generated");
    assert.strictEqual(SKILL_TRUST_LEVEL.UNTESTED, "untested");
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Registration & retrieval
// ═══════════════════════════════════════════════════════════════

describe("EnhancedSkillRegistry — registration", () => {
  let registry;

  beforeEach(() => {
    registry = new EnhancedSkillRegistry();
  });

  it("registers and retrieves a skill", () => {
    registry.registerSkill({
      name: "my-skill",
      description: "A test skill",
      category: SKILL_CATEGORY.DATA,
      trustLevel: SKILL_TRUST_LEVEL.VERIFIED,
      execute: async () => ({ ok: true }),
    });

    const skill = registry.getSkill("my-skill");
    assert.ok(skill);
    assert.strictEqual(skill.name, "my-skill");
    assert.strictEqual(skill.category, "data");
    assert.strictEqual(skill.trustLevel, "verified");
  });

  it("throws on duplicate registration", () => {
    registry.registerSkill({
      name: "dup",
      execute: async () => {},
      category: SKILL_CATEGORY.ANALYSIS,
      trustLevel: SKILL_TRUST_LEVEL.UNTESTED,
    });

    assert.throws(() => {
      registry.registerSkill({
        name: "dup",
        execute: async () => {},
        category: SKILL_CATEGORY.ANALYSIS,
        trustLevel: SKILL_TRUST_LEVEL.UNTESTED,
      });
    }, /already registered/);
  });

  it("throws when name is missing", () => {
    assert.throws(() => {
      registry.registerSkill({ execute: async () => {} });
    }, /must have a string name/);
  });

  it("throws when execute is missing", () => {
    assert.throws(() => {
      registry.registerSkill({
        name: "no-exec",
        category: SKILL_CATEGORY.DATA,
        trustLevel: SKILL_TRUST_LEVEL.UNTESTED,
      });
    }, /must have an execute function/);
  });

  it("throws on invalid category", () => {
    assert.throws(() => {
      registry.registerSkill({
        name: "bad-cat",
        category: "nonexistent",
        trustLevel: SKILL_TRUST_LEVEL.UNTESTED,
        execute: async () => {},
      });
    }, /Invalid category/);
  });

  it("throws on invalid trust level", () => {
    assert.throws(() => {
      registry.registerSkill({
        name: "bad-trust",
        category: SKILL_CATEGORY.DATA,
        trustLevel: "banana",
        execute: async () => {},
      });
    }, /Invalid trust level/);
  });

  it("unregisters a skill", () => {
    registry.registerSkill({
      name: "removable",
      execute: async () => {},
      category: SKILL_CATEGORY.ANALYSIS,
      trustLevel: SKILL_TRUST_LEVEL.UNTESTED,
    });
    assert.ok(registry.getSkill("removable"));
    assert.strictEqual(registry.unregisterSkill("removable"), true);
    assert.strictEqual(registry.getSkill("removable"), null);
  });

  it("returns null for unknown skill", () => {
    assert.strictEqual(registry.getSkill("no-such-skill"), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Built-in skills
// ═══════════════════════════════════════════════════════════════

describe("EnhancedSkillRegistry — builtin skills", () => {
  let registry;

  beforeAll(() => {
    registry = new EnhancedSkillRegistry();
    registry.registerBuiltinSkills();
  });

  it("registers all expected builtin skills", () => {
    const expected = [
      "read-file",
      "write-file",
      "list-files",
      "search-files",
      "run-terminal-command",
      "git-status",
      "git-diff",
      "git-branch",
      "git-stage",
      "git-commit",
      "sandbox-execute",
      "llm-generate",
      "llm-analyze",
      "run-tests",
    ];

    for (const name of expected) {
      const skill = registry.getSkill(name);
      assert.ok(skill, `Expected builtin skill "${name}" to be registered`);
      assert.strictEqual(skill.trustLevel, SKILL_TRUST_LEVEL.BUILTIN);
    }
  });

  it("categorises file-ops skills correctly", () => {
    for (const name of ["read-file", "write-file", "list-files", "search-files"]) {
      assert.strictEqual(
        registry.getSkill(name).category,
        SKILL_CATEGORY.FILE_OPS,
      );
    }
  });

  it("categorises git skills correctly", () => {
    for (const name of ["git-status", "git-diff", "git-branch", "git-stage", "git-commit"]) {
      assert.strictEqual(
        registry.getSkill(name).category,
        SKILL_CATEGORY.GIT,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. findSkillsForTask
// ═══════════════════════════════════════════════════════════════

describe("EnhancedSkillRegistry — findSkillsForTask", () => {
  let registry;

  beforeAll(() => {
    registry = new EnhancedSkillRegistry();
    registry.registerBuiltinSkills();
  });

  it("finds file skills for a 'read file' query", async () => {
    const results = await registry.findSkillsForTask("read a file");
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].name, "read-file");
  });

  it("finds git skills for a 'commit changes' query", async () => {
    const results = await registry.findSkillsForTask("commit my changes");
    const names = results.map((r) => r.name);
    assert.ok(names.includes("git-commit"));
  });

  it("finds terminal skills for a 'run command' query", async () => {
    const results = await registry.findSkillsForTask("run a shell command");
    const names = results.map((r) => r.name);
    assert.ok(names.includes("run-terminal-command"));
  });

  it("returns empty array for empty input", async () => {
    const results = await registry.findSkillsForTask("");
    assert.strictEqual(results.length, 0);
  });

  it("returns empty array for null", async () => {
    const results = await registry.findSkillsForTask(null);
    assert.strictEqual(results.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. listSkills filtering
// ═══════════════════════════════════════════════════════════════

describe("EnhancedSkillRegistry — listSkills", () => {
  let registry;

  beforeAll(() => {
    registry = new EnhancedSkillRegistry();
    registry.registerBuiltinSkills();
  });

  it("lists all skills when no filter", () => {
    const all = registry.listSkills();
    assert.ok(all.length >= 14);
  });

  it("filters by category", () => {
    const gitSkills = registry.listSkills({ category: SKILL_CATEGORY.GIT });
    assert.ok(gitSkills.length >= 5);
    for (const s of gitSkills) {
      assert.strictEqual(s.category, SKILL_CATEGORY.GIT);
    }
  });

  it("filters by trust level", () => {
    const builtins = registry.listSkills({ trustLevel: SKILL_TRUST_LEVEL.BUILTIN });
    assert.ok(builtins.length >= 14);
    for (const s of builtins) {
      assert.strictEqual(s.trustLevel, SKILL_TRUST_LEVEL.BUILTIN);
    }
  });

  it("filters by category and trust level together", () => {
    registry.registerSkill({
      name: "custom-git-tool",
      category: SKILL_CATEGORY.GIT,
      trustLevel: SKILL_TRUST_LEVEL.GENERATED,
      execute: async () => ({}),
    });

    const generated = registry.listSkills({
      category: SKILL_CATEGORY.GIT,
      trustLevel: SKILL_TRUST_LEVEL.GENERATED,
    });
    assert.strictEqual(generated.length, 1);
    assert.strictEqual(generated[0].name, "custom-git-tool");
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. estimateSkillCost
// ═══════════════════════════════════════════════════════════════

describe("EnhancedSkillRegistry — estimateSkillCost", () => {
  let registry;

  beforeAll(() => {
    registry = new EnhancedSkillRegistry();
    registry.registerBuiltinSkills();
  });

  it("returns valid estimate for a known skill", () => {
    const est = registry.estimateSkillCost("read-file");
    assert.ok(est);
    assert.strictEqual(typeof est.tokenEstimate, "number");
    assert.strictEqual(typeof est.timeEstimate, "number");
    assert.strictEqual(typeof est.costUSD, "number");
    assert.ok(est.tokenEstimate >= 0);
    assert.ok(est.timeEstimate >= 0);
    assert.ok(est.costUSD >= 0);
  });

  it("returns null for unknown skill", () => {
    assert.strictEqual(registry.estimateSkillCost("nope"), null);
  });

  it("adjusts estimate based on contentLength", () => {
    const base = registry.estimateSkillCost("llm-analyze");
    const adjusted = registry.estimateSkillCost("llm-analyze", {
      contentLength: 100000,
    });
    assert.ok(adjusted.tokenEstimate >= base.tokenEstimate);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. executeSkill — real file operations
// ═══════════════════════════════════════════════════════════════

describe("EnhancedSkillRegistry — executeSkill", () => {
  let registry;

  beforeAll(() => {
    registry = new EnhancedSkillRegistry();
    registry.registerBuiltinSkills();
  });

  it("executes read-file on a temp file", async () => {
    const testFile = path.join(tmpDir, "test-read.txt");
    await fs.writeFile(testFile, "hello skill registry", "utf-8");

    const { result, durationMs } = await registry.executeSkill("read-file", {
      filePath: testFile,
    });

    assert.strictEqual(result.content, "hello skill registry");
    assert.strictEqual(typeof durationMs, "number");
    assert.ok(durationMs >= 0);
  });

  it("executes write-file to create a new file", async () => {
    const testFile = path.join(tmpDir, "sub", "test-write.txt");

    const { result } = await registry.executeSkill("write-file", {
      filePath: testFile,
      content: "written by skill",
    });

    assert.ok(result.bytesWritten > 0);
    const content = await fs.readFile(testFile, "utf-8");
    assert.strictEqual(content, "written by skill");
  });

  it("executes list-files on tmp dir", async () => {
    const { result } = await registry.executeSkill("list-files", {
      dirPath: tmpDir,
    });

    assert.ok(result.count > 0);
    assert.ok(Array.isArray(result.files));
  });

  it("throws for unknown skill", async () => {
    await assert.rejects(
      () => registry.executeSkill("does-not-exist", {}),
      /not registered/,
    );
  });

  it("records audit entry after execution", async () => {
    const testFile = path.join(tmpDir, "audit-test.txt");
    await fs.writeFile(testFile, "audit", "utf-8");

    await registry.executeSkill("read-file", { filePath: testFile });

    const log = registry.getAuditLog(5);
    assert.ok(log.length > 0);
    const last = log[log.length - 1];
    assert.strictEqual(last.skillName, "read-file");
    assert.strictEqual(last.success, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Persistence (in-memory fallback)
// ═══════════════════════════════════════════════════════════════

describe("EnhancedSkillRegistry — persistence", () => {
  it("saves and loads generated skills via persistence layer", () => {
    // Simple in-memory mock persistence
    const store = new Map();
    const persistence = {
      set: (key, value) => store.set(key, value),
      get: (key) => store.get(key),
    };

    const reg1 = new EnhancedSkillRegistry({ persistence });
    reg1.registerBuiltinSkills();
    reg1.registerSkill({
      name: "gen-skill",
      description: "A generated skill",
      category: SKILL_CATEGORY.DATA,
      trustLevel: SKILL_TRUST_LEVEL.GENERATED,
      execute: async () => ({ gen: true }),
    });

    const saved = reg1.saveToStore();
    assert.strictEqual(saved, 1); // only non-builtin

    // New registry loads from store
    const reg2 = new EnhancedSkillRegistry({ persistence });
    const loaded = reg2.loadFromStore();
    assert.strictEqual(loaded, 1);
    assert.ok(reg2.getSkill("gen-skill"));
    assert.strictEqual(reg2.getSkill("gen-skill").category, SKILL_CATEGORY.DATA);
  });

  it("returns 0 when no persistence layer", () => {
    const reg = new EnhancedSkillRegistry();
    assert.strictEqual(reg.saveToStore(), 0);
    assert.strictEqual(reg.loadFromStore(), 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Constructor graceful degradation
// ═══════════════════════════════════════════════════════════════

describe("EnhancedSkillRegistry — graceful degradation", () => {
  it("constructs without any options", () => {
    const reg = new EnhancedSkillRegistry();
    assert.ok(reg);
  });

  it("llm-generate returns error message when no LLM configured", async () => {
    const reg = new EnhancedSkillRegistry();
    reg.registerBuiltinSkills();

    const { result } = await reg.executeSkill("llm-generate", {
      prompt: "test",
    });
    assert.ok(result.error);
    assert.strictEqual(result.text, "");
  });

  it("sandbox-execute returns fallback when no sandbox configured", async () => {
    const reg = new EnhancedSkillRegistry();
    reg.registerBuiltinSkills();

    const { result } = await reg.executeSkill("sandbox-execute", {
      code: "console.log(1)",
    });
    assert.strictEqual(result.exitCode, 127);
    assert.ok(result.stderr.includes("not available"));
  });
});
