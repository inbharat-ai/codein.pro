/**
 * CodeIn MAS — Enhanced Skill Registry
 *
 * Core skill catalog for the autonomous computer system.
 * Wraps the existing SkillRegistry from plugin-system.js with:
 *   - Typed categories and trust levels
 *   - Built-in skills for file ops, terminal, git, sandbox, LLM
 *   - Keyword + LLM-assisted task matching
 *   - Cost estimation per skill
 *   - SQLite persistence for generated skills
 *   - Audit hooks on every execution
 */
"use strict";

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { createLogger } = require("./logger");

const log = createLogger("EnhancedSkillRegistry");

// ═══════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════

const SKILL_CATEGORY = Object.freeze({
  FILE_OPS: "file_ops",
  TERMINAL: "terminal",
  GIT: "git",
  BROWSER: "browser",
  CODE_GEN: "code_gen",
  API: "api",
  TESTING: "testing",
  DEPLOYMENT: "deployment",
  DATA: "data",
  ANALYSIS: "analysis",
});

const SKILL_TRUST_LEVEL = Object.freeze({
  BUILTIN: "builtin",
  VERIFIED: "verified",
  GENERATED: "generated",
  UNTESTED: "untested",
});

// ═══════════════════════════════════════════════════════════════
// KEYWORD INDEX — maps task-description tokens to skill names
// ═══════════════════════════════════════════════════════════════

const KEYWORD_MAP = {
  // file ops
  read: ["read-file"],
  open: ["read-file"],
  cat: ["read-file"],
  write: ["write-file"],
  create: ["write-file"],
  save: ["write-file"],
  list: ["list-files"],
  ls: ["list-files"],
  dir: ["list-files"],
  directory: ["list-files"],
  search: ["search-files"],
  find: ["search-files"],
  grep: ["search-files"],

  // terminal
  run: ["run-terminal-command"],
  execute: ["run-terminal-command"],
  command: ["run-terminal-command"],
  shell: ["run-terminal-command"],
  terminal: ["run-terminal-command"],
  bash: ["run-terminal-command"],

  // git
  git: ["git-status", "git-diff", "git-branch", "git-stage", "git-commit"],
  status: ["git-status"],
  diff: ["git-diff"],
  branch: ["git-branch"],
  stage: ["git-stage"],
  add: ["git-stage"],
  commit: ["git-commit"],

  // sandbox
  sandbox: ["sandbox-execute"],
  docker: ["sandbox-execute"],
  isolate: ["sandbox-execute"],
  container: ["sandbox-execute"],

  // llm
  generate: ["llm-generate"],
  llm: ["llm-generate", "llm-analyze"],
  ai: ["llm-generate", "llm-analyze"],
  analyze: ["llm-analyze"],
  review: ["llm-analyze"],
  explain: ["llm-analyze"],

  // testing
  test: ["run-tests"],
  tests: ["run-tests"],
  jest: ["run-tests"],
  mocha: ["run-tests"],
  pytest: ["run-tests"],
  spec: ["run-tests"],
};

// ═══════════════════════════════════════════════════════════════
// EnhancedSkillRegistry
// ═══════════════════════════════════════════════════════════════

