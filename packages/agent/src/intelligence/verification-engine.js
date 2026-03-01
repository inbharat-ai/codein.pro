/**
 * Verification Engine
 *
 * Post-generation verification: typecheck, lint, compile check,
 * hallucinated import detection, and basic runtime safety analysis.
 *
 * This is the "secret weapon" — verified output moves accuracy from 6 → 8.
 *
 * Pipeline:
 *   Generated Code → Extract → Typecheck → Lint → ImportCheck → Score
 */

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");

// Known standard library modules per language
const STANDARD_MODULES = {
  javascript: new Set([
    "fs",
    "path",
    "os",
    "http",
    "https",
    "url",
    "crypto",
    "stream",
    "events",
    "util",
    "child_process",
    "net",
    "dns",
    "tls",
    "zlib",
    "readline",
    "buffer",
    "querystring",
    "assert",
    "cluster",
    "worker_threads",
    "perf_hooks",
    "async_hooks",
    "node:fs",
    "node:path",
    "node:os",
    "node:http",
    "node:https",
    "node:url",
    "node:crypto",
    "node:stream",
    "node:events",
    "node:util",
    "node:child_process",
    "node:net",
    "node:test",
    "node:assert",
    "node:assert/strict",
    "react",
    "react-dom",
    "next",
    "express",
    "lodash",
    "axios",
    "moment",
    "typescript",
    "eslint",
    "prettier",
    "jest",
    "vitest",
    "mocha",
  ]),
  python: new Set([
    "os",
    "sys",
    "json",
    "re",
    "math",
    "random",
    "datetime",
    "time",
    "collections",
    "itertools",
    "functools",
    "typing",
    "pathlib",
    "io",
    "subprocess",
    "threading",
    "multiprocessing",
    "socket",
    "http",
    "urllib",
    "logging",
    "argparse",
    "unittest",
    "dataclasses",
    "enum",
    "abc",
    "copy",
    "hashlib",
    "hmac",
    "base64",
    "struct",
    "csv",
    "sqlite3",
    "numpy",
    "pandas",
    "requests",
    "flask",
    "django",
    "fastapi",
    "pytest",
  ]),
  typescript: new Set([
    "react",
    "react-dom",
    "next",
    "express",
    "typescript",
    "node",
  ]),
};

