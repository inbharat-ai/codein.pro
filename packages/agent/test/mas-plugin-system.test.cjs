/**
 * PluginManager & SkillRegistry — Behavioral Tests
 *
 * Tests plugin loading, hook registration/execution, error isolation,
 * plugin enable/disable lifecycle, and skill execution.
 */
"use strict";

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

afterAll(() => {
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
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects manifest missing required fields", () => {
    const result = pm.validateManifest({});
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    expect(result.errors.some((e) => e.includes("version"))).toBe(true);
  });

  it("rejects non-object manifest", () => {
    const result = pm.validateManifest(null);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid plugin name format", () => {
    const result = pm.validateManifest({
      name: "MyPlugin",
      version: "1.0.0",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("lowercase"))).toBe(true);
  });

  it("rejects invalid semver version", () => {
    const result = pm.validateManifest({
      name: "ok-name",
      version: "not-a-version",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("semver"))).toBe(true);
  });

  it("validates tools array", () => {
    const result = pm.validateManifest({
      name: "my-plugin",
      version: "1.0.0",
      tools: [{ name: "tool1" }], // missing handler
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("handler"))).toBe(true);
  });

  it("validates hooks must be known names", () => {
    const result = pm.validateManifest({
      name: "my-plugin",
      version: "1.0.0",
      hooks: { unknownHook: "handler.js" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unknown hook"))).toBe(true);
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
    expect(result.valid).toBe(true);
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
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("test-plugin");
    expect(list[0].status).toBe("active");
    expect(list[0].toolCount).toBe(1);
  });

  it("throws on registering invalid manifest", () => {
    expect(() =>
      pm.registerPlugin({ name: "INVALID", version: "bad" })
    ).toThrow(/Invalid manifest/);
  });

  it("replaces already-registered plugin", () => {
    pm.registerPlugin({ name: "test-plugin", version: "1.0.0" });
    pm.registerPlugin({ name: "test-plugin", version: "2.0.0" });

    const list = pm.listPlugins();
    expect(list).toHaveLength(1);
    expect(list[0].version).toBe("2.0.0");
  });

  it("unregisters a plugin and removes its hooks", () => {
    pm.registerPlugin({
      name: "hooked-plugin",
      version: "1.0.0",
      hooks: { beforeTask: "before.js" },
      _dir: "/tmp",
    });

    const removed = pm.unregisterPlugin("hooked-plugin");
    expect(removed).toBe(true);
    expect(pm.listPlugins()).toHaveLength(0);
  });

  it("unregister returns false for non-existent plugin", () => {
    expect(pm.unregisterPlugin("ghost")).toBe(false);
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

    expect(result.loaded).toContain("hello-plugin");
    expect(result.errors).toHaveLength(0);
    expect(pm.listPlugins()).toHaveLength(1);
  });

  it("reports errors for plugins with invalid manifests", async () => {
    const pluginDir = createTmpDir();
    const dir = path.join(pluginDir, "bad-plugin");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "plugin.json"), "{ not valid json }");

    const pm = new PluginManager({ pluginDir });
    const result = await pm.loadPlugins();

    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe("bad-plugin");
  });

  it("handles non-existent plugin directory gracefully", async () => {
    const pm = new PluginManager({
      pluginDir: "/tmp/definitely-not-a-dir-" + Date.now(),
    });
    const result = await pm.loadPlugins();
    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("skips non-directory entries in plugin dir", async () => {
    const pluginDir = createTmpDir();
    // Create a file (not a directory) in the plugin dir
    fs.writeFileSync(path.join(pluginDir, "not-a-dir.txt"), "just a file");

    const pm = new PluginManager({ pluginDir });
    const result = await pm.loadPlugins();
    expect(result.loaded).toHaveLength(0);
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
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("lint");
    expect(tools[0]._plugin).toBe("coder-tools");
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
    expect(tools).toHaveLength(0);
  });

  it("returns tools when agentTypes is not set (available to all)", () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    pm.registerPlugin({
      name: "universal",
      version: "1.0.0",
      tools: [{ name: "tool1", handler: "t.js" }],
    });

    const tools = pm.getPluginTools("any-type");
    expect(tools).toHaveLength(1);
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
    expect(result.ran).toBe(1);
    expect(result.errors).toBe(0);
  });

  it("returns {ran:0, errors:0} for hooks with no handlers", async () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    const result = await pm.runHook("afterTask", { taskId: "t1" });
    expect(result.ran).toBe(0);
    expect(result.errors).toBe(0);
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
    expect(result.ran + result.errors).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.ran).toBe(1);
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
    expect(result.ran).toBe(1);
    expect(result.errors).toBe(0);
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

    expect(result).toEqual({ sum: 10 });
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it("throws for non-registered plugin", async () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    await expect(
      pm.executePluginTool("ghost", "tool", {}, {})
    ).rejects.toThrow(/not registered/);
  });

  it("throws for non-existent tool in plugin", async () => {
    const pm = new PluginManager({ pluginDir: "/tmp/nonexistent" });
    pm.registerPlugin({
      name: "empty-plugin",
      version: "1.0.0",
      tools: [],
    });

    await expect(
      pm.executePluginTool("empty-plugin", "missing-tool", {}, {})
    ).rejects.toThrow(/not found/);
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
    expect(skills.length).toBeGreaterThan(0);
    const names = skills.map((s) => s.name);
    expect(names).toContain("generate-commit-message");
    expect(names).toContain("generate-pr-description");
    expect(names).toContain("explain-code");
    expect(names).toContain("suggest-tests");
    expect(names).toContain("review-diff");
  });

  it("filters skills by category", () => {
    const gitSkills = registry.listSkills("git");
    expect(gitSkills.length).toBeGreaterThan(0);
    gitSkills.forEach((s) => expect(s.category).toBe("git"));

    const docsSkills = registry.listSkills("docs");
    expect(docsSkills.length).toBeGreaterThan(0);
  });

  it("executes generate-commit-message skill", async () => {
    const result = await registry.executeSkill("generate-commit-message", {
      stagedDiff:
        "diff --git a/src/index.js b/src/index.js\n+console.log('hello');\n-console.log('goodbye');",
    });

    expect(result).toBeDefined();
    expect(result.suggestion).toBeDefined();
    expect(typeof result.suggestion).toBe("string");
    expect(result.stats).toBeDefined();
    expect(result.stats.additions).toBeGreaterThanOrEqual(0);
  });

  it("executes explain-code skill", async () => {
    const result = await registry.executeSkill("explain-code", {
      code: 'function add(a, b) { return a + b; }\nclass Foo { constructor() {} }',
      language: "javascript",
    });

    expect(result.lineCount).toBe(2);
    expect(result.language).toBe("javascript");
    expect(result.hasFunctions).toBe(true);
    expect(result.hasClasses).toBe(true);
  });

  it("throws when skill requires missing context keys", async () => {
    await expect(
      registry.executeSkill("generate-commit-message", {})
    ).rejects.toThrow(/requires context keys.*stagedDiff/);
  });

  it("throws for non-existent skill", async () => {
    await expect(
      registry.executeSkill("nonexistent-skill", {})
    ).rejects.toThrow(/not registered/);
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
    expect(result.output).toBe("HELLO");
  });

  it("throws when registering skill without execute function", () => {
    expect(() =>
      registry.registerSkill({ name: "bad-skill", description: "no execute" })
    ).toThrow(/execute function/);
  });
});
