/**
 * CodeIn MAS — Plugin & Skill System
 *
 * Lets users add custom tools, skills, and MCP servers to extend agent
 * capabilities.  Plugins live under ~/.codein/plugins/ (configurable) and
 * are described by a plugin.json manifest.  Built-in skills provide
 * common higher-order operations (PR descriptions, changelogs, etc.).
 *
 * Security: plugin handlers run inside a restricted sandbox — no network,
 * no child_process, no writes outside the workspace.
 */
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { createLogger } = require("./logger");
const { DocGenerator, _safeParseLLMJson } = require("./doc-generator");

const log = createLogger("PluginSystem");

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Default directory where user plugins are stored. */
const DEFAULT_PLUGIN_DIR = path.join(os.homedir(), ".codein", "plugins");

/** Maximum time (ms) a plugin tool handler may run before being killed. */
const HANDLER_TIMEOUT_MS = 30_000;

/** Fields that MUST exist in every plugin manifest. */
const REQUIRED_MANIFEST_FIELDS = ["name", "version"];

/** Allowed hook names. */
const VALID_HOOKS = Object.freeze(["beforeTask", "afterTask", "onError"]);

// ═══════════════════════════════════════════════════════════════
// 1. PLUGIN MANAGER
// ═══════════════════════════════════════════════════════════════

/**
 * Manages the full lifecycle of user-supplied plugins: discovery, validation,
 * registration, tool execution, and hook dispatch.
 */
class PluginManager {
  /**
   * @param {object}  opts
   * @param {string}  [opts.pluginDir]    Directory to scan for plugins.
   * @param {object}  [opts.persistence]  Optional persistence layer reference.
   */
  constructor({ pluginDir, persistence } = {}) {
    /** @type {string} */
    this._pluginDir = pluginDir || DEFAULT_PLUGIN_DIR;

    /** @type {object|null} */
    this._persistence = persistence || null;

    /**
     * Registered plugins keyed by name.
     * @type {Map<string, {manifest: object, status: string, registeredAt: number}>}
     */
    this._plugins = new Map();

    /**
     * Hook handlers keyed by hook name.
     * Each entry is an array of `{ pluginName, handlerPath }`.
     * @type {Map<string, Array<{pluginName: string, handlerPath: string}>>}
     */
    this._hooks = new Map();
    for (const h of VALID_HOOKS) {
      this._hooks.set(h, []);
    }

    log.info("PluginManager created", { pluginDir: this._pluginDir });
  }

  // ── discovery ──────────────────────────────────────────────

  /**
   * Scan `pluginDir` for plugin.json manifests, validate each, and register.
   *
   * @returns {Promise<{loaded: string[], errors: {name: string, error: string}[]}>}
   */
  async loadPlugins() {
    /** @type {string[]} */
    const loaded = [];
    /** @type {{name: string, error: string}[]} */
    const errors = [];

    let entries;
    try {
      entries = await fs.readdir(this._pluginDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") {
        log.info("Plugin directory does not exist, skipping", {
          dir: this._pluginDir,
        });
        return { loaded, errors };
      }
      throw err;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifestPath = path.join(
        this._pluginDir,
        entry.name,
        "plugin.json",
      );
      try {
        const raw = await fs.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(raw);

        // Attach the resolved directory so handlers can be found later.
        manifest._dir = path.join(this._pluginDir, entry.name);

        const validation = this.validateManifest(manifest);
        if (!validation.valid) {
          errors.push({
            name: entry.name,
            error: validation.errors.join("; "),
          });
          continue;
        }

        this.registerPlugin(manifest);
        loaded.push(manifest.name);
      } catch (err) {
        errors.push({ name: entry.name, error: err.message });
      }
    }

    log.info("Plugin scan complete", {
      loaded: loaded.length,
      errors: errors.length,
    });
    return { loaded, errors };
  }

  // ── registration ───────────────────────────────────────────

  /**
   * Register a plugin from its manifest object.
   *
   * @param {object} manifest  Parsed plugin.json content.
   * @throws {Error} If validation fails.
   */
  registerPlugin(manifest) {
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(
        `Invalid manifest for "${manifest.name || "unknown"}": ${validation.errors.join("; ")}`,
      );
    }

