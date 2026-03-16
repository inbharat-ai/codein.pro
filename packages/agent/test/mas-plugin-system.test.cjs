/**
 * PluginManager & SkillRegistry — Behavioral Tests
 *
 * Tests plugin loading, hook registration/execution, error isolation,
 * plugin enable/disable lifecycle, and skill execution.
 */
"use strict";
const { describe, it, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const looseAssert = require("node:assert");

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { PluginManager, SkillRegistry } = require("../src/mas/plugin-system");

// ─── Helpers ─────────────────────────────────────────────────

let tmpDirs = [];

function createTmpDir(prefix = "codin-plugin-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function createPlugin(pluginDir, name, manifest, handlers = {}) {
  const dir = path.join(pluginDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "plugin.json"),
    JSON.stringify(manifest, null, 2)
  );
  for (const [file, code] of Object.entries(handlers)) {
    fs.writeFileSync(path.join(dir, file), code);
  }
  return dir;
}

after(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

// ─── Manifest Validation ─────────────────────────────────────

describe("PluginManager — Manifest Validation", () => {
  let pm;

  beforeEach(() => {
    pm = new PluginManager({ pluginDir: "/tmp/nonexistent-dir" });
  });

  it("validates a correct manifest", () => {
    const result = pm.validateManifest({
      name: "my-plugin",
      version: "1.0.0",
      tools: [{ name: "greet", handler: "greet.js" }],
    });
    assert.ok(result.valid);
    assert.equal(result.errors.length, 0);
  });

  it("rejects manifest missing required fields", () => {
    const result = pm.validateManifest({});
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("name")));
    assert.ok(result.errors.some((e) => e.includes("version")));
  });

  it("rejects non-object manifest", () => {
    const result = pm.validateManifest(null);
    assert.ok(!result.valid);
  });

  it("rejects invalid plugin name format", () => {
    const result = pm.validateManifest({
      name: "MyPlugin",
      version: "1.0.0",
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("lowercase")));
  });

  it("rejects invalid semver version", () => {
    const result = pm.validateManifest({
      name: "ok-name",
      version: "not-a-version",
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("semver")));
  });

  it("validates tools array", () => {
    const result = pm.validateManifest({
      name: "my-plugin",
      version: "1.0.0",
      tools: [{ name: "tool1" }], // missing handler
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("handler")));
  });

  it("validates hooks must be known names", () => {
    const result = pm.validateManifest({
      name: "my-plugin",
      version: "1.0.0",
      hooks: { unknownHook: "handler.js" },
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes("Unknown hook")));
  });

  it("accepts valid hooks: beforeTask, afterTask, onError", () => {
    const result = pm.validateManifest({
      name: "my-plugin",
      version: "1.0.0",
      hooks: {
        beforeTask: "before.js",
        afterTask: "after.js",
        onError: "error.js",
      },
    });
    assert.ok(result.valid);
  });
});

// ─── Plugin Registration ─────────────────────────────────────

describe("PluginManager — Registration", () => {
  let pm;

  beforeEach(() => {
    pm = new PluginManager({ pluginDir: "/tmp/nonexistent-dir" });
  });

  it("registers a valid plugin", () => {
    pm.registerPlugin({
      name: "test-plugin",
      version: "1.0.0",
      tools: [{ name: "tool1", handler: "tool1.js" }],
    });

    const list = pm.listPlugins();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "test-plugin");
    assert.equal(list[0].status, "active");
    assert.equal(list[0].toolCount, 1);
  });

  it("throws on registering invalid manifest", () => {
    assert.throws(
      () => pm.registerPlugin({ name: "INVALID", version: "bad" }),
      /Invalid manifest/
    );
  });

  it("replaces already-registered plugin", () => {
    pm.registerPlugin({ name: "test-plugin", version: "1.0.0" });
    pm.registerPlugin({ name: "test-plugin", version: "2.0.0" });

    const list = pm.listPlugins();
    assert.equal(list.length, 1);
    assert.equal(list[0].version, "2.0.0");
  });

  it("unregisters a plugin and removes its hooks", () => {
    pm.registerPlugin({
      name: "hooked-plugin",
      version: "1.0.0",
      hooks: { beforeTask: "before.js" },
      _dir: "/tmp",
    });

    const removed = pm.unregisterPlugin("hooked-plugin");
    assert.ok(removed);
    assert.equal(pm.listPlugins().length, 0);
  });

  it("unregister returns false for non-existent plugin", () => {
    assert.ok(!pm.unregisterPlugin("ghost"));
  });
});

// ─── Plugin Loading from Directory ───────────────────────────