class EnhancedSkillRegistry {
  /**
   * @param {object} [opts]
   * @param {object} [opts.persistence]  SqliteMemoryStore instance for saving generated skills
   * @param {Function} [opts.runLLM]     Async function (prompt, opts) => string|{text}
   * @param {object} [opts.sandbox]      DockerSandbox instance
   */
  constructor(opts = {}) {
    this._persistence = opts.persistence || null;
    this._runLLM = opts.runLLM || null;
    this._sandbox = opts.sandbox || null;

    /** @type {Map<string, object>} */
    this._skills = new Map();

    /** Audit log (in-memory ring buffer, last 500 entries) */
    this._auditLog = [];
    this._auditMaxSize = 500;

    log.info("EnhancedSkillRegistry created", {
      hasPersistence: !!this._persistence,
      hasLLM: !!this._runLLM,
      hasSandbox: !!this._sandbox,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Registration
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register a skill with full metadata.
   *
   * @param {object} definition
   * @param {string}   definition.name
   * @param {string}   definition.description
   * @param {string}   definition.category         One of SKILL_CATEGORY values
   * @param {string}   definition.trustLevel        One of SKILL_TRUST_LEVEL values
   * @param {string[]} [definition.requiredPermissions]
   * @param {Function} definition.execute           Async (context, opts) => result
   * @param {object}   [definition.inputSchema]
   * @param {object}   [definition.outputSchema]
   * @param {number}   [definition.estimatedTokens]
   * @param {number}   [definition.estimatedTimeMs]
   * @param {string[]} [definition.agentTypes]
   * @returns {object} The registered skill record
   */
  registerSkill(definition) {
    if (!definition || typeof definition !== "object") {
      throw new Error("Skill definition must be a non-null object");
    }
    if (!definition.name || typeof definition.name !== "string") {
      throw new Error("Skill must have a string name");
    }
    if (typeof definition.execute !== "function") {
      throw new Error(
        `Skill "${definition.name}" must have an execute function`,
      );
    }

    if (this._skills.has(definition.name)) {
      throw new Error(
        `Skill "${definition.name}" is already registered — unregister it first`,
      );
    }

    const category = definition.category || SKILL_CATEGORY.ANALYSIS;
    const trustLevel = definition.trustLevel || SKILL_TRUST_LEVEL.UNTESTED;

    // Validate category
    if (!Object.values(SKILL_CATEGORY).includes(category)) {
      throw new Error(
        `Invalid category "${category}". Valid: ${Object.values(SKILL_CATEGORY).join(", ")}`,
      );
    }
    // Validate trust level
    if (!Object.values(SKILL_TRUST_LEVEL).includes(trustLevel)) {
      throw new Error(
        `Invalid trust level "${trustLevel}". Valid: ${Object.values(SKILL_TRUST_LEVEL).join(", ")}`,
      );
    }

    const skill = {
      name: definition.name,
      description: definition.description || "",
      category,
      trustLevel,
      requiredPermissions: definition.requiredPermissions || [],
      execute: definition.execute,
      inputSchema: definition.inputSchema || null,
      outputSchema: definition.outputSchema || null,
      estimatedTokens: definition.estimatedTokens || 0,
      estimatedTimeMs: definition.estimatedTimeMs || 0,
      agentTypes: definition.agentTypes || [],
      registeredAt: Date.now(),
    };

    this._skills.set(skill.name, skill);
    log.info("Skill registered", { name: skill.name, category, trustLevel });
    return skill;
  }

  /**
   * Unregister a skill by name.
   * @param {string} name
   * @returns {boolean}
   */
  unregisterSkill(name) {
    const removed = this._skills.delete(name);
    if (removed) {
      log.info("Skill unregistered", { name });
    }
    return removed;
  }

  // ═══════════════════════════════════════════════════════════════
  // Built-in skill registration
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register all built-in skills that wrap real system capabilities.
   */
  registerBuiltinSkills() {
    // ── File operations ──────────────────────────────────────

    this.registerSkill({
      name: "read-file",
      description: "Read the contents of a file at a given path",
      category: SKILL_CATEGORY.FILE_OPS,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["file_read"],
      estimatedTokens: 50,
      estimatedTimeMs: 100,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Absolute or relative file path",
          },
          encoding: { type: "string", default: "utf-8" },
        },
        required: ["filePath"],
      },
      execute: async (ctx) => {
        const filePath = ctx.filePath;
        if (!filePath) throw new Error("filePath is required");
        const encoding = ctx.encoding || "utf-8";
        const content = await fs.readFile(path.resolve(filePath), encoding);
        return { content, size: content.length, filePath };
      },
    });

    this.registerSkill({
      name: "write-file",
      description: "Write content to a file (creates directories as needed)",
      category: SKILL_CATEGORY.FILE_OPS,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["file_write"],
      estimatedTokens: 50,
      estimatedTimeMs: 150,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string" },
          content: { type: "string" },
          encoding: { type: "string", default: "utf-8" },
        },
        required: ["filePath", "content"],
      },
      execute: async (ctx) => {
        const filePath = path.resolve(ctx.filePath);
        if (!ctx.filePath) throw new Error("filePath is required");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, ctx.content, ctx.encoding || "utf-8");
        return {
          filePath,
          bytesWritten: Buffer.byteLength(ctx.content, ctx.encoding || "utf-8"),
        };
      },
    });

    this.registerSkill({
      name: "list-files",
      description: "List files and directories at a given path",
      category: SKILL_CATEGORY.FILE_OPS,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["file_read"],
      estimatedTokens: 30,
      estimatedTimeMs: 100,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          dirPath: { type: "string", default: "." },
          recursive: { type: "boolean", default: false },
        },
      },
      execute: async (ctx) => {
        const dirPath = path.resolve(ctx.dirPath || ".");
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
          files.push({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
            path: path.join(dirPath, entry.name),
          });
        }
        return { dirPath, files, count: files.length };
      },
    });

    this.registerSkill({
      name: "search-files",
      description:
        "Search for files matching a glob pattern or content pattern",
      category: SKILL_CATEGORY.FILE_OPS,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["file_read"],
      estimatedTokens: 50,
      estimatedTimeMs: 500,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Text pattern to search for",
          },
          directory: { type: "string", default: "." },
          fileGlob: { type: "string", default: "*" },
        },
        required: ["pattern"],
      },
      execute: async (ctx) => {
        const dir = path.resolve(ctx.directory || ".");
        const pattern = ctx.pattern;
        if (!pattern) throw new Error("pattern is required");

        // Simple recursive search — find files containing pattern
        const matches = [];
        const maxResults = 50;

        async function walk(d) {
          if (matches.length >= maxResults) return;
          let entries;
          try {
            entries = await fs.readdir(d, { withFileTypes: true });
          } catch {
            return;
          }
          for (const entry of entries) {
            if (matches.length >= maxResults) break;
            const fullPath = path.join(d, entry.name);
            if (entry.isDirectory()) {
              // Skip common non-useful dirs
              if (
                entry.name === "node_modules" ||
                entry.name === ".git" ||
                entry.name === "dist" ||
                entry.name === "build"
              ) {
                continue;
              }
              await walk(fullPath);
            } else {
              try {
                const content = await fs.readFile(fullPath, "utf-8");
                if (content.includes(pattern)) {
                  const lines = content.split("\n");
                  const matchingLines = [];
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(pattern)) {
                      matchingLines.push({
                        line: i + 1,
                        text: lines[i].trim().slice(0, 200),
                      });
                    }
                  }
                  matches.push({
                    file: fullPath,
                    matchCount: matchingLines.length,
                    lines: matchingLines.slice(0, 5),
                  });
                }
              } catch {
                // binary or unreadable file — skip
              }
            }
          }
        }

        await walk(dir);
        return {
          pattern,
          directory: dir,
          matches,
          totalMatches: matches.length,
        };
      },
    });

    // ── Terminal ──────────────────────────────────────────────

    this.registerSkill({
      name: "run-terminal-command",
      description: "Execute a shell command and return stdout/stderr",
      category: SKILL_CATEGORY.TERMINAL,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["command_run"],
      estimatedTokens: 30,
      estimatedTimeMs: 5000,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string" },
          timeout: { type: "number", default: 30000 },
        },
        required: ["command"],
      },
      execute: async (ctx) => {
        const command = ctx.command;
        if (!command) throw new Error("command is required");
        const cwd = ctx.cwd || process.cwd();
        const timeout = Math.min(ctx.timeout || 30000, 300000); // cap at 5 min

        try {
          const result = execSync(command, {
            cwd,
            timeout,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 1024 * 1024,
            windowsHide: true,
          });
          return { exitCode: 0, stdout: result, stderr: "" };
        } catch (err) {
          return {
            exitCode: err.status || 1,
            stdout: (err.stdout || "").toString(),
            stderr: (err.stderr || "").toString(),
          };
        }
      },
    });

    // ── Git ──────────────────────────────────────────────────

    const gitRun = (args, cwd) => {
      try {
        return execSync(`git ${args}`, {
          cwd: cwd || process.cwd(),
          encoding: "utf-8",
          timeout: 30000,
          stdio: ["pipe", "pipe", "pipe"],
          maxBuffer: 10 * 1024 * 1024,
          windowsHide: true,
        }).trim();
      } catch (err) {
        const msg = (err.stderr || err.message || "").toString().trim();
        throw new Error(`git ${args.split(" ")[0]} failed: ${msg}`);
      }
    };

    this.registerSkill({
      name: "git-status",
      description:
        "Get git repository status (branch, modified files, ahead/behind)",
      category: SKILL_CATEGORY.GIT,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["git_op"],
      estimatedTokens: 20,
      estimatedTimeMs: 500,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: { cwd: { type: "string" } },
      },
      execute: async (ctx) => {
        const cwd = ctx.cwd || process.cwd();
        const branch = gitRun("rev-parse --abbrev-ref HEAD", cwd);
        const porcelain = gitRun("status --porcelain", cwd);
        const files = porcelain
          ? porcelain.split("\n").map((l) => ({
              status: l.substring(0, 2).trim(),
              file: l.substring(3),
            }))
          : [];
        return { branch, files, clean: files.length === 0 };
      },
    });

    this.registerSkill({
      name: "git-diff",
      description: "Get git diff (staged or unstaged)",
      category: SKILL_CATEGORY.GIT,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["git_op"],
      estimatedTokens: 100,
      estimatedTimeMs: 500,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string" },
          staged: { type: "boolean", default: false },
        },
      },
      execute: async (ctx) => {
        const cwd = ctx.cwd || process.cwd();
        const args = ctx.staged ? "diff --staged" : "diff";
        const diff = gitRun(args, cwd);
        return { diff, length: diff.length };
      },
    });

    this.registerSkill({
      name: "git-branch",
      description: "List or create git branches",
      category: SKILL_CATEGORY.GIT,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["git_op"],
      estimatedTokens: 20,
      estimatedTimeMs: 300,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string" },
          create: {
            type: "string",
            description: "Branch name to create (optional)",
          },
          baseBranch: { type: "string" },
        },
      },
      execute: async (ctx) => {
        const cwd = ctx.cwd || process.cwd();
        if (ctx.create) {
          const safeName = ctx.create
            .replace(/[^a-zA-Z0-9_\-/]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 100);
          if (!safeName) throw new Error("Invalid branch name");
          const base = ctx.baseBranch ? ` ${ctx.baseBranch}` : "";
          gitRun(`checkout -b ${safeName}${base}`, cwd);
          return { created: safeName };
        }
        const raw = gitRun("branch --no-color", cwd);
        const branches = raw.split("\n").map((l) => ({
          name: l.replace(/^\*?\s+/, ""),
          current: l.startsWith("*"),
        }));
        return { branches };
      },
    });

    this.registerSkill({
      name: "git-stage",
      description: "Stage files for commit",
      category: SKILL_CATEGORY.GIT,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["git_op"],
      estimatedTokens: 10,
      estimatedTimeMs: 300,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description: 'File paths to stage, or ["."] for all',
          },
          cwd: { type: "string" },
        },
        required: ["files"],
      },
      execute: async (ctx) => {
        const cwd = ctx.cwd || process.cwd();
        const files = ctx.files;
        if (!files || files.length === 0) throw new Error("No files specified");
        for (const f of files) {
          const safe = f.replace(/"/g, '\\"');
          gitRun(`add "${safe}"`, cwd);
        }
        return { staged: files };
      },
    });

    this.registerSkill({
      name: "git-commit",
      description: "Commit staged changes with a message",
      category: SKILL_CATEGORY.GIT,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["git_op"],
      estimatedTokens: 20,
      estimatedTimeMs: 500,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
          cwd: { type: "string" },
        },
        required: ["message"],
      },
      execute: async (ctx) => {
        const cwd = ctx.cwd || process.cwd();
        if (!ctx.message) throw new Error("Commit message is required");
        execSync("git commit -F -", {
          cwd,
          input: ctx.message,
          encoding: "utf-8",
          timeout: 30000,
          windowsHide: true,
        });
        const hash = gitRun("rev-parse --short HEAD", cwd);
        return { hash, message: ctx.message.split("\n")[0] };
      },
    });

    // ── Sandbox execution ────────────────────────────────────

    this.registerSkill({
      name: "sandbox-execute",
      description: "Execute code in an isolated Docker sandbox",
      category: SKILL_CATEGORY.TESTING,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["command_run"],
      estimatedTokens: 100,
      estimatedTimeMs: 10000,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string" },
          runtime: {
            type: "string",
            enum: ["node", "python", "go"],
            default: "node",
          },
        },
        required: ["code"],
      },
      execute: async (ctx) => {
        if (!ctx.code) throw new Error("code is required");
        if (this._sandbox) {
          return await this._sandbox.execute({
            code: ctx.code,
            runtime: ctx.runtime || "node",
          });
        }
        // Fallback: no Docker, warn user
        return {
          stdout: "",
          stderr: "Docker sandbox not available. Code was not executed.",
          exitCode: 127,
          durationMs: 0,
          sandboxId: "unavailable",
        };
      },
    });

    // ── LLM ──────────────────────────────────────────────────

    this.registerSkill({
      name: "llm-generate",
      description: "Generate text or code using the configured LLM",
      category: SKILL_CATEGORY.CODE_GEN,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: [],
      estimatedTokens: 500,
      estimatedTimeMs: 5000,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          maxTokens: { type: "number", default: 1024 },
        },
        required: ["prompt"],
      },
      execute: async (ctx) => {
        if (!ctx.prompt) throw new Error("prompt is required");
        if (!this._runLLM) {
          return { text: "", error: "No LLM configured" };
        }
        const result = await this._runLLM(ctx.prompt, {
          maxTokens: ctx.maxTokens || 1024,
        });
        const text = typeof result === "string" ? result : result.text || "";
        return { text };
      },
    });

    this.registerSkill({
      name: "llm-analyze",
      description:
        "Analyze content (code, logs, data) using the configured LLM",
      category: SKILL_CATEGORY.ANALYSIS,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: [],
      estimatedTokens: 1000,
      estimatedTimeMs: 8000,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string" },
          question: { type: "string" },
          maxTokens: { type: "number", default: 2048 },
        },
        required: ["content", "question"],
      },
      execute: async (ctx) => {
        if (!ctx.content || !ctx.question) {
          throw new Error("content and question are required");
        }
        if (!this._runLLM) {
          return { analysis: "", error: "No LLM configured" };
        }
        const prompt = `Analyze the following content and answer the question.\n\nContent:\n${ctx.content.slice(0, 50000)}\n\nQuestion: ${ctx.question}`;
        const result = await this._runLLM(prompt, {
          maxTokens: ctx.maxTokens || 2048,
        });
        const text = typeof result === "string" ? result : result.text || "";
        return { analysis: text };
      },
    });

    // ── Testing ──────────────────────────────────────────────

    this.registerSkill({
      name: "run-tests",
      description:
        "Detect and run the project test suite (Jest, Mocha, pytest, etc.)",
      category: SKILL_CATEGORY.TESTING,
      trustLevel: SKILL_TRUST_LEVEL.BUILTIN,
      requiredPermissions: ["command_run"],
      estimatedTokens: 30,
      estimatedTimeMs: 30000,
      agentTypes: [],
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string" },
          testPath: {
            type: "string",
            description: "Specific test file or pattern",
          },
        },
      },
      execute: async (ctx) => {
        const cwd = ctx.cwd || process.cwd();

        // Detect test runner
        let command = null;
        try {
          const pkgRaw = fsSync.readFileSync(
            path.join(cwd, "package.json"),
            "utf-8",
          );
          const pkg = JSON.parse(pkgRaw);
          if (pkg.scripts && pkg.scripts.test) {
            command = "npm test";
          }
        } catch {
          // no package.json
        }

        if (!command) {
          // Check for common test configs
          const configs = [
            { file: "jest.config.js", cmd: "npx jest" },
            { file: "jest.config.ts", cmd: "npx jest" },
            { file: ".mocharc.yml", cmd: "npx mocha" },
            { file: ".mocharc.json", cmd: "npx mocha" },
            { file: "pytest.ini", cmd: "python -m pytest" },
            { file: "setup.cfg", cmd: "python -m pytest" },
            { file: "pyproject.toml", cmd: "python -m pytest" },
          ];
          for (const c of configs) {
            if (fsSync.existsSync(path.join(cwd, c.file))) {
              command = c.cmd;
              break;
            }
          }
        }

        if (!command) {
          return {
            error: "No test runner detected",
            exitCode: 1,
            stdout: "",
            stderr: "",
          };
        }

        if (ctx.testPath) {
          command += ` -- ${ctx.testPath}`;
        }

        try {
          const stdout = execSync(command, {
            cwd,
            encoding: "utf-8",
            timeout: 120000,
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 2 * 1024 * 1024,
            windowsHide: true,
          });
          return { exitCode: 0, stdout, stderr: "", command };
        } catch (err) {
          return {
            exitCode: err.status || 1,
            stdout: (err.stdout || "").toString(),
            stderr: (err.stderr || "").toString(),
            command,
          };
        }
      },
    });

    log.info("Builtin skills registered", { count: this._skills.size });
  }

  // ═══════════════════════════════════════════════════════════════
  // Querying
  // ═══════════════════════════════════════════════════════════════

  /**
   * Find skills relevant to a natural-language task description.
   * Uses keyword matching first, then LLM-assisted ranking if available.
   *
   * @param {string} taskDescription
   * @returns {Promise<object[]>} Matching skills sorted by relevance
   */
  async findSkillsForTask(taskDescription) {
    if (!taskDescription || typeof taskDescription !== "string") {
      return [];
    }

    const tokens = taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);

    // Collect skill name hits from keyword map
    const hitCounts = new Map();
    for (const token of tokens) {
      const skills = KEYWORD_MAP[token];
      if (skills) {
        for (const skillName of skills) {
          hitCounts.set(skillName, (hitCounts.get(skillName) || 0) + 1);
        }
      }
    }

    // Also match against skill descriptions
    for (const [name, skill] of this._skills) {
      const desc = skill.description.toLowerCase();
      let descHits = 0;
      for (const token of tokens) {
        if (desc.includes(token)) descHits++;
      }
      if (descHits > 0) {
        hitCounts.set(name, (hitCounts.get(name) || 0) + descHits);
      }
    }

    // Sort by hit count descending
    const sorted = [...hitCounts.entries()]
      .filter(([name]) => this._skills.has(name))
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => this._getSkillSummary(name));

    return sorted;
  }

  /**
   * Get a single skill by name.
   * @param {string} name
   * @returns {object|null}
   */
  getSkill(name) {
    const skill = this._skills.get(name);
    if (!skill) return null;
    return this._getSkillSummary(name);
  }

  /**
   * List skills with optional filters.
   * @param {object} [opts]
   * @param {string} [opts.category]
   * @param {string} [opts.trustLevel]
   * @returns {object[]}
   */
  listSkills(opts = {}) {
    const results = [];
    for (const [name, skill] of this._skills) {
      if (opts.category && skill.category !== opts.category) continue;
      if (opts.trustLevel && skill.trustLevel !== opts.trustLevel) continue;
      results.push(this._getSkillSummary(name));
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════════
  // Cost estimation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Estimate the cost of running a skill.
   *
   * @param {string} skillName
   * @param {object} [context] Additional context for more accurate estimates
   * @returns {{ tokenEstimate: number, timeEstimate: number, costUSD: number }|null}
   */
  estimateSkillCost(skillName, context = {}) {
    const skill = this._skills.get(skillName);
    if (!skill) return null;

    let tokenEstimate = skill.estimatedTokens || 0;
    let timeEstimate = skill.estimatedTimeMs || 0;

    // Adjust estimates based on context
    if (context.contentLength) {
      // Rough: 4 chars ~= 1 token for input
      const inputTokens = Math.ceil(context.contentLength / 4);
      tokenEstimate = Math.max(tokenEstimate, inputTokens);
    }

    // Cost approximation: $0.003 per 1K tokens (blended input/output for a mid-range model)
    const costUSD =
      Math.round((tokenEstimate / 1000) * 0.003 * 1_000_000) / 1_000_000;

    return { tokenEstimate, timeEstimate, costUSD };
  }

  // ═══════════════════════════════════════════════════════════════
  // Execution
  // ═══════════════════════════════════════════════════════════════

  /**
   * Execute a skill by name with context and options.
   *
   * @param {string} name     Skill name
   * @param {object} context  Input context for the skill's execute function
   * @param {object} [opts]   { auditMeta }
   * @returns {Promise<{ result: *, durationMs: number }>}
   */
  async executeSkill(name, context, opts = {}) {
    const skill = this._skills.get(name);
    if (!skill) throw new Error(`Skill "${name}" is not registered`);

    const start = Date.now();
    const auditEntry = {
      skillName: name,
      category: skill.category,
      trustLevel: skill.trustLevel,
      timestamp: new Date().toISOString(),
      meta: opts.auditMeta || null,
      success: false,
      error: null,
      durationMs: 0,
    };

    try {
      const result = await skill.execute(context, opts);
      const durationMs = Date.now() - start;

      auditEntry.success = true;
      auditEntry.durationMs = durationMs;
      this._appendAudit(auditEntry);

      log.info("Skill executed", { name, durationMs });
      return { result, durationMs };
    } catch (err) {
      const durationMs = Date.now() - start;
      auditEntry.error = err.message;
      auditEntry.durationMs = durationMs;
      this._appendAudit(auditEntry);

      log.error("Skill execution failed", {
        name,
        error: err.message,
        durationMs,
      });
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Persistence
  // ═══════════════════════════════════════════════════════════════

  /**
   * Save generated (non-builtin) skills to the persistence store.
   * @returns {number} Number of skills saved
   */
  saveToStore() {
    if (!this._persistence) {
      log.warn("No persistence layer — skills not saved");
      return 0;
    }

    const generated = [];
    for (const [name, skill] of this._skills) {
      if (skill.trustLevel === SKILL_TRUST_LEVEL.BUILTIN) continue;
      generated.push({
        name: skill.name,
        description: skill.description,
        category: skill.category,
        trustLevel: skill.trustLevel,
        requiredPermissions: skill.requiredPermissions,
        inputSchema: skill.inputSchema,
        outputSchema: skill.outputSchema,
        estimatedTokens: skill.estimatedTokens,
        estimatedTimeMs: skill.estimatedTimeMs,
        agentTypes: skill.agentTypes,
        registeredAt: skill.registeredAt,
        // Note: execute function cannot be serialized — store a code string
        // if the skill was generated from LLM output
        executeSource: skill.executeSource || null,
      });
    }

    this._persistence.set("__skill_registry__", generated, {
      scope: "long_term",
      tags: ["skill-registry"],
    });

    log.info("Skills saved to store", { count: generated.length });
    return generated.length;
  }

  /**
   * Load generated skills from the persistence store.
   * Skills without a serialized execute function are loaded as metadata only.
   * @returns {number} Number of skills loaded
   */
  loadFromStore() {
    if (!this._persistence) {
      log.warn("No persistence layer — skills not loaded");
      return 0;
    }

    const data = this._persistence.get("__skill_registry__");
    if (!data || !Array.isArray(data)) return 0;

    let loaded = 0;
    for (const entry of data) {
      if (this._skills.has(entry.name)) continue; // don't overwrite existing

      let execute;
      if (entry.executeSource && typeof entry.executeSource === "string") {
        try {
          // Re-hydrate a simple function from source
          execute = new Function("ctx", "opts", entry.executeSource);
        } catch {
          // Cannot re-hydrate — create a no-op placeholder
          execute = async () => ({
            error: "Skill execute function could not be restored from storage",
          });
        }
      } else {
        execute = async () => ({
          error: "Skill execute function was not persisted",
        });
      }

      try {
        this.registerSkill({
          ...entry,
          execute,
        });
        loaded++;
      } catch (err) {
        log.warn("Failed to load skill from store", {
          name: entry.name,
          error: err.message,
        });
      }
    }

    log.info("Skills loaded from store", { count: loaded });
    return loaded;
  }

  // ═══════════════════════════════════════════════════════════════
  // Audit
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get recent audit entries.
   * @param {number} [limit=50]
   * @returns {object[]}
   */
  getAuditLog(limit = 50) {
    return this._auditLog.slice(-limit);
  }

  // ═══════════════════════════════════════════════════════════════
  // Internals
  // ═══════════════════════════════════════════════════════════════

  /** @private */
  _getSkillSummary(name) {
    const skill = this._skills.get(name);
    if (!skill) return null;
    return {
      name: skill.name,
      description: skill.description,
      category: skill.category,
      trustLevel: skill.trustLevel,
      requiredPermissions: skill.requiredPermissions,
      estimatedTokens: skill.estimatedTokens,
      estimatedTimeMs: skill.estimatedTimeMs,
      agentTypes: skill.agentTypes,
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema,
    };
  }

  /** @private */
  _appendAudit(entry) {
    this._auditLog.push(entry);
    if (this._auditLog.length > this._auditMaxSize) {
      this._auditLog = this._auditLog.slice(-this._auditMaxSize);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = { EnhancedSkillRegistry, SKILL_CATEGORY, SKILL_TRUST_LEVEL };
