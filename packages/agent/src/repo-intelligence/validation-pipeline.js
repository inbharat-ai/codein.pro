/**
 * Repo Intelligence — Validation Pipeline
 *
 * Post-mutation validation: after multi-file edits, run lint, typecheck,
 * and test commands to verify nothing is broken.
 *
 * Executes external tools (eslint, tsc, npm test, etc.) via child_process
 * and collects structured results.  Supports timeout + abort.
 *
 * Pure CJS, no core/ deps.
 */
"use strict";

const { execFile, spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { logger } = require("../logger");

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 120_000; // 2 minutes per step

/**
 * @typedef {Object} ValidationResult
 * @property {string} step - 'lint' | 'typecheck' | 'test' | 'custom'
 * @property {boolean} passed
 * @property {number} exitCode
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} durationMs
 * @property {Object[]} [issues] - Parsed issues (file, line, message, severity)
 */

/**
 * @typedef {Object} ValidationReport
 * @property {boolean} allPassed
 * @property {ValidationResult[]} results
 * @property {number} totalDurationMs
 * @property {string[]} failedSteps
 * @property {string} summary
 */

// ─── Validation Pipeline ────────────────────────────────────────────────────

class ValidationPipeline {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.timeout=120000] - Per-step timeout in ms
   * @param {boolean} [opts.stopOnFirstFailure=false] - Abort remaining steps on failure
   */
  constructor(opts = {}) {
    this.timeout = opts.timeout ?? DEFAULT_TIMEOUT;
    this.stopOnFirstFailure = opts.stopOnFirstFailure ?? false;
  }

  /**
   * Run the full validation pipeline on a workspace.
   *
   * @param {string} workspaceRoot - Absolute path to the project root
   * @param {Object} [opts]
   * @param {boolean} [opts.lint=true]
   * @param {boolean} [opts.typecheck=true]
   * @param {boolean} [opts.test=true]
   * @param {string[]} [opts.customCommands] - Additional shell commands to run
   * @param {string[]} [opts.changedFiles] - Only validate these files (when supported)
   * @returns {Promise<ValidationReport>}
   */
  async validate(workspaceRoot, opts = {}) {
    const startTime = Date.now();
    const results = [];
    const doLint = opts.lint !== false;
    const doTypecheck = opts.typecheck !== false;
    const doTest = opts.test !== false;

    logger.info("ValidationPipeline: starting", {
      workspaceRoot,
      lint: doLint,
      typecheck: doTypecheck,
      test: doTest,
    });

    // Detect project type
    const projectType = await detectProjectType(workspaceRoot);

    // 1. Lint
    if (doLint) {
      const lintResult = await this._runLint(
        workspaceRoot,
        projectType,
        opts.changedFiles,
      );
      results.push(lintResult);
      if (!lintResult.passed && this.stopOnFirstFailure) {
        return this._buildReport(results, startTime);
      }
    }

    // 2. Typecheck
    if (doTypecheck) {
      const typeResult = await this._runTypecheck(workspaceRoot, projectType);
      results.push(typeResult);
      if (!typeResult.passed && this.stopOnFirstFailure) {
        return this._buildReport(results, startTime);
      }
    }

    // 3. Tests
    if (doTest) {
      const testResult = await this._runTests(workspaceRoot, projectType);
      results.push(testResult);
      if (!testResult.passed && this.stopOnFirstFailure) {
        return this._buildReport(results, startTime);
      }
    }

    // 4. Custom commands
    if (Array.isArray(opts.customCommands)) {
      for (const cmd of opts.customCommands) {
        const customResult = await this._runCustom(workspaceRoot, cmd);
        results.push(customResult);
        if (!customResult.passed && this.stopOnFirstFailure) {
          return this._buildReport(results, startTime);
        }
      }
    }

    return this._buildReport(results, startTime);
  }

  /**
   * Quick syntax check only (faster than full validate).
   * @param {string} workspaceRoot
   * @returns {Promise<ValidationResult>}
   */
  async syntaxCheck(workspaceRoot) {
    const projectType = await detectProjectType(workspaceRoot);
    return this._runTypecheck(workspaceRoot, projectType);
  }

  // ─── Private: Lint ──────────────────────────────────────────────────────

  async _runLint(workspaceRoot, projectType, changedFiles) {
    let cmd, args;

    switch (projectType) {
      case "node":
      case "typescript": {
        // Prefer npx eslint
        const eslintConfig = findFile(workspaceRoot, [
          ".eslintrc.js",
          ".eslintrc.cjs",
          ".eslintrc.json",
          ".eslintrc.yml",
          ".eslintrc.yaml",
          ".eslintrc",
          "eslint.config.js",
          "eslint.config.mjs",
        ]);
        if (eslintConfig) {
          cmd = process.platform === "win32" ? "npx.cmd" : "npx";
          args = [
            "eslint",
            "--no-error-on-unmatched-pattern",
            "--format",
            "json",
          ];
          if (
            changedFiles &&
            changedFiles.length > 0 &&
            changedFiles.length <= 50
          ) {
            args.push(...changedFiles);
          } else {
            args.push(".");
          }
        } else {
          return this._skipResult("lint", "No ESLint config found");
        }
        break;
      }

      case "python": {
        cmd = "python";
        args = ["-m", "flake8", "--format", "default"];
        if (changedFiles && changedFiles.length > 0) {
          args.push(...changedFiles);
        } else {
          args.push(".");
        }
        break;
      }

      case "go": {
        cmd = "golint";
        args = ["./..."];
        break;
      }

      case "rust": {
        cmd = "cargo";
        args = ["clippy", "--message-format=json"];
        break;
      }

      default:
        return this._skipResult(
          "lint",
          `No linter configured for ${projectType}`,
        );
    }

    const result = await this._exec(cmd, args, workspaceRoot, "lint");

    // Parse lint output for issues
    if (projectType === "node" || projectType === "typescript") {
      result.issues = parseEslintJson(result.stdout);
    }

    return result;
  }

  // ─── Private: Typecheck ─────────────────────────────────────────────────

  async _runTypecheck(workspaceRoot, projectType) {
    let cmd, args;

    switch (projectType) {
      case "typescript": {
        const tsconfigPath = findFile(workspaceRoot, ["tsconfig.json"]);
        if (tsconfigPath) {
          cmd = process.platform === "win32" ? "npx.cmd" : "npx";
          args = ["tsc", "--noEmit", "--pretty", "false"];
        } else {
          return this._skipResult("typecheck", "No tsconfig.json found");
        }
        break;
      }

      case "python": {
        // Try mypy
        cmd = "python";
        args = ["-m", "mypy", "--no-error-summary", "."];
        break;
      }

      case "go": {
        cmd = "go";
        args = ["vet", "./..."];
        break;
      }

      case "rust": {
        cmd = "cargo";
        args = ["check", "--message-format=short"];
        break;
      }

      default:
        return this._skipResult(
          "typecheck",
          `No type checker for ${projectType}`,
        );
    }

    const result = await this._exec(cmd, args, workspaceRoot, "typecheck");

    // Parse TypeScript errors
    if (projectType === "typescript") {
      result.issues = parseTscOutput(result.stdout + "\n" + result.stderr);
    }

    return result;
  }

  // ─── Private: Tests ─────────────────────────────────────────────────────

  async _runTests(workspaceRoot, projectType) {
    let cmd, args;

    switch (projectType) {
      case "node":
      case "typescript": {
        // Detect test runner
        const pkgJson = readPackageJson(workspaceRoot);
        const hasJest =
          pkgJson?.devDependencies?.jest || pkgJson?.dependencies?.jest;
        const hasVitest =
          pkgJson?.devDependencies?.vitest || pkgJson?.dependencies?.vitest;
        const hasMocha =
          pkgJson?.devDependencies?.mocha || pkgJson?.dependencies?.mocha;
        const testScript = pkgJson?.scripts?.test;

        if (testScript) {
          // Use npm test (most reliable)
          cmd = process.platform === "win32" ? "npm.cmd" : "npm";
          args = ["test", "--", "--no-coverage"];
        } else if (hasVitest) {
          cmd = process.platform === "win32" ? "npx.cmd" : "npx";
          args = ["vitest", "run", "--no-coverage"];
        } else if (hasJest) {
          cmd = process.platform === "win32" ? "npx.cmd" : "npx";
          args = ["jest", "--no-coverage", "--json"];
        } else if (hasMocha) {
          cmd = process.platform === "win32" ? "npx.cmd" : "npx";
          args = ["mocha"];
        } else {
          return this._skipResult("test", "No test runner detected");
        }
        break;
      }

      case "python": {
        cmd = "python";
        args = ["-m", "pytest", "--tb=short", "-q"];
        break;
      }

      case "go": {
        cmd = "go";
        args = ["test", "./...", "-count=1"];
        break;
      }

      case "rust": {
        cmd = "cargo";
        args = ["test", "--no-fail-fast"];
        break;
      }

      default:
        return this._skipResult("test", `No test runner for ${projectType}`);
    }

    return this._exec(cmd, args, workspaceRoot, "test");
  }

  // ─── Private: Custom ────────────────────────────────────────────────────

  async _runCustom(workspaceRoot, command) {
    // Split command safely
    const parts = command.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    return this._exec(cmd, args, workspaceRoot, "custom");
  }

  // ─── Private: Execution ─────────────────────────────────────────────────

  /**
   * Execute a command and capture output.
   */
  async _exec(cmd, args, cwd, step) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd,
        timeout: this.timeout,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
        env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      const MAX_OUTPUT = 512 * 1024; // 512 KB cap per stream

      proc.stdout.on("data", (chunk) => {
        if (stdout.length < MAX_OUTPUT) stdout += chunk.toString();
      });
      proc.stderr.on("data", (chunk) => {
        if (stderr.length < MAX_OUTPUT) stderr += chunk.toString();
      });

      proc.on("error", (err) => {
        resolve({
          step,
          passed: false,
          exitCode: -1,
          stdout: "",
          stderr: err.message,
          durationMs: Date.now() - startTime,
          issues: [],
        });
      });

      proc.on("close", (code) => {
        resolve({
          step,
          passed: code === 0,
          exitCode: code ?? -1,
          stdout: stdout.slice(0, MAX_OUTPUT),
          stderr: stderr.slice(0, MAX_OUTPUT),
          durationMs: Date.now() - startTime,
          issues: [],
        });
      });
    });
  }

  _skipResult(step, reason) {
    return {
      step,
      passed: true, // Skip = not a failure
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 0,
      issues: [],
      skipped: true,
      skipReason: reason,
    };
  }

  _buildReport(results, startTime) {
    const totalDurationMs = Date.now() - startTime;
    const failedSteps = results.filter((r) => !r.passed).map((r) => r.step);
    const allPassed = failedSteps.length === 0;

    // Build summary
    const summaryParts = results.map((r) => {
      const status = r.skipped ? "SKIP" : r.passed ? "PASS" : "FAIL";
      const issues = r.issues?.length ? ` (${r.issues.length} issues)` : "";
      return `${r.step}: ${status} (${r.durationMs}ms)${issues}`;
    });

    const report = {
      allPassed,
      results,
      totalDurationMs,
      failedSteps,
      summary: summaryParts.join(" | "),
    };

    logger.info("ValidationPipeline: complete", {
      allPassed,
      failedSteps,
      totalDurationMs,
    });

    return report;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Detect project type from workspace contents.
 */
async function detectProjectType(workspaceRoot) {
  if (fs.existsSync(path.join(workspaceRoot, "tsconfig.json")))
    return "typescript";
  if (fs.existsSync(path.join(workspaceRoot, "package.json"))) return "node";
  if (fs.existsSync(path.join(workspaceRoot, "Cargo.toml"))) return "rust";
  if (fs.existsSync(path.join(workspaceRoot, "go.mod"))) return "go";
  if (
    fs.existsSync(path.join(workspaceRoot, "setup.py")) ||
    fs.existsSync(path.join(workspaceRoot, "pyproject.toml")) ||
    fs.existsSync(path.join(workspaceRoot, "requirements.txt"))
  )
    return "python";
  if (
    fs.existsSync(path.join(workspaceRoot, "pom.xml")) ||
    fs.existsSync(path.join(workspaceRoot, "build.gradle"))
  )
    return "java";
  return "unknown";
}

function findFile(dir, candidates) {
  for (const name of candidates) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function readPackageJson(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Parse ESLint JSON output into structured issues.
 */
function parseEslintJson(output) {
  try {
    const data = JSON.parse(output);
    if (!Array.isArray(data)) return [];
    const issues = [];
    for (const file of data) {
      for (const msg of file.messages || []) {
        issues.push({
          file: file.filePath,
          line: msg.line,
          column: msg.column,
          message: msg.message,
          severity: msg.severity === 2 ? "error" : "warning",
          ruleId: msg.ruleId,
        });
      }
    }
    return issues;
  } catch {
    return [];
  }
}

/**
 * Parse TypeScript compiler output into structured issues.
 */
function parseTscOutput(output) {
  const issues = [];
  // Format: file(line,col): error TSxxxx: message
  const re = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/gm;
  let m;
  while ((m = re.exec(output)) !== null) {
    issues.push({
      file: m[1],
      line: parseInt(m[2], 10),
      column: parseInt(m[3], 10),
      message: m[5],
      severity: m[4],
    });
  }
  return issues;
}

module.exports = { ValidationPipeline, detectProjectType };