describe("PluginManager — Loading from Directory", () => {
  it("loads valid plugins from a directory", async () => {
    const pluginDir = createTmpDir();
    createPlugin(pluginDir, "hello-plugin", {
      name: "hello-plugin",
      version: "1.0.0",
      description: "A test plugin",
      tools: [{ name: "hello", handler: "hello.js", description: "Say hi" }],
    }, {
      "hello.js": 'async function handler(args, ctx) { __result = "hello " + (args.name || "world"); }',
    });

    const pm = new PluginManager({ pluginDir });
    const result = await pm.loadPlugins();

    assert.ok(result.loaded.includes("hello-plugin"));
    assert.equal(result.errors.length, 0);
    assert.equal(pm.listPlugins().length, 1);
  });

  it("reports errors for plugins with invalid manifests", async () => {
    const pluginDir = createTmpDir();
    const dir = path.join(pluginDir, "bad-plugin");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "plugin.json"), "{ not valid json }");

    const pm = new PluginManager({ pluginDir });
    const result = await pm.loadPlugins();

    assert.equal(result.loaded.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].name, "bad-plugin");
  });

  it("handles non-existent plugin directory gracefully", async () => {
    const pm = new PluginManager({
      pluginDir: "/tmp/definitely-not-a-dir-" + Date.now(),
    });
    const result = await pm.loadPlugins();
    assert.equal(result.loaded.length, 0);
    assert.equal(result.errors.length, 0);
  });

  it("skips non-directory entries in plugin dir", async () => {
    const pluginDir = createTmpDir();
    // Create a file (not a directory) in the plugin dir
    fs.writeFileSync(path.join(pluginDir, "not-a-dir.txt"), "just a file");

    const pm = new PluginManager({ pluginDir });
    const result = await pm.loadPlugins();
    assert.equal(result.loaded.length, 0);
  });
});

// ─── Plugin Tool Retrieval ───────────────────────────────────

describe("PluginManager — getPluginTools", () => {
  it("returns tools for matching agent type", () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    pm.registerPlugin({
      name: "coder-tools",
      version: "1.0.0",
      agentTypes: ["coder"],
      tools: [
        { name: "lint", handler: "lint.js", description: "Run linter" },
      ],
    });

    const tools = pm.getPluginTools("coder");
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "lint");
    assert.equal(tools[0]._plugin, "coder-tools");
  });

  it("excludes tools from plugins restricted to other agent types", () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    pm.registerPlugin({
      name: "coder-only",
      version: "1.0.0",
      agentTypes: ["coder"],
      tools: [{ name: "tool1", handler: "t.js" }],
    });

    const tools = pm.getPluginTools("tester");
    assert.equal(tools.length, 0);
  });

  it("returns tools when agentTypes is not set (available to all)", () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    pm.registerPlugin({
      name: "universal",
      version: "1.0.0",
      tools: [{ name: "tool1", handler: "t.js" }],
    });

    const tools = pm.getPluginTools("any-type");
    assert.equal(tools.length, 1);
  });
});

// ─── Hook Execution ──────────────────────────────────────────

describe("PluginManager — Hook Execution", () => {
  it("executes hooks from loaded plugins", async () => {
    const pluginDir = createTmpDir();
    createPlugin(
      pluginDir,
      "hook-plugin",
      {
        name: "hook-plugin",
        version: "1.0.0",
        hooks: { beforeTask: "before.js" },
      },
      {
        "before.js":
          'async function hook(data, ctx) { console.log("beforeTask fired with: " + data.taskId); }',
      }
    );

    const pm = new PluginManager({ pluginDir });
    await pm.loadPlugins();

    const result = await pm.runHook("beforeTask", { taskId: "t1" });
    assert.equal(result.ran, 1);
    assert.equal(result.errors, 0);
  });

  it("returns {ran:0, errors:0} for hooks with no handlers", async () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    const result = await pm.runHook("afterTask", { taskId: "t1" });
    assert.equal(result.ran, 0);
    assert.equal(result.errors, 0);
  });

  it("isolates hook errors — one failing hook does not crash others", async () => {
    const pluginDir = createTmpDir();

    // Plugin 1: will fail
    createPlugin(
      pluginDir,
      "failing-hook",
      {
        name: "failing-hook",
        version: "1.0.0",
        hooks: { beforeTask: "before.js" },
      },
      {
        "before.js": 'async function hook(data, ctx) { throw new Error("hook crashed"); }',
      }
    );

    // Plugin 2: will succeed
    createPlugin(
      pluginDir,
      "good-hook",
      {
        name: "good-hook",
        version: "1.0.0",
        hooks: { beforeTask: "before.js" },
      },
      {
        "before.js": 'async function hook(data, ctx) { console.log("ok"); }',
      }
    );

    const pm = new PluginManager({ pluginDir });
    await pm.loadPlugins();

    const result = await pm.runHook("beforeTask", { taskId: "t1" });
    // Both attempted, one error, one success
    assert.equal(result.ran + result.errors, 2);
    assert.equal(result.errors, 1);
    assert.equal(result.ran, 1);
  });

  it("hooks receive the correct data payload", async () => {
    const pluginDir = createTmpDir();
    createPlugin(
      pluginDir,
      "data-hook",
      {
        name: "data-hook",
        version: "1.0.0",
        hooks: { afterTask: "after.js" },
      },
      {
        // The hook writes to console which we can verify doesn't throw
        "after.js":
          'async function hook(data, ctx) { if (!data.taskId) throw new Error("missing taskId"); console.log("got " + data.taskId); }',
      }
    );

    const pm = new PluginManager({ pluginDir });
    await pm.loadPlugins();

    const result = await pm.runHook("afterTask", {
      taskId: "task_123",
      status: "completed",
    });
    assert.equal(result.ran, 1);
    assert.equal(result.errors, 0);
  });
});