    if (this._plugins.has(manifest.name)) {
      log.warn("Replacing already-registered plugin", { name: manifest.name });
      this.unregisterPlugin(manifest.name);
    }

    this._plugins.set(manifest.name, {
      manifest,
      status: "active",
      registeredAt: Date.now(),
    });

    // Register hooks.
    if (manifest.hooks && typeof manifest.hooks === "object") {
      const pluginDir = manifest._dir || this._pluginDir;
      for (const [hookName, handlerRelPath] of Object.entries(manifest.hooks)) {
        if (!VALID_HOOKS.includes(hookName)) {
          log.warn("Ignoring unknown hook", {
            plugin: manifest.name,
            hook: hookName,
          });
          continue;
        }
        const hookList = this._hooks.get(hookName);
        hookList.push({
          pluginName: manifest.name,
          handlerPath: path.resolve(pluginDir, handlerRelPath),
        });
      }
    }

    log.info("Plugin registered", {
      name: manifest.name,
      version: manifest.version,
    });
  }

  /**
   * Remove a plugin and its hooks.
   *
   * @param {string} name  Plugin name.
   * @returns {boolean} `true` if plugin existed and was removed.
   */
  unregisterPlugin(name) {
    if (!this._plugins.has(name)) return false;

    this._plugins.delete(name);

    // Remove all hooks belonging to this plugin.
    for (const [, hookList] of this._hooks) {
      for (let i = hookList.length - 1; i >= 0; i--) {
        if (hookList[i].pluginName === name) {
          hookList.splice(i, 1);
        }
      }
    }

    log.info("Plugin unregistered", { name });
    return true;
  }

  // ── querying ───────────────────────────────────────────────

  /**
   * Return tools available for a given agent type, formatted as tool registry
   * entries compatible with `callLLMWithTools`.
   *
   * @param {string} agentType  e.g. "coder", "tester".
   * @returns {Array<{name: string, description: string, parameters: object, _plugin: string}>}
   */
  getPluginTools(agentType) {
    /** @type {Array<{name: string, description: string, parameters: object, _plugin: string}>} */
    const tools = [];

    for (const [pluginName, entry] of this._plugins) {
      if (entry.status !== "active") continue;

      const manifest = entry.manifest;
      if (!Array.isArray(manifest.tools)) continue;

      // If the manifest restricts to specific agent types, enforce it.
      if (
        Array.isArray(manifest.agentTypes) &&
        manifest.agentTypes.length > 0
      ) {
        if (!manifest.agentTypes.includes(agentType)) continue;
      }

      for (const tool of manifest.tools) {
        tools.push({
          name: tool.name,
          description: tool.description || "",
          parameters: tool.parameters || { type: "object", properties: {} },
          _plugin: pluginName,
        });
      }
    }

    return tools;
  }

  /**
   * List all registered plugins with metadata and status.
   *
   * @returns {Array<{name: string, version: string, description: string, status: string, registeredAt: number, toolCount: number}>}
   */
  listPlugins() {
    const result = [];
    for (const [, entry] of this._plugins) {
      const m = entry.manifest;
      result.push({
        name: m.name,
        version: m.version,
        description: m.description || "",
        status: entry.status,
        registeredAt: entry.registeredAt,
        toolCount: Array.isArray(m.tools) ? m.tools.length : 0,
      });
    }
    return result;
  }

  // ── execution ──────────────────────────────────────────────

  /**
   * Execute a specific tool from a named plugin.
   *
   * The handler runs inside a sandboxed VM context with a 30-second timeout.
   *
   * @param {string} pluginName  Plugin that owns the tool.
   * @param {string} toolName    Tool name within the plugin.
   * @param {object} args        Arguments to pass to the handler.
   * @param {object} context     Execution context (workspace root, agent type, etc.).
   * @returns {Promise<{result: *, duration: number}>}
   */
  async executePluginTool(pluginName, toolName, args, context) {
    const entry = this._plugins.get(pluginName);
    if (!entry) throw new Error(`Plugin "${pluginName}" is not registered`);
    if (entry.status !== "active")
      throw new Error(`Plugin "${pluginName}" is not active`);

    const manifest = entry.manifest;
    const toolDef = (manifest.tools || []).find((t) => t.name === toolName);
    if (!toolDef) {
      throw new Error(`Tool "${toolName}" not found in plugin "${pluginName}"`);
    }

    const pluginDir = manifest._dir || this._pluginDir;
    const handlerPath = path.resolve(pluginDir, toolDef.handler);

    const start = Date.now();

    let handlerCode;
    try {
      handlerCode = await fs.readFile(handlerPath, "utf-8");
    } catch (err) {
      throw new Error(
        `Failed to load handler "${handlerPath}": ${err.message}`,
      );
    }

    const sandbox = createPluginSandbox(pluginDir, context);
    sandbox.__args = args;

    try {
      const script = new vm.Script(
        `__promise = (async () => { ${handlerCode}\nif (typeof handler === "function") { __result = await handler(__args, __ctx); } })();`,
        { filename: handlerPath, timeout: HANDLER_TIMEOUT_MS },
      );

      const vmContext = vm.createContext(sandbox);
      script.runInContext(vmContext);

      // Enforce async timeout — vm.Script timeout only covers sync compilation
      const asyncTimeout = new Promise((_, reject) => {
        const t = setTimeout(
          () =>
            reject(
              new Error(
                `Plugin tool "${toolName}" timed out after ${HANDLER_TIMEOUT_MS}ms`,
              ),
            ),
          HANDLER_TIMEOUT_MS,
        );
        if (t.unref) t.unref();
        sandbox.__timeoutHandle = t;
      });

      await Promise.race([sandbox.__promise, asyncTimeout]);
      if (sandbox.__timeoutHandle) clearTimeout(sandbox.__timeoutHandle);

      const duration = Date.now() - start;
      log.info("Plugin tool executed", { pluginName, toolName, duration });
      return { result: sandbox.__result, duration };
    } catch (err) {
      if (sandbox.__timeoutHandle) clearTimeout(sandbox.__timeoutHandle);
      const duration = Date.now() - start;
      log.error("Plugin tool execution failed", {
        pluginName,
        toolName,
        duration,
        error: err.message,
      });
      throw err;
    }
  }

  // ── hooks ──────────────────────────────────────────────────

  /**
   * Run all registered hooks of a given type.  Non-fatal — individual hook
   * failures are logged but never propagate.
   *
   * @param {string} hookName  One of VALID_HOOKS.
   * @param {object} data      Payload passed to each hook handler.
   * @returns {Promise<{ran: number, errors: number}>}
   */
  async runHook(hookName, data) {
    const hookList = this._hooks.get(hookName);
    if (!hookList || hookList.length === 0) return { ran: 0, errors: 0 };

    let ran = 0;
    let errors = 0;

    for (const { pluginName, handlerPath } of hookList) {
      try {
        const handlerCode = await fs.readFile(handlerPath, "utf-8");
        const sandbox = createPluginSandbox(path.dirname(handlerPath), {
          hookName,
        });
        sandbox.__hookData = data;

        const script = new vm.Script(
          `__promise = (async () => { ${handlerCode}\nif (typeof hook === "function") { await hook(__hookData, __ctx); } })();`,
          { filename: handlerPath, timeout: HANDLER_TIMEOUT_MS },
        );
        const vmContext = vm.createContext(sandbox);
        script.runInContext(vmContext);

        // Enforce async timeout for hooks
        const hookTimeout = new Promise((_, reject) => {
          const t = setTimeout(
            () =>
              reject(
                new Error(
                  `Hook "${hookName}" timed out after ${HANDLER_TIMEOUT_MS}ms`,
                ),
              ),
            HANDLER_TIMEOUT_MS,
          );
          if (t.unref) t.unref();
          sandbox.__hookTimeoutHandle = t;
        });
        await Promise.race([sandbox.__promise, hookTimeout]);
        if (sandbox.__hookTimeoutHandle)
          clearTimeout(sandbox.__hookTimeoutHandle);
        ran++;
      } catch (err) {
        errors++;
        log.warn("Hook execution failed (non-fatal)", {
          hookName,
          plugin: pluginName,
          error: err.message,
        });
      }
    }

    return { ran, errors };
  }

  // ── validation ─────────────────────────────────────────────

  /**
   * Validate a plugin manifest object.
   *
   * @param {object} manifest
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateManifest(manifest) {
    /** @type {string[]} */
    const errors = [];

    if (!manifest || typeof manifest !== "object") {
      return { valid: false, errors: ["Manifest must be a non-null object"] };
    }

    // Required top-level fields.
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      if (!manifest[field] || typeof manifest[field] !== "string") {
        errors.push(`Missing or invalid required field: "${field}"`);
      }
    }

    // Name format: lowercase, alphanumeric, hyphens.
    if (manifest.name && !/^[a-z0-9][a-z0-9-]*$/.test(manifest.name)) {
      errors.push(
        'Plugin name must be lowercase alphanumeric with hyphens (e.g. "my-plugin")',
      );
    }

    // Version semver-ish check.
    if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
      errors.push("Version must follow semver (e.g. 1.0.0)");
    }

    // Tools validation.
    if (manifest.tools !== undefined) {
      if (!Array.isArray(manifest.tools)) {
        errors.push('"tools" must be an array');
      } else {
        for (let i = 0; i < manifest.tools.length; i++) {
          const t = manifest.tools[i];
          if (!t.name || typeof t.name !== "string") {
            errors.push(`tools[${i}]: missing "name"`);
          }
          if (!t.handler || typeof t.handler !== "string") {
            errors.push(`tools[${i}]: missing "handler" path`);
          }
          if (t.parameters && typeof t.parameters !== "object") {
            errors.push(`tools[${i}]: "parameters" must be an object`);
          }
        }
      }
    }

    // Hooks validation.
    if (manifest.hooks !== undefined) {
      if (typeof manifest.hooks !== "object" || Array.isArray(manifest.hooks)) {
        errors.push('"hooks" must be a plain object');
      } else {
        for (const key of Object.keys(manifest.hooks)) {
          if (!VALID_HOOKS.includes(key)) {
            errors.push(
              `Unknown hook: "${key}". Valid hooks: ${VALID_HOOKS.join(", ")}`,
            );
          }
          if (typeof manifest.hooks[key] !== "string") {
            errors.push(`hooks.${key}: value must be a string (handler path)`);
          }
        }
      }
    }

    // agentTypes validation.
    if (manifest.agentTypes !== undefined) {
      if (!Array.isArray(manifest.agentTypes)) {
        errors.push('"agentTypes" must be an array of strings');
      } else {
        for (const at of manifest.agentTypes) {
          if (typeof at !== "string") {
            errors.push(
              `agentTypes: each entry must be a string, got ${typeof at}`,
            );
          }
        }
      }
    }

    // permissions validation.
    if (manifest.permissions !== undefined) {
      if (!Array.isArray(manifest.permissions)) {
        errors.push('"permissions" must be an array of strings');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. SKILL REGISTRY
// ═══════════════════════════════════════════════════════════════

const skillLog = createLogger("SkillRegistry");

/**
 * Registry for built-in higher-order skills that extend agent capabilities.
 * Skills differ from plugin tools in that they are first-class, trusted code
 * that runs in the main process.
 */

// ── Commit message rule-based helpers ────────────────────────────────────────
// Type + scope analysis is delegated to DocGenerator.analyzeCommitType().
// This helper only builds the human-readable subject line.

function _buildSubjectFallback(type, files, stats) {
  if (!files.length) {
    return stats.additions > 0 ? `add ${stats.additions} lines` : "update code";
  }
  const name = files[0]
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "");
  if (type === "feat") return `add ${name}`;
  if (type === "fix") return `fix issue in ${name}`;
  if (type === "docs") return `update ${name} docs`;
  if (type === "test") return `add tests for ${name}`;
  if (type === "refactor") return `refactor ${name}`;
  if (files.length === 1) return `update ${name}`;
  return `update ${files.length} files`;
}

// ─────────────────────────────────────────────────────────────────────────────

class SkillRegistry {
  constructor({ runLLM } = {}) {
    /**
     * Registered skills keyed by name.
     * @type {Map<string, object>}
     */
    this._skills = new Map();

    /**
     * Optional LLM runner injected from SwarmManager.
     * Signature: (prompt: string, opts?: object) => Promise<string|{text:string}>
     * @type {Function|null}
     */
    this._runLLM = runLLM || null;

    // Pre-register built-in skills.
    this._registerBuiltins();
  }

  // ── registration ───────────────────────────────────────────

  /**
   * Register a skill.
   *
   * @param {object}   skill
   * @param {string}   skill.name            Unique skill identifier.
   * @param {string}   skill.description     Human-readable description.
   * @param {string}   skill.category        One of: git, docs, testing, devops, i18n.
   * @param {Function} skill.execute         Async function `(context) => result`.
   * @param {string[]} skill.requiredContext  Context keys the skill needs.
   */
  registerSkill(skill) {
    if (!skill || !skill.name || typeof skill.execute !== "function") {
      throw new Error("Skill must have a name and an execute function");
    }
    this._skills.set(skill.name, {
      name: skill.name,
      description: skill.description || "",
      category: skill.category || "general",
      execute: skill.execute,
      requiredContext: skill.requiredContext || [],
    });
    skillLog.info("Skill registered", {
      name: skill.name,
      category: skill.category,
    });
  }

  /**
   * Retrieve a skill by name.
   *
   * @param {string} name
   * @returns {object|undefined}
   */
  getSkill(name) {
    return this._skills.get(name) || undefined;
  }

  /**
   * List skills, optionally filtered by category.
   *
   * @param {string} [category]  If provided, only return skills in this category.
   * @returns {Array<{name: string, description: string, category: string, requiredContext: string[]}>}
   */
  listSkills(category) {
    const result = [];
    for (const [, skill] of this._skills) {
      if (category && skill.category !== category) continue;
      result.push({
        name: skill.name,
        description: skill.description,
        category: skill.category,
        requiredContext: skill.requiredContext,
      });
    }
    return result;
  }

  /**
   * Execute a named skill with the given context.
   *
   * @param {string} name     Skill name.
   * @param {object} context  Context map (must include keys listed in requiredContext).
   * @returns {Promise<*>}    Whatever the skill's execute function returns.
   */
  async executeSkill(name, context) {
    const skill = this._skills.get(name);
    if (!skill) throw new Error(`Skill "${name}" is not registered`);

    // Verify required context keys.
    const missing = skill.requiredContext.filter(
      (k) => !(k in (context || {})),
    );
    if (missing.length > 0) {
      throw new Error(
        `Skill "${name}" requires context keys: ${missing.join(", ")}`,
      );
    }

    const start = Date.now();
    try {
      const result = await skill.execute(context);
      skillLog.info("Skill executed", { name, duration: Date.now() - start });
      return result;
    } catch (err) {
      skillLog.error("Skill execution failed", { name, error: err.message });
      throw err;
    }
  }

  // ── built-in skills ────────────────────────────────────────

  /**
   * Pre-register the standard set of built-in skills.
   * @private
   */
  _registerBuiltins() {
    this.registerSkill({
      name: "generate-commit-message",
      description:
        "Generate a conventional commit message from staged diff (LLM-enhanced)",
      category: "git",
      requiredContext: ["stagedDiff"],
      execute: async (ctx) => {
        const diff = ctx.stagedDiff || "";
        const diffLines = diff.split("\n");
        const filesChanged = diffLines
          .filter((l) => l.startsWith("diff --git"))
          .map((l) => l.split(" b/")[1])
          .filter(Boolean);
        const additions = diffLines.filter(
          (l) => l.startsWith("+") && !l.startsWith("+++"),
        ).length;
        const deletions = diffLines.filter(
          (l) => l.startsWith("-") && !l.startsWith("---"),
        ).length;
        const stats = { additions, deletions };

        // ── LLM-enhanced path ──────────────────────────────────────
        const runLLM = ctx._runLLM || this._runLLM;
        if (runLLM && (additions + deletions > 5 || filesChanged.length > 1)) {
          try {
            const truncatedDiff =
              diff.length > 6000
                ? diff.slice(0, 6000) + "\n... (truncated)"
                : diff;
            const prompt = [
              "Generate a conventional commit message for this git diff.",
              "Return ONLY a valid JSON object with these exact keys:",
              '  { "type": string, "scope": string|null, "subject": string, "breaking": boolean }',
              "Valid types: feat, fix, docs, style, refactor, perf, test, chore, build, ci",
              "subject must be ≤72 chars, imperative mood, no period at end.",
              "scope should be a short module/component name or null.",
              "---",
              truncatedDiff,
            ].join("\n");

            const raw = await runLLM(prompt, {
              maxTokens: 200,
              temperature: 0.2,
            });
            const text = typeof raw === "string" ? raw : raw?.text || "";

            // Delegate JSON extraction to the shared _safeParseLLMJson helper
            // (handles markdown code fences and bare JSON objects)
            const parsed = _safeParseLLMJson(text);
            if (!parsed) throw new Error("LLM response was not valid JSON");

            const scope = parsed.scope ? `(${parsed.scope})` : "";
            const bang = parsed.breaking ? "!" : "";
            const suggestion = `${parsed.type || "chore"}${scope}${bang}: ${parsed.subject}`;

            return {
              suggestion,
              type: parsed.type,
              scope: parsed.scope || null,
              subject: parsed.subject,
              breaking: !!parsed.breaking,
              filesChanged,
              stats,
              llmGenerated: true,
            };
          } catch (_err) {
            // LLM failed — fall through to rule-based
          }
        }

        // ── Rule-based fallback — delegate type+scope to DocGenerator ──────
        const _docGen = new DocGenerator();
        const { type, scope } = _docGen.analyzeCommitType(diff);
        const subject = _buildSubjectFallback(type, filesChanged, stats);
        return {
          suggestion: `${type}${scope ? `(${scope})` : ""}: ${subject}`,
          type,
          scope: scope || null,
          subject,
          breaking: false,
          filesChanged,
          stats,
          llmGenerated: false,
        };
      },
    });

    this.registerSkill({
      name: "generate-pr-description",
      description:
        "Generate a PR description from git diff and commit messages",
      category: "git",
      requiredContext: ["gitDiff", "commitMessages"],
      execute: async (ctx) => {
        const commits = Array.isArray(ctx.commitMessages)
          ? ctx.commitMessages
          : [];
        const diffLines = (ctx.gitDiff || "").split("\n");
        const filesChanged = diffLines
          .filter((l) => l.startsWith("diff --git"))
          .map((l) => l.split(" b/")[1])
          .filter(Boolean);

        return {
          title: commits[0] || "Update",
          body: [
            "## Changes",
            ...filesChanged.map((f) => `- \`${f}\``),
            "",
            "## Commits",
            ...commits.map((c) => `- ${c}`),
          ].join("\n"),
          filesChanged,
          commitCount: commits.length,
        };
      },
    });

    this.registerSkill({
      name: "generate-changelog",
      description: "Generate a changelog from a range of commits",
      category: "git",
      requiredContext: ["commits"],
      execute: async (ctx) => {
        const commits = Array.isArray(ctx.commits) ? ctx.commits : [];
        const categories = {
          feat: [],
          fix: [],
          refactor: [],
          docs: [],
          other: [],
        };

        for (const msg of commits) {
          const match = msg.match(
            /^(feat|fix|refactor|docs|chore|test|ci)[\s(:]/i,
          );
          const cat = match ? match[1].toLowerCase() : "other";
          const bucket = categories[cat] || categories.other;
          bucket.push(msg);
        }

        const sections = [];
        if (categories.feat.length)
          sections.push(
            "### Features\n" + categories.feat.map((c) => `- ${c}`).join("\n"),
          );
        if (categories.fix.length)
          sections.push(
            "### Bug Fixes\n" + categories.fix.map((c) => `- ${c}`).join("\n"),
          );
        if (categories.refactor.length)
          sections.push(
            "### Refactoring\n" +
              categories.refactor.map((c) => `- ${c}`).join("\n"),
          );
        if (categories.docs.length)
          sections.push(
            "### Documentation\n" +
              categories.docs.map((c) => `- ${c}`).join("\n"),
          );
        if (categories.other.length)
          sections.push(
            "### Other\n" + categories.other.map((c) => `- ${c}`).join("\n"),
          );

        return { changelog: sections.join("\n\n"), categories };
      },
    });

    this.registerSkill({
      name: "explain-code",
      description: "Explain a code block in plain language",
      category: "docs",
      requiredContext: ["code"],
      execute: async (ctx) => {
        const code = ctx.code || "";
        const lines = code.split("\n").filter((l) => l.trim());
        const language = ctx.language || "unknown";

        return {
          lineCount: lines.length,
          language,
          summary: `Code block with ${lines.length} non-empty lines (${language}).`,
          hasComments: lines.some(
            (l) =>
              l.trim().startsWith("//") ||
              l.trim().startsWith("#") ||
              l.trim().startsWith("/*"),
          ),
          hasFunctions: lines.some((l) =>
            /\bfunction\b|\bconst\s+\w+\s*=\s*(async\s+)?\(/.test(l),
          ),
          hasClasses: lines.some((l) => /\bclass\s+/.test(l)),
          prompt: `Please explain the following ${language} code:\n\n${code}`,
        };
      },
    });

    this.registerSkill({
      name: "suggest-tests",
      description: "Suggest test cases for a function",
      category: "testing",
      requiredContext: ["code"],
      execute: async (ctx) => {
        const code = ctx.code || "";
        const functionName = ctx.functionName || "targetFunction";

        // Extract parameters heuristically.
        const paramMatch = code.match(
          /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?)\(([^)]*)\)/,
        );
        const params = paramMatch
          ? paramMatch[1]
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean)
          : [];

        const suggestions = [
          {
            type: "happy-path",
            description: `${functionName} returns expected result with valid inputs`,
          },
          {
            type: "edge-case-empty",
            description: `${functionName} handles empty/null inputs gracefully`,
          },
          {
            type: "edge-case-boundary",
            description: `${functionName} handles boundary values`,
          },
          {
            type: "error",
            description: `${functionName} throws on invalid arguments`,
          },
        ];

        if (params.length > 0) {
          suggestions.push({
            type: "parameter-types",
            description: `${functionName} rejects wrong types for: ${params.join(", ")}`,
          });
        }

        if (/async|Promise|await/.test(code)) {
          suggestions.push({
            type: "async-rejection",
            description: `${functionName} rejects/throws on async failure`,
          });
        }

        return { functionName, params, suggestions };
      },
    });

    this.registerSkill({
      name: "review-diff",
      description: "Review a git diff for potential issues",
      category: "git",
      requiredContext: ["gitDiff"],
      execute: async (ctx) => {
        const diff = ctx.gitDiff || "";
        const lines = diff.split("\n");

        const findings = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Detect common issues in added lines.
          if (!line.startsWith("+") || line.startsWith("+++")) continue;
          const content = line.slice(1);

          if (/console\.log\(/.test(content)) {
            findings.push({
              line: i + 1,
              severity: "warning",
              message: "console.log left in code",
            });
          }
          if (/TODO|FIXME|HACK|XXX/.test(content)) {
            findings.push({
              line: i + 1,
              severity: "info",
              message: "TODO/FIXME comment found",
            });
          }
          if (
            /password|secret|api_key|apikey|token/i.test(content) &&
            /[=:]\s*["']/.test(content)
          ) {
            findings.push({
              line: i + 1,
              severity: "critical",
              message: "Possible hardcoded secret",
            });
          }
          if (content.length > 200) {
            findings.push({
              line: i + 1,
              severity: "info",
              message: "Very long line (>200 chars)",
            });
          }
        }

        const filesChanged = lines
          .filter((l) => l.startsWith("diff --git"))
          .map((l) => l.split(" b/")[1])
          .filter(Boolean);

        return {
          filesChanged,
          findings,
          summary: `${filesChanged.length} file(s) changed, ${findings.length} finding(s)`,
        };
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. SANDBOX
// ═══════════════════════════════════════════════════════════════

/**
 * Create a restricted execution context for plugin handler code.
 *
 * Allowed:
 *   - fs.readFile (read-only, scoped to pluginDir + workspace)
 *   - path operations
 *   - JSON.parse / JSON.stringify
 *   - console.log / console.error (captured)
 *   - setTimeout (capped at HANDLER_TIMEOUT_MS)
 *
 * NOT allowed:
 *   - Network (http, https, net, dns, fetch)
 *   - child_process / exec / spawn
 *   - Writing files outside workspace
 *   - require() of arbitrary modules
 *
 * @param {string} pluginDir   Absolute path to the plugin's directory.
 * @param {object} [context]   Additional context passed as `__ctx` in the sandbox.
 * @returns {object}           Sandbox object suitable for `vm.createContext`.
 */
function createPluginSandbox(pluginDir, context) {
  const fsReadOnly = require("node:fs/promises");

  /** Collected log output from the plugin handler. */
  const logOutput = [];

  /**
   * Scoped readFile — only allows reading within the pluginDir or the
   * workspace root (if provided in context).
   */
  const scopedReadFile = async (filePath, encoding) => {
    const resolved = path.resolve(pluginDir, filePath);
    const allowed = [pluginDir];
    if (context && context.workspaceRoot) {
      allowed.push(path.resolve(context.workspaceRoot));
    }

    const isAllowed = allowed.some(
      (dir) => resolved.startsWith(dir + path.sep) || resolved === dir,
    );
    if (!isAllowed) {
      throw new Error(
        `Access denied: cannot read "${resolved}" — outside allowed directories`,
      );
    }

    // Resolve symlinks and re-check to prevent symlink traversal attacks
    const realFs = require("node:fs");
    let realPath;
    try {
      realPath = realFs.realpathSync(resolved);
    } catch {
      // File doesn't exist yet — allow (readFile will fail naturally)
      realPath = resolved;
    }
    const realAllowed = allowed.some(
      (dir) => realPath.startsWith(dir + path.sep) || realPath === dir,
    );
    if (!realAllowed) {
      throw new Error(
        `Access denied: symlink target "${realPath}" is outside allowed directories`,
      );
    }

    return fsReadOnly.readFile(resolved, encoding || "utf-8");
  };

  const sandbox = {
    // Result placeholder.
    __result: undefined,

    // Context for the handler.
    __ctx: {
      workspaceRoot: (context && context.workspaceRoot) || process.cwd(),
      agentType: (context && context.agentType) || "unknown",
      readFile: scopedReadFile,
      ...(context || {}),
    },

    // Safe globals.
    console: {
      log: (...args) =>
        logOutput.push({ level: "info", message: args.map(String).join(" ") }),
      warn: (...args) =>
        logOutput.push({ level: "warn", message: args.map(String).join(" ") }),
      error: (...args) =>
        logOutput.push({ level: "error", message: args.map(String).join(" ") }),
      info: (...args) =>
        logOutput.push({ level: "info", message: args.map(String).join(" ") }),
    },

    // Allowed utilities.
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    Error,
    TypeError,
    RangeError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,

    // Path utilities (safe, no I/O).
    path: {
      join: path.join,
      resolve: path.resolve,
      basename: path.basename,
      dirname: path.dirname,
      extname: path.extname,
      relative: path.relative,
      normalize: path.normalize,
      sep: path.sep,
    },

    // Scoped file reading.
    fs: {
      readFile: scopedReadFile,
    },

    // Limited timers.
    setTimeout: (fn, ms) =>
      setTimeout(fn, Math.min(ms || 0, HANDLER_TIMEOUT_MS)),
    clearTimeout,

    // Log output accessor (so caller can retrieve logs after execution).
    __logOutput: logOutput,
  };

  return sandbox;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = { PluginManager, SkillRegistry };