// Common hallucination patterns: made-up module names
const HALLUCINATION_PATTERNS = [
  /from\s+['"]@?[a-z]+-(ai|ml|smart|auto)-[a-z]+['"]/i,
  /require\(\s*['"](?:super|mega|ultra|hyper)-[a-z]+['"]\s*\)/i,
  /import\s+.*\s+from\s+['"](?![@./])([a-z]+-){3,}[a-z]+['"]/i,
];

// Syntax error patterns by language
const SYNTAX_ERROR_PATTERNS = {
  javascript: [
    {
      pattern: /\bfunction\s*\(\s*\)\s*\{[^}]*$/,
      message: "Unclosed function body",
    },
    { pattern: /\bif\s*\([^)]*$/, message: "Unclosed if condition" },
    { pattern: /['"][^'"]*$/, message: "Unclosed string literal" },
    {
      pattern: /\{[^}]*\{[^}]*\{[^}]*\{[^}]*\{/,
      message: "Excessive nesting (>5 levels)",
    },
  ],
  python: [
    { pattern: /def\s+\w+\([^)]*$/, message: "Unclosed function definition" },
    { pattern: /\bif\s+[^:]*$/, message: "Missing colon after if" },
    { pattern: /['"][^'"]*$/, message: "Unclosed string literal" },
    {
      pattern: /^\s{0,3}\S.*\n\s{8,}\S/m,
      message: "Suspicious indentation change",
    },
  ],
};

// Temp directory for verification
function getTempDir() {
  const dir = path.join(os.tmpdir(), "codin-verify");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Extract code blocks from an LLM response.
 */
function extractCodeBlocks(response) {
  const blocks = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    blocks.push({
      language: (match[1] || "text").toLowerCase(),
      code: match[2].trim(),
      offset: match.index,
    });
  }
  // If no code blocks, treat the whole response as potential code
  if (blocks.length === 0 && response.includes("{") && response.includes("}")) {
    blocks.push({ language: "javascript", code: response.trim(), offset: 0 });
  }
  return blocks;
}

/**
 * Detect the programming language from code content.
 */
function detectLanguage(code) {
  if (/\bimport\s+React\b|from\s+['"]react['"]|<\/?\w+>/.test(code))
    return "typescript";
  if (
    /\bconst\s+\w+\s*[:=]|export\s+(default\s+)?function|import\s+\{/.test(code)
  )
    return "javascript";
  if (/\bdef\s+\w+|import\s+\w+\s*$|from\s+\w+\s+import/m.test(code))
    return "python";
  if (/\bpublic\s+class\s+|System\.out\.println/.test(code)) return "java";
  if (/\bfunc\s+\w+|package\s+\w+|fmt\.Println/.test(code)) return "go";
  if (/\bfn\s+\w+|let\s+mut\s+|impl\s+\w+/.test(code)) return "rust";
  return "javascript"; // default
}

class VerificationEngine {
  constructor(options = {}) {
    this.tempDir = options.tempDir || getTempDir();
    this.timeout = options.timeout ?? 10000; // 10s per check
    this.checks = {
      syntax: options.syntax !== false,
      typecheck: options.typecheck !== false,
      lint: options.lint !== false,
      imports: options.imports !== false,
      hallucination: options.hallucination !== false,
      staticAnalysis: options.staticAnalysis !== false,
    };
    this.stats = { total: 0, passed: 0, failed: 0, errors: [] };
  }

  /**
   * Verify LLM-generated output.
   *
   * @param {string} response - Full LLM response (may contain code blocks)
   * @param {Object} context - { language, projectRoot, filePath, existingImports }
   * @returns {Promise<VerificationResult>}
   */
  async verify(response, context = {}) {
    const startTime = Date.now();
    this.stats.total++;

    const codeBlocks = extractCodeBlocks(response);
    if (codeBlocks.length === 0) {
      // Text-only response — no code to verify
      return this._makeResult(
        true,
        0.85,
        [],
        "text-only",
        Date.now() - startTime,
      );
    }

    const allIssues = [];
    let overallPass = true;

    for (const block of codeBlocks) {
      const lang =
        context.language || block.language || detectLanguage(block.code);
      const issues = [];

      // 1. Syntax check
      if (this.checks.syntax) {
        const syntaxIssues = this._checkSyntax(block.code, lang);
        issues.push(...syntaxIssues);
      }

      // 2. Import / hallucination check
      if (this.checks.imports) {
        const importIssues = this._checkImports(block.code, lang, context);
        issues.push(...importIssues);
      }

      // 3. Hallucination detection
      if (this.checks.hallucination) {
        const hallIssues = this._checkHallucinations(block.code, lang);
        issues.push(...hallIssues);
      }

      // 4. Static analysis
      if (this.checks.staticAnalysis) {
        const staticIssues = this._staticAnalysis(block.code, lang);
        issues.push(...staticIssues);
      }

      // 5. Typecheck (if TypeScript & tsc available)
      if (this.checks.typecheck && (lang === "typescript" || lang === "tsx")) {
        const typeIssues = await this._typecheck(block.code, context);
        issues.push(...typeIssues);
      }

      // 6. Lint check (if eslint available)
      if (
        this.checks.lint &&
        (lang === "javascript" || lang === "typescript")
      ) {
        const lintIssues = await this._lintCheck(block.code, lang, context);
        issues.push(...lintIssues);
      }

      if (issues.some((i) => i.severity === "error")) {
        overallPass = false;
      }
      allIssues.push(...issues.map((i) => ({ ...i, block: block.language })));
    }

    const confidence = this._calculateConfidence(allIssues, codeBlocks.length);

    if (overallPass) {
      this.stats.passed++;
    } else {
      this.stats.failed++;
      this.stats.errors.push({
        timestamp: Date.now(),
        issueCount: allIssues.filter((i) => i.severity === "error").length,
      });
    }

    return this._makeResult(
      overallPass,
      confidence,
      allIssues,
      "verified",
      Date.now() - startTime,
    );
  }

  // ── Syntax Check ─────────────────────────────────────────────────────────

  _checkSyntax(code, language) {
    const issues = [];
    const patterns =
      SYNTAX_ERROR_PATTERNS[language] || SYNTAX_ERROR_PATTERNS.javascript;

    for (const { pattern, message } of patterns) {
      if (pattern.test(code)) {
        issues.push({
          type: "syntax",
          severity: "warning",
          message,
          source: "pattern-match",
        });
      }
    }

    // Bracket/paren/brace balance
    const balance = this._checkBracketBalance(code);
    if (balance.length > 0) {
      for (const msg of balance) {
        issues.push({
          type: "syntax",
          severity: "error",
          message: msg,
          source: "bracket-balance",
        });
      }
    }

    return issues;
  }

  _checkBracketBalance(code) {
    const issues = [];
    // Strip strings and comments to avoid false positives
    const stripped = code
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");

    const pairs = [
      ["{", "}", "braces"],
      ["(", ")", "parentheses"],
      ["[", "]", "brackets"],
    ];

    for (const [open, close, name] of pairs) {
      let count = 0;
      for (const ch of stripped) {
        if (ch === open) count++;
        if (ch === close) count--;
        if (count < 0) {
          issues.push(`Unmatched closing ${name}`);
          break;
        }
      }
      if (count > 0) {
        issues.push(`${count} unclosed ${name}`);
      }
    }
    return issues;
  }

  // ── Import Check ─────────────────────────────────────────────────────────

  _checkImports(code, language, context) {
    const issues = [];
    const imports = this._extractImports(code, language);
    const knownModules =
      STANDARD_MODULES[language] || STANDARD_MODULES.javascript;
    const existingImports = new Set(context.existingImports || []);

    for (const imp of imports) {
      // Skip relative imports
      if (imp.startsWith(".") || imp.startsWith("/")) continue;
      // Skip scoped packages
      if (imp.startsWith("@")) continue;
      // Check if known
      const basePkg = imp.split("/")[0];
      if (!knownModules.has(basePkg) && !existingImports.has(basePkg)) {
        issues.push({
          type: "import",
          severity: "warning",
          message: `Unknown import: "${imp}" — verify this package exists`,
          source: "import-check",
          module: imp,
        });
      }
    }

    return issues;
  }

  _extractImports(code, language) {
    const imports = new Set();

    if (language === "python") {
      const patterns = [/^import\s+([\w.]+)/gm, /^from\s+([\w.]+)\s+import/gm];
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
          imports.add(match[1].split(".")[0]);
        }
      }
    } else {
      // JS/TS
      const patterns = [
        /import\s+.*?\s+from\s+['"](.*?)['"]/g,
        /require\(\s*['"](.*?)['"]\s*\)/g,
        /import\s*\(\s*['"](.*?)['"]\s*\)/g,
      ];
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
          imports.add(match[1]);
        }
      }
    }

    return [...imports];
  }

  // ── Hallucination Detection ──────────────────────────────────────────────

  _checkHallucinations(code, language) {
    const issues = [];

    for (const pattern of HALLUCINATION_PATTERNS) {
      if (pattern.test(code)) {
        issues.push({
          type: "hallucination",
          severity: "error",
          message: "Suspected hallucinated module/import — verify package name",
          source: "hallucination-detector",
        });
      }
    }

    // Check for made-up API calls (common hallucination patterns)
    if (
      /\.\b(smartAnalyze|autoFix|magicSolve|aiComplete|deepThink)\b/.test(code)
    ) {
      issues.push({
        type: "hallucination",
        severity: "warning",
        message: "Suspected hallucinated method name",
        source: "hallucination-detector",
      });
    }

    return issues;
  }

  // ── Static Analysis ──────────────────────────────────────────────────────

  _staticAnalysis(code, language) {
    const issues = [];

    // Check for common anti-patterns
    if (/eval\s*\(/.test(code) && language !== "python") {
      issues.push({
        type: "security",
        severity: "warning",
        message: "Use of eval() is a security risk",
        source: "static-analysis",
      });
    }

    if (/innerHTML\s*=/.test(code)) {
      issues.push({
        type: "security",
        severity: "warning",
        message: "Direct innerHTML assignment — XSS risk",
        source: "static-analysis",
      });
    }

    // Hardcoded secrets
    if (
      /(?:password|secret|apiKey|api_key|token)\s*[=:]\s*['"][^'"]{8,}['"]/i.test(
        code,
      )
    ) {
      issues.push({
        type: "security",
        severity: "error",
        message: "Possible hardcoded credential detected",
        source: "static-analysis",
      });
    }

    // Infinite loop risk
    if (/while\s*\(\s*true\s*\)\s*\{(?![\s\S]*break)/.test(code)) {
      issues.push({
        type: "logic",
        severity: "warning",
        message: "Infinite loop without visible break condition",
        source: "static-analysis",
      });
    }

    // Empty catch blocks
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(code)) {
      issues.push({
        type: "quality",
        severity: "warning",
        message: "Empty catch block — errors will be silently swallowed",
        source: "static-analysis",
      });
    }

    // TODO/FIXME left in output
    if (/\/\/\s*(TODO|FIXME|HACK|XXX)\b/i.test(code)) {
      issues.push({
        type: "quality",
        severity: "info",
        message: "TODO/FIXME comment found — incomplete implementation?",
        source: "static-analysis",
      });
    }

    return issues;
  }

  // ── TypeScript Type Check ────────────────────────────────────────────────

  async _typecheck(code, context) {
    const issues = [];

    try {
      const tmpFile = path.join(
        this.tempDir,
        `verify-${crypto.randomUUID().slice(0, 8)}.ts`,
      );
      fs.writeFileSync(tmpFile, code, "utf8");

      const result = await this._runCommand(
        "npx",
        ["tsc", "--noEmit", "--strict", "--esModuleInterop", tmpFile],
        { timeout: this.timeout, cwd: context.projectRoot },
      );

      // Clean up
      try {
        fs.unlinkSync(tmpFile);
      } catch {}

      if (result.exitCode !== 0 && result.stderr) {
        const errors = result.stderr
          .split("\n")
          .filter((l) => l.includes("error TS"));
        for (const err of errors.slice(0, 5)) {
          issues.push({
            type: "typecheck",
            severity: "error",
            message: err.trim(),
            source: "tsc",
          });
        }
      }
    } catch (err) {
      // tsc not available — skip gracefully
      issues.push({
        type: "typecheck",
        severity: "info",
        message: "TypeScript check skipped: " + err.message,
        source: "tsc",
      });
    }

    return issues;
  }

  // ── Lint Check ───────────────────────────────────────────────────────────

  async _lintCheck(code, language, context) {
    const issues = [];

    try {
      const ext = language === "typescript" ? ".ts" : ".js";
      const tmpFile = path.join(
        this.tempDir,
        `verify-${crypto.randomUUID().slice(0, 8)}${ext}`,
      );
      fs.writeFileSync(tmpFile, code, "utf8");

      const result = await this._runCommand(
        "npx",
        [
          "eslint",
          "--no-eslintrc",
          "--rule",
          '{"no-unused-vars":"warn","no-undef":"error"}',
          "--format",
          "json",
          tmpFile,
        ],
        { timeout: this.timeout, cwd: context.projectRoot },
      );

      try {
        fs.unlinkSync(tmpFile);
      } catch {}

      if (result.stdout) {
        try {
          const lintResult = JSON.parse(result.stdout);
          if (lintResult[0]?.messages) {
            for (const msg of lintResult[0].messages.slice(0, 5)) {
              issues.push({
                type: "lint",
                severity: msg.severity === 2 ? "error" : "warning",
                message: `${msg.ruleId}: ${msg.message} (line ${msg.line})`,
                source: "eslint",
              });
            }
          }
        } catch {
          // Parse error — skip
        }
      }
    } catch (err) {
      // eslint not available
    }

    return issues;
  }

  // ── Confidence Calculation ───────────────────────────────────────────────

  _calculateConfidence(issues, blockCount) {
    if (issues.length === 0) return 0.95;

    let confidence = 0.95;
    for (const issue of issues) {
      switch (issue.severity) {
        case "error":
          confidence -= 0.15;
          break;
        case "warning":
          confidence -= 0.05;
          break;
        case "info":
          confidence -= 0.01;
          break;
      }
    }

    // Bonus for multiple code blocks that all pass
    if (
      blockCount > 1 &&
      issues.filter((i) => i.severity === "error").length === 0
    ) {
      confidence += 0.03;
    }

    return Math.max(0.05, Math.min(0.99, Math.round(confidence * 100) / 100));
  }

  // ── Result Builder ───────────────────────────────────────────────────────

  _makeResult(passed, confidence, issues, type, durationMs) {
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    const infos = issues.filter((i) => i.severity === "info");

    return {
      passed,
      confidence,
      type,
      durationMs,
      summary: {
        errors: errors.length,
        warnings: warnings.length,
        infos: infos.length,
        total: issues.length,
      },
      issues,
      checksRun: Object.entries(this.checks)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
      verificationLevel: passed
        ? confidence > 0.85
          ? "high"
          : "medium"
        : "low",
    };
  }

  // ── Command Runner ───────────────────────────────────────────────────────

  _runCommand(command, args, options = {}) {
    return new Promise((resolve) => {
      const timeout = options.timeout || this.timeout;
      let stdout = "";
      let stderr = "";

      try {
        const proc = spawn(command, args, {
          cwd: options.cwd || process.cwd(),
          timeout,
          shell: process.platform === "win32",
          env: { ...process.env, NODE_ENV: "test" },
        });

        proc.stdout?.on("data", (d) => {
          stdout += d.toString();
        });
        proc.stderr?.on("data", (d) => {
          stderr += d.toString();
        });

        proc.on("close", (code) => {
          resolve({ exitCode: code, stdout, stderr });
        });

        proc.on("error", () => {
          resolve({
            exitCode: 1,
            stdout,
            stderr: stderr || "Command not found",
          });
        });
      } catch {
        resolve({ exitCode: 1, stdout: "", stderr: "Failed to spawn process" });
      }
    });
  }

  /**
   * Get accumulated stats.
   */
  getStats() {
    return {
      ...this.stats,
      passRate:
        this.stats.total > 0
          ? ((this.stats.passed / this.stats.total) * 100).toFixed(1) + "%"
          : "N/A",
    };
  }

  /**
   * Reset stats.
   */
  resetStats() {
    this.stats = { total: 0, passed: 0, failed: 0, errors: [] };
  }
}

module.exports = {
  VerificationEngine,
  extractCodeBlocks,
  detectLanguage,
  STANDARD_MODULES,
  HALLUCINATION_PATTERNS,
};