// ─── Plugin Tool Execution ───────────────────────────────────

describe("PluginManager — Plugin Tool Execution", () => {
  it("executes a plugin tool in sandbox and returns result", async () => {
    const pluginDir = createTmpDir();
    createPlugin(
      pluginDir,
      "calc-plugin",
      {
        name: "calc-plugin",
        version: "1.0.0",
        tools: [{ name: "add", handler: "add.js", description: "Add numbers" }],
      },
      {
        "add.js":
          'async function handler(args, ctx) { return { sum: (args.a || 0) + (args.b || 0) }; }',
      }
    );

    const pm = new PluginManager({ pluginDir });
    await pm.loadPlugins();

    const { result, duration } = await pm.executePluginTool(
      "calc-plugin",
      "add",
      { a: 3, b: 7 },
      {}
    );

    looseAssert.deepEqual(result, { sum: 10 });
    assert.ok(duration >= 0);
  });

  it("throws for non-registered plugin", async () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    await assert.rejects(
      () => pm.executePluginTool("ghost", "tool", {}, {}),
      /not registered/
    );
  });

  it("throws for non-existent tool in plugin", async () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    pm.registerPlugin({
      name: "empty-plugin",
      version: "1.0.0",
      tools: [],
    });

    await assert.rejects(
      () => pm.executePluginTool("empty-plugin", "missing-tool", {}, {}),
      /not found/
    );
  });
});

// ─── SkillRegistry ───────────────────────────────────────────

describe("SkillRegistry — Built-in Skills", () => {
  let registry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it("has built-in skills pre-registered", () => {
    const skills = registry.listSkills();
    assert.ok(skills.length > 0);
    const names = skills.map((s) => s.name);
    assert.ok(names.includes("generate-commit-message"));
    assert.ok(names.includes("generate-pr-description"));
    assert.ok(names.includes("explain-code"));
    assert.ok(names.includes("suggest-tests"));
    assert.ok(names.includes("review-diff"));
  });

  it("filters skills by category", () => {
    const gitSkills = registry.listSkills("git");
    assert.ok(gitSkills.length > 0);
    gitSkills.forEach((s) => assert.equal(s.category, "git"));

    const docsSkills = registry.listSkills("docs");
    assert.ok(docsSkills.length > 0);
  });

  it("executes generate-commit-message skill", async () => {
    const result = await registry.executeSkill("generate-commit-message", {
      stagedDiff:
        "diff --git a/src/index.js b/src/index.js\n+console.log('hello');\n-console.log('goodbye');",
    });

    assert.ok(result);
    assert.ok(result.suggestion);
    assert.equal(typeof result.suggestion, "string");
    assert.ok(result.stats);
    assert.ok(result.stats.additions >= 0);
  });

  it("executes explain-code skill", async () => {
    const result = await registry.executeSkill("explain-code", {
      code: 'function add(a, b) { return a + b; }\nclass Foo { constructor() {} }',
      language: "javascript",
    });

    assert.equal(result.lineCount, 2);
    assert.equal(result.language, "javascript");
    assert.ok(result.hasFunctions);
    assert.ok(result.hasClasses);
  });

  it("throws when skill requires missing context keys", async () => {
    await assert.rejects(
      () => registry.executeSkill("generate-commit-message", {}),
      /requires context keys.*stagedDiff/
    );
  });

  it("throws for non-existent skill", async () => {
    await assert.rejects(
      () => registry.executeSkill("nonexistent-skill", {}),
      /not registered/
    );
  });

  it("registers and executes custom skill", async () => {
    registry.registerSkill({
      name: "custom-skill",
      description: "A custom test skill",
      category: "testing",
      requiredContext: ["input"],
      execute: async (ctx) => ({ output: ctx.input.toUpperCase() }),
    });

    const result = await registry.executeSkill("custom-skill", {
      input: "hello",
    });
    assert.equal(result.output, "HELLO");
  });

  it("throws when registering skill without execute function", () => {
    assert.throws(
      () => registry.registerSkill({ name: "bad-skill", description: "no execute" }),
      /execute function/
    );
  });
});
