/**
 * CodIn MAS — Workspace Memory
 *
 * Learns from user behavior and project patterns to provide better
 * suggestions over time. Detects code conventions, tracks command
 * history, builds a project profile, and provides contextual memory
 * for individual agents.
 *
 * Persistence: uses the SQLite PersistenceStore memory_store table
 * when available, falls back to an in-memory Map otherwise.
 */
"use strict";

const path = require("node:path");
const { createLogger } = require("./logger");

const log = createLogger("WorkspaceMemory");

// ─── Constants ───────────────────────────────────────────────
const VALID_CATEGORIES = [
  "command",
  "file_edit",
  "test_run",
  "build",
  "convention",
  "preference",
];

const CONVENTION_TYPES = [
  "naming",
  "formatting",
  "import_style",
  "test_style",
  "error_handling",
  "logging",
];

const DEFAULT_PRUNE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── Helpers: Naming Analysis ────────────────────────────────

/**
 * Analyze naming conventions found in JS/TS source code.
 * @param {string} content — File contents
 * @returns {{ camelCase: number, snake_case: number, PascalCase: number, UPPER_CASE: number }}
 * @private
 */
function _analyzeNaming(content) {
  const counts = { camelCase: 0, snake_case: 0, PascalCase: 0, UPPER_CASE: 0 };

  // Match variable / function declarations
  const varPattern = /(?:const|let|var|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  let match;
  while ((match = varPattern.exec(content)) !== null) {
    const name = match[1];
    if (/^[A-Z][A-Z0-9_]+$/.test(name) && name.length > 1) {
      counts.UPPER_CASE++;
    } else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      counts.PascalCase++;
    } else if (/^[a-z][a-zA-Z0-9]*$/.test(name) && name.length > 1) {
      counts.camelCase++;
    } else if (/^[a-z][a-z0-9_]*$/.test(name) && name.includes("_")) {
      counts.snake_case++;
    }
  }

  // Match class declarations
  const classPattern = /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = classPattern.exec(content)) !== null) {
    const name = match[1];
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      counts.PascalCase++;
    }
  }

  return counts;
}

/**
 * Detect import/require style in JS/TS code.
 * @param {string} content — File contents
 * @returns {{ requireCount: number, importCount: number, hasPathAliases: boolean, importOrder: string }}
 * @private
 */
function _analyzeImports(content) {
  const requireCount = (content.match(/\brequire\s*\(/g) || []).length;
  const importCount = (content.match(/\bimport\s+/g) || []).length;

  // Path aliases: @/ or ~/ patterns
  const hasPathAliases = /(?:require|from)\s*\(?["'](?:@\/|~\/)/m.test(content);

  // Import ordering heuristic: check if node builtins come first
  const importLines = content
    .split("\n")
    .filter((l) => /^\s*(import\s|const\s.*=\s*require)/.test(l));
  let order = "unordered";
  if (importLines.length >= 3) {
    const firstIsBuiltin =
      /["']node:/.test(importLines[0]) ||
      /["'](fs|path|os|util|crypto|http|https|stream|events|child_process)["']/.test(
        importLines[0],
      );
    if (firstIsBuiltin) {
      order = "builtins-first";
    }
  }

  return { requireCount, importCount, hasPathAliases, importOrder: order };
}

/**
 * Detect formatting conventions: indentation, quotes, semicolons, trailing commas.
 * @param {string} content — File contents
 * @returns {{ indent: string, indentSize: number, quotes: string, semicolons: boolean, trailingCommas: boolean }}
 * @private
 */
function _analyzeFormatting(content) {
  const lines = content.split("\n");

  // Indentation: tabs vs spaces, indent size
  let tabCount = 0;
  let spaceCount = 0;
  const spaceSizes = [];

  for (const line of lines) {
    if (/^\t/.test(line)) {
      tabCount++;
    } else {
      const m = line.match(/^( +)\S/);
      if (m) {
        spaceCount++;
        spaceSizes.push(m[1].length);
      }
    }
  }

  const indent = tabCount > spaceCount ? "tabs" : "spaces";
  let indentSize = 2;
  if (spaceSizes.length > 0) {
    // Find the most common indent step (GCD of common sizes)
    const sizeCounts = {};
    for (const s of spaceSizes) {
      if (s >= 1 && s <= 8) {
        sizeCounts[s] = (sizeCounts[s] || 0) + 1;
      }
    }
    // Most frequent small indent that divides into others
    const candidates = [2, 4, 8, 3];
    let best = 2;
    let bestScore = 0;
    for (const c of candidates) {
      const score = spaceSizes.filter((s) => s % c === 0).length;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    indentSize = best;
  }

  // Quotes: single vs double
  const singleQuotes = (content.match(/'/g) || []).length;
  const doubleQuotes = (content.match(/"/g) || []).length;
  const quotes = singleQuotes > doubleQuotes ? "single" : "double";

  // Semicolons: check statement-ending lines
  const stmtLines = lines.filter((l) =>
    /^\s*(const|let|var|return|throw|export|import)\b/.test(l),
  );
  const withSemi = stmtLines.filter((l) => /;\s*$/.test(l)).length;
  const semicolons =
    stmtLines.length > 0 ? withSemi / stmtLines.length > 0.5 : true;

  // Trailing commas: look for commas before closing brackets
  const trailingCommas = /,\s*[\]})]/m.test(content);

  return { indent, indentSize, quotes, semicolons, trailingCommas };
}

/**
 * Detect test file organization patterns.
 * @param {Array<{ path: string, content: string }>} files — File objects to analyze
 * @returns {{ colocated: number, separateDir: number, testSuffix: string, testRunner: string|null }}
 * @private
 */
function _analyzeTestPatterns(files) {
  let colocated = 0;
  let separateDir = 0;
  let testCount = 0;
  let specCount = 0;
  let detectedRunner = null;

  for (const file of files) {
    const filePath = file.path;
    const basename = path.basename(filePath);

    const isTest =
      /\.(test|spec)\.[jt]sx?$/.test(basename) ||
      /\/__tests__\//.test(filePath);

    if (!isTest) continue;

    if (/\.(test)\.[jt]sx?$/.test(basename)) testCount++;
    if (/\.(spec)\.[jt]sx?$/.test(basename)) specCount++;

    // Determine organization
    if (/\/__tests__\//.test(filePath) || /\\__tests__\\/.test(filePath)) {
      separateDir++;
    } else {
      colocated++;
    }

    // Detect test runner from content
    if (file.content) {
      if (/\bdescribe\b.*\bit\b/.test(file.content)) {
        if (/from\s+['"]vitest['"]/.test(file.content)) {
          detectedRunner = "vitest";
        } else if (
          /jest/.test(file.content) ||
          /\bexpect\b/.test(file.content)
        ) {
          detectedRunner = detectedRunner || "jest";
        }
      }
      if (/\bmocha\b/i.test(file.content)) {
        detectedRunner = "mocha";
      }
    }
  }

  const testSuffix = specCount > testCount ? ".spec" : ".test";

  return { colocated, separateDir, testSuffix, testRunner: detectedRunner };
}

// ═══════════════════════════════════════════════════════════════
// WORKSPACE MEMORY CLASS
// ═══════════════════════════════════════════════════════════════

class WorkspaceMemory {
  /**
   * @param {object} opts
   * @param {object|null} opts.persistence — PersistenceStore instance (or null for in-memory)
   * @param {string} opts.workspaceRoot — Absolute path to workspace root
   */
  constructor({ persistence = null, workspaceRoot }) {
    this._persistence = persistence;
    this._workspaceRoot = workspaceRoot;
    this._workspaceHash = _hashWorkspace(workspaceRoot);

    /** @type {Map<string, any>} In-memory fallback store */
    this._fallback = new Map();

    log.info("WorkspaceMemory initialized", {
      workspaceRoot,
      hasPersistence: !!persistence,
    });
  }

  // ─── Persistence Helpers ─────────────────────────────────

  /**
   * Store a value with a workspace-scoped key.
   * @param {string} key
   * @param {any} value
   * @private
   */
  _store(key, value) {
    const scopedKey = `wsmem:${key}`;
    if (this._persistence) {
      try {
        this._persistence.setMemory(this._workspaceHash, scopedKey, value);
      } catch (err) {
        log.warn("Persistence write failed, using fallback", {
          key,
          error: err.message,
        });
        this._fallback.set(scopedKey, value);
      }
    } else {
      this._fallback.set(scopedKey, value);
    }
  }

  /**
   * Retrieve a value by workspace-scoped key.
   * @param {string} key
   * @returns {any|undefined}
   * @private
   */
  _load(key) {
    const scopedKey = `wsmem:${key}`;
    if (this._persistence) {
      try {
        const val = this._persistence.getMemory(this._workspaceHash, scopedKey);
        if (val !== undefined) return val;
      } catch (err) {
        log.warn("Persistence read failed, checking fallback", {
          key,
          error: err.message,
        });
      }
    }
    return this._fallback.get(scopedKey);
  }

  /**
   * Delete a value by workspace-scoped key.
   * @param {string} key
   * @private
   */
  _remove(key) {
    const scopedKey = `wsmem:${key}`;
    if (this._persistence) {
      try {
        this._persistence.deleteMemory(this._workspaceHash, scopedKey);
      } catch {
        // ignore
      }
    }
    this._fallback.delete(scopedKey);
  }

  /**
   * List all workspace-memory keys.
   * @returns {Array<{ key: string, value: any }>}
   * @private
   */
  _listAll() {
    if (this._persistence) {
      try {
        const rows = this._persistence.listMemory(this._workspaceHash);
        return rows
          .filter((r) => r.key.startsWith("wsmem:"))
          .map((r) => ({ key: r.key.slice(6), value: r.value }));
      } catch {
        // fall through
      }
    }
    const result = [];
    for (const [k, v] of this._fallback) {
      if (k.startsWith("wsmem:")) {
        result.push({ key: k.slice(6), value: v });
      }
    }
    return result;
  }

  // ─── Pattern Learning ────────────────────────────────────

  /**
   * Record a pattern the system has observed.
   * @param {string} category — One of: command, file_edit, test_run, build, convention, preference
   * @param {{ action: string, target: string, frequency?: number, lastUsed?: string, metadata?: object }} pattern
   */
  learnPattern(category, pattern) {
    if (!VALID_CATEGORIES.includes(category)) {
      log.warn("Invalid pattern category", { category });
      return;
    }

    const storageKey = `pattern:${category}`;
    const patterns = this._load(storageKey) || [];

    // Check for duplicate: same action + target
    const existing = patterns.find(
      (p) => p.action === pattern.action && p.target === pattern.target,
    );

    if (existing) {
      existing.frequency = (existing.frequency || 1) + 1;
      existing.lastUsed = new Date().toISOString();
      if (pattern.metadata) {
        existing.metadata = { ...existing.metadata, ...pattern.metadata };
      }
    } else {
      patterns.push({
        action: pattern.action,
        target: pattern.target,
        frequency: pattern.frequency || 1,
        lastUsed: pattern.lastUsed || new Date().toISOString(),
        metadata: pattern.metadata || {},
      });
    }

    this._store(storageKey, patterns);
    log.debug("Pattern learned", {
      category,
      action: pattern.action,
      target: pattern.target,
    });
  }

  /**
   * Retrieve learned patterns for a category, sorted by frequency descending.
   * @param {string} category
   * @param {number} [limit=50]
   * @returns {Array<{ action: string, target: string, frequency: number, lastUsed: string, metadata: object }>}
   */
  getPatterns(category, limit = 50) {
    if (!VALID_CATEGORIES.includes(category)) {
      return [];
    }
    const patterns = this._load(`pattern:${category}`) || [];
    return patterns
      .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
      .slice(0, limit);
  }

  // ─── Convention Learning ─────────────────────────────────

  /**
   * Record a code convention detected in the project.
   * @param {{ type: string, rule: string, evidence: string[], confidence: number }} convention
   */
  learnConvention(convention) {
    if (!CONVENTION_TYPES.includes(convention.type)) {
      log.warn("Invalid convention type", { type: convention.type });
      return;
    }

    const conventions = this._load("conventions") || [];

    // Check for existing convention of same type + rule
    const existing = conventions.find(
      (c) => c.type === convention.type && c.rule === convention.rule,
    );

    if (existing) {
      // Merge evidence and update confidence
      const evidenceSet = new Set([
        ...(existing.evidence || []),
        ...(convention.evidence || []),
      ]);
      existing.evidence = [...evidenceSet].slice(0, 20); // Cap at 20 evidence entries
      existing.confidence = Math.max(
        existing.confidence || 0,
        convention.confidence || 0,
      );
      existing.updatedAt = new Date().toISOString();
    } else {
      conventions.push({
        type: convention.type,
        rule: convention.rule,
        evidence: (convention.evidence || []).slice(0, 20),
        confidence: convention.confidence || 0.5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    this._store("conventions", conventions);
    log.debug("Convention learned", {
      type: convention.type,
      rule: convention.rule,
    });
  }

  /**
   * Retrieve all learned conventions, sorted by confidence descending.
   * @returns {Array<{ type: string, rule: string, evidence: string[], confidence: number }>}
   */
  getConventions() {
    const conventions = this._load("conventions") || [];
    return conventions.sort(
      (a, b) => (b.confidence || 0) - (a.confidence || 0),
    );
  }

  // ─── Convention Detection ────────────────────────────────

  /**
   * Analyze an array of file objects and auto-detect project conventions.
   * @param {Array<{ path: string, content: string }>} files
   * @returns {{ conventions: Array<{ type: string, rule: string, evidence: string[], confidence: number }>, projectStyle: string }}
   */
  detectConventions(files) {
    const conventions = [];
    const jsFiles = files.filter((f) => /\.[jt]sx?$/.test(f.path) && f.content);

    if (jsFiles.length === 0) {
      return { conventions: [], projectStyle: "unknown" };
    }

    // ── Naming conventions ──
    const aggregatedNaming = {
      camelCase: 0,
      snake_case: 0,
      PascalCase: 0,
      UPPER_CASE: 0,
    };
    const namingEvidence = [];

    for (const file of jsFiles) {
      const result = _analyzeNaming(file.content);
      for (const key of Object.keys(aggregatedNaming)) {
        aggregatedNaming[key] += result[key];
      }
      const dominant = Object.entries(result).sort((a, b) => b[1] - a[1])[0];
      if (dominant && dominant[1] > 0) {
        namingEvidence.push(file.path);
      }
    }

    const totalNaming = Object.values(aggregatedNaming).reduce(
      (a, b) => a + b,
      0,
    );
    if (totalNaming > 0) {
      const namingParts = [];
      if (aggregatedNaming.camelCase > totalNaming * 0.2) {
        namingParts.push("camelCase for variables/functions");
      }
      if (aggregatedNaming.PascalCase > totalNaming * 0.1) {
        namingParts.push("PascalCase for classes");
      }
      if (aggregatedNaming.snake_case > totalNaming * 0.2) {
        namingParts.push("snake_case for variables");
      }
      if (aggregatedNaming.UPPER_CASE > totalNaming * 0.05) {
        namingParts.push("UPPER_CASE for constants");
      }

      if (namingParts.length > 0) {
        const confidence = Math.min(
          0.5 + (totalNaming / (jsFiles.length * 10)) * 0.5,
          0.99,
        );
        conventions.push({
          type: "naming",
          rule: namingParts.join(", "),
          evidence: namingEvidence.slice(0, 10),
          confidence: Math.round(confidence * 100) / 100,
        });
      }
    }

    // ── Import style ──
    let totalRequire = 0;
    let totalImport = 0;
    let aliasCount = 0;
    const importEvidence = [];

    for (const file of jsFiles) {
      const result = _analyzeImports(file.content);
      totalRequire += result.requireCount;
      totalImport += result.importCount;
      if (result.hasPathAliases) aliasCount++;
      if (result.requireCount > 0 || result.importCount > 0) {
        importEvidence.push(file.path);
      }
    }

    const totalImports = totalRequire + totalImport;
    if (totalImports > 0) {
      const parts = [];
      if (totalRequire > totalImport) {
        parts.push("CommonJS require()");
      } else if (totalImport > totalRequire) {
        parts.push("ES module import");
      } else {
        parts.push("Mixed require/import");
      }
      if (aliasCount > jsFiles.length * 0.3) {
        parts.push("with path aliases");
      }

      conventions.push({
        type: "import_style",
        rule: parts.join(" "),
        evidence: importEvidence.slice(0, 10),
        confidence: Math.min(
          0.6 + (totalImports / (jsFiles.length * 5)) * 0.4,
          0.99,
        ),
      });
    }

    // ── Formatting ──
    const aggregatedFmt = {
      tabs: 0,
      spaces: 0,
      single: 0,
      double: 0,
      semi: 0,
      noSemi: 0,
    };
    const fmtEvidence = [];

    for (const file of jsFiles) {
      const result = _analyzeFormatting(file.content);
      aggregatedFmt[result.indent === "tabs" ? "tabs" : "spaces"]++;
      aggregatedFmt[result.quotes === "single" ? "single" : "double"]++;
      aggregatedFmt[result.semicolons ? "semi" : "noSemi"]++;
      fmtEvidence.push(file.path);
    }

    const fmtParts = [];
    fmtParts.push(
      aggregatedFmt.tabs > aggregatedFmt.spaces ? "tabs" : "spaces",
    );
    fmtParts.push(
      aggregatedFmt.single > aggregatedFmt.double
        ? "single quotes"
        : "double quotes",
    );
    fmtParts.push(
      aggregatedFmt.semi > aggregatedFmt.noSemi
        ? "semicolons"
        : "no semicolons",
    );

    // Determine indent size from majority
    let dominantIndent = 2;
    if (jsFiles.length > 0) {
      const indentSizes = jsFiles.map(
        (f) => _analyzeFormatting(f.content).indentSize,
      );
      const sizeCounts = {};
      for (const s of indentSizes) {
        sizeCounts[s] = (sizeCounts[s] || 0) + 1;
      }
      const sorted = Object.entries(sizeCounts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        dominantIndent = Number(sorted[0][0]);
      }
    }

    conventions.push({
      type: "formatting",
      rule: `${fmtParts.join(", ")}, indent size ${dominantIndent}`,
      evidence: fmtEvidence.slice(0, 10),
      confidence: Math.min(0.7 + jsFiles.length * 0.02, 0.99),
    });

    // ── Test patterns ──
    const testAnalysis = _analyzeTestPatterns(files);
    if (testAnalysis.colocated + testAnalysis.separateDir > 0) {
      const testParts = [];
      if (testAnalysis.colocated > testAnalysis.separateDir) {
        testParts.push("co-located test files");
      } else {
        testParts.push("__tests__ directory");
      }
      testParts.push(`${testAnalysis.testSuffix}.js naming`);
      if (testAnalysis.testRunner) {
        testParts.push(`${testAnalysis.testRunner} runner`);
      }

      conventions.push({
        type: "test_style",
        rule: testParts.join(", "),
        evidence: files
          .filter((f) => /\.(test|spec)\.[jt]sx?$/.test(f.path))
          .map((f) => f.path)
          .slice(0, 10),
        confidence: 0.8,
      });
    }

    // ── Error handling ──
    let tryCatchCount = 0;
    let customErrorCount = 0;
    const errEvidence = [];

    for (const file of jsFiles) {
      const tc = (file.content.match(/\btry\s*\{/g) || []).length;
      const ce = (file.content.match(/\bextends\s+Error\b/g) || []).length;
      tryCatchCount += tc;
      customErrorCount += ce;
      if (tc > 0 || ce > 0) errEvidence.push(file.path);
    }

    if (tryCatchCount > 0 || customErrorCount > 0) {
      const errParts = [];
      if (tryCatchCount > 0) errParts.push("try/catch blocks");
      if (customErrorCount > 0) errParts.push("custom Error classes");
      conventions.push({
        type: "error_handling",
        rule: errParts.join(", "),
        evidence: errEvidence.slice(0, 10),
        confidence: Math.min(0.5 + tryCatchCount * 0.05, 0.95),
      });
    }

    // Store discovered conventions
    for (const conv of conventions) {
      this.learnConvention(conv);
    }

    // Determine project style label
    const styleTraits = [];
    if (totalRequire > totalImport) styleTraits.push("CommonJS");
    else if (totalImport > totalRequire) styleTraits.push("ESM");
    if (aggregatedFmt.semi > aggregatedFmt.noSemi)
      styleTraits.push("semicolons");
    if (aggregatedNaming.camelCase > aggregatedNaming.snake_case)
      styleTraits.push("camelCase");
    else if (aggregatedNaming.snake_case > aggregatedNaming.camelCase)
      styleTraits.push("snake_case");

    const projectStyle =
      styleTraits.length > 0 ? styleTraits.join(", ") : "standard";

    log.info("Conventions detected", {
      fileCount: jsFiles.length,
      conventionCount: conventions.length,
      projectStyle,
    });

    return { conventions, projectStyle };
  }

  // ─── Agent Context ──────────────────────────────────────

  /**
   * Build relevant memory context for a specific agent type.
   * @param {string} agentType — e.g. "coder", "tester", "devops", "planner"
   * @returns {string} Formatted context string for agent system prompt injection
   */
  getContextForAgent(agentType) {
    const sections = [];
    const conventions = this.getConventions();

    const type = agentType.toLowerCase();

    if (type === "coder") {
      // File conventions, naming patterns, frequently edited files
      const namingConv = conventions.filter(
        (c) => c.type === "naming" || c.type === "formatting",
      );
      if (namingConv.length > 0) {
        sections.push("## Code Conventions");
        for (const c of namingConv) {
          sections.push(
            `- ${c.type}: ${c.rule} (confidence: ${(c.confidence * 100).toFixed(0)}%)`,
          );
        }
      }

      const importConv = conventions.find((c) => c.type === "import_style");
      if (importConv) {
        sections.push(`- imports: ${importConv.rule}`);
      }

      const editPatterns = this.getPatterns("file_edit", 10);
      if (editPatterns.length > 0) {
        sections.push("\n## Frequently Edited Files");
        for (const p of editPatterns) {
          sections.push(`- ${p.target} (${p.frequency} edits)`);
        }
      }
    } else if (type === "tester") {
      const testConv = conventions.filter(
        (c) => c.type === "test_style" || c.type === "error_handling",
      );
      if (testConv.length > 0) {
        sections.push("## Test Conventions");
        for (const c of testConv) {
          sections.push(`- ${c.type}: ${c.rule}`);
        }
      }

      const testCommands = this.getPatterns("test_run", 5);
      if (testCommands.length > 0) {
        sections.push("\n## Common Test Commands");
        for (const p of testCommands) {
          sections.push(`- \`${p.target}\` (used ${p.frequency} times)`);
        }
      }
    } else if (type === "devops") {
      const commandPatterns = this.getPatterns("command", 10);
      if (commandPatterns.length > 0) {
        sections.push("## Common Commands");
        for (const p of commandPatterns) {
          sections.push(`- \`${p.target}\` (${p.frequency} runs)`);
        }
      }

      const buildPatterns = this.getPatterns("build", 5);
      if (buildPatterns.length > 0) {
        sections.push("\n## Build Patterns");
        for (const p of buildPatterns) {
          sections.push(`- ${p.action}: \`${p.target}\``);
        }
      }
    } else {
      // Generic: provide top conventions
      if (conventions.length > 0) {
        sections.push("## Project Conventions");
        for (const c of conventions.slice(0, 5)) {
          sections.push(`- ${c.type}: ${c.rule}`);
        }
      }
    }

    if (sections.length === 0) {
      return "";
    }

    return sections.join("\n");
  }

  // ─── Command Tracking ───────────────────────────────────

  /**
   * Record a command execution for learning.
   * @param {string} command — The full command string
   * @param {number} exitCode — Process exit code (0 = success)
   * @param {number} duration — Execution duration in milliseconds
   */
  recordCommand(command, exitCode, duration) {
    const commandHistory = this._load("command_history") || [];

    commandHistory.push({
      command,
      exitCode,
      duration,
      timestamp: new Date().toISOString(),
    });

    // Keep last 500 entries
    if (commandHistory.length > 500) {
      commandHistory.splice(0, commandHistory.length - 500);
    }

    this._store("command_history", commandHistory);

    // Also learn as a pattern
    this.learnPattern("command", {
      action: exitCode === 0 ? "success" : "failure",
      target: command,
      metadata: { exitCode, duration },
    });

    log.debug("Command recorded", {
      command: command.slice(0, 80),
      exitCode,
      duration,
    });
  }

  /**
   * Suggest commands based on partial input and command history.
   * @param {string} partial — Partial command input
   * @returns {Array<{ command: string, frequency: number, lastUsed: string, successRate: number }>}
   */
  suggestCommand(partial) {
    const commandPatterns = this.getPatterns("command", 100);
    if (!partial || partial.trim().length === 0) {
      // Return most frequent commands
      return commandPatterns.slice(0, 10).map((p) => ({
        command: p.target,
        frequency: p.frequency,
        lastUsed: p.lastUsed,
        successRate: p.metadata?.exitCode === 0 ? 1 : 0,
      }));
    }

    const lowerPartial = partial.toLowerCase();
    const matches = commandPatterns
      .filter((p) => p.target.toLowerCase().includes(lowerPartial))
      .sort((a, b) => {
        // Prioritize prefix matches
        const aPrefix = a.target.toLowerCase().startsWith(lowerPartial) ? 1 : 0;
        const bPrefix = b.target.toLowerCase().startsWith(lowerPartial) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;
        return (b.frequency || 0) - (a.frequency || 0);
      })
      .slice(0, 10);

    return matches.map((p) => ({
      command: p.target,
      frequency: p.frequency,
      lastUsed: p.lastUsed,
      successRate: p.metadata?.exitCode === 0 ? 1 : 0,
    }));
  }

  // ─── Project Profile ─────────────────────────────────────

  /**
   * Build a high-level project profile from all learned data.
   * @returns {{ primaryLanguage: string, frameworks: string[], testRunner: string|null, packageManager: string|null, buildTool: string|null, conventions: Array, frequentCommands: Array, recentFiles: Array }}
   */
  getProjectProfile() {
    const conventions = this.getConventions();
    const commandPatterns = this.getPatterns("command", 10);
    const filePatterns = this.getPatterns("file_edit", 20);

    // Determine primary language from file edits and conventions
    let primaryLanguage = "javascript";
    const importConv = conventions.find((c) => c.type === "import_style");
    if (importConv) {
      if (importConv.rule.includes("ES module")) {
        primaryLanguage = "javascript"; // could be TS too
      }
    }
    // Check file extensions in evidence
    const allEvidence = conventions.flatMap((c) => c.evidence || []);
    const tsFiles = allEvidence.filter((e) => /\.tsx?$/.test(e)).length;
    const jsFiles = allEvidence.filter((e) => /\.jsx?$/.test(e)).length;
    if (tsFiles > jsFiles) {
      primaryLanguage = "typescript";
    }

    // Detect frameworks from commands and file patterns
    const frameworks = [];
    const allTargets = [
      ...commandPatterns.map((p) => p.target),
      ...allEvidence,
    ].join(" ");

    if (/react/i.test(allTargets)) frameworks.push("react");
    if (/express/i.test(allTargets)) frameworks.push("express");
    if (/next/i.test(allTargets)) frameworks.push("next.js");
    if (/vue/i.test(allTargets)) frameworks.push("vue");
    if (/angular/i.test(allTargets)) frameworks.push("angular");
    if (/electron/i.test(allTargets)) frameworks.push("electron");

    // Test runner
    const testConv = conventions.find((c) => c.type === "test_style");
    let testRunner = null;
    if (testConv && testConv.rule) {
      if (testConv.rule.includes("jest")) testRunner = "jest";
      else if (testConv.rule.includes("vitest")) testRunner = "vitest";
      else if (testConv.rule.includes("mocha")) testRunner = "mocha";
    }

    // Package manager from commands
    let packageManager = null;
    const cmdTargets = commandPatterns.map((p) => p.target.toLowerCase());
    for (const cmd of cmdTargets) {
      if (/\bpnpm\b/.test(cmd)) {
        packageManager = "pnpm";
        break;
      }
      if (/\byarn\b/.test(cmd)) {
        packageManager = packageManager || "yarn";
      }
      if (/\bnpm\b/.test(cmd)) {
        packageManager = packageManager || "npm";
      }
    }

    // Build tool from commands
    let buildTool = null;
    for (const cmd of cmdTargets) {
      if (/\bwebpack\b/.test(cmd)) {
        buildTool = "webpack";
        break;
      }
      if (/\bvite\b/.test(cmd)) {
        buildTool = buildTool || "vite";
      }
      if (/\besbuild\b/.test(cmd)) {
        buildTool = buildTool || "esbuild";
      }
      if (/\brollup\b/.test(cmd)) {
        buildTool = buildTool || "rollup";
      }
      if (/\bturbopack\b/.test(cmd)) {
        buildTool = buildTool || "turbopack";
      }
    }

    return {
      primaryLanguage,
      frameworks,
      testRunner,
      packageManager,
      buildTool,
      conventions: conventions.slice(0, 5),
      frequentCommands: commandPatterns.slice(0, 10).map((p) => ({
        command: p.target,
        frequency: p.frequency,
      })),
      recentFiles: filePatterns.slice(0, 20).map((p) => ({
        path: p.target,
        frequency: p.frequency,
        lastUsed: p.lastUsed,
      })),
    };
  }

  // ─── Pruning ─────────────────────────────────────────────

  /**
   * Remove patterns and conventions older than maxAge.
   * @param {number} [maxAge] — Maximum age in milliseconds (default: 30 days)
   * @returns {{ prunedPatterns: number, prunedConventions: number }}
   */
  prune(maxAge = DEFAULT_PRUNE_MAX_AGE_MS) {
    const threshold = new Date(Date.now() - maxAge).toISOString();
    let prunedPatterns = 0;
    let prunedConventions = 0;

    // Prune patterns by category
    for (const category of VALID_CATEGORIES) {
      const patterns = this._load(`pattern:${category}`) || [];
      const before = patterns.length;
      const kept = patterns.filter((p) => {
        const lastUsed = p.lastUsed || "1970-01-01T00:00:00.000Z";
        return lastUsed >= threshold;
      });
      if (kept.length < before) {
        prunedPatterns += before - kept.length;
        this._store(`pattern:${category}`, kept);
      }
    }

    // Prune conventions
    const conventions = this._load("conventions") || [];
    const beforeConv = conventions.length;
    const keptConv = conventions.filter((c) => {
      const updated = c.updatedAt || c.createdAt || "1970-01-01T00:00:00.000Z";
      return updated >= threshold;
    });
    if (keptConv.length < beforeConv) {
      prunedConventions = beforeConv - keptConv.length;
      this._store("conventions", keptConv);
    }

    // Prune command history
    const commandHistory = this._load("command_history") || [];
    const keptHistory = commandHistory.filter((c) => c.timestamp >= threshold);
    if (keptHistory.length < commandHistory.length) {
      this._store("command_history", keptHistory);
    }

    log.info("Workspace memory pruned", {
      prunedPatterns,
      prunedConventions,
      maxAgeDays: Math.round(maxAge / (24 * 60 * 60 * 1000)),
    });

    return { prunedPatterns, prunedConventions };
  }
}

// ─── Utility ─────────────────────────────────────────────────

/**
 * Generate a simple hash for workspace identification.
 * @param {string} workspaceRoot
 * @returns {string}
 * @private
 */
function _hashWorkspace(workspaceRoot) {
  // Simple DJB2 hash — deterministic, fast, no crypto dependency
  let hash = 5381;
  const normalized = workspaceRoot.replace(/\\/g, "/").toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) & 0xffffffff;
  }
  return "ws_" + (hash >>> 0).toString(36);
}

module.exports = { WorkspaceMemory };
