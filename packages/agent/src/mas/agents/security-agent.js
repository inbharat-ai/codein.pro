/**
 * CodIn MAS — Security Agent
 *
 * OWASP scanning, dependency audit, secret detection, security analysis.
 * Uses tool registry for file reading, npm audit, and regex-based scanning.
 */
"use strict";

const pathModule = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");

const execFileAsync = promisify(execFile);

const AUDIT_COMMANDS = new Set([
  "npm",
  "npm.cmd",
  "npx",
  "npx.cmd",
  "pnpm",
  "pnpm.cmd",
  "yarn",
  "yarn.cmd",
]);

// Regex patterns for detecting hardcoded secrets
const SECRET_PATTERNS = [
  {
    name: "AWS Access Key",
    pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
    severity: "critical",
  },
  {
    name: "AWS Secret Key",
    pattern:
      /(?:aws_secret_access_key|AWS_SECRET)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    severity: "critical",
  },
  {
    name: "Generic API Key",
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]([A-Za-z0-9_\-]{20,})['"]?/gi,
    severity: "high",
  },
  {
    name: "Generic Secret",
    pattern:
      /(?:secret|password|passwd|token)\s*[:=]\s*['"]([^'"]{8,})['"](?!\s*(?:process|env|config|option|param|arg|type|interface))/gi,
    severity: "high",
  },
  {
    name: "Private Key",
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    severity: "critical",
  },
  {
    name: "GitHub Token",
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    severity: "critical",
  },
  {
    name: "Slack Token",
    pattern: /xox[baprs]-[0-9]{10,}-[A-Za-z0-9-]+/g,
    severity: "critical",
  },
  {
    name: "JWT Token",
    pattern:
      /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_\-]{10,}/g,
    severity: "high",
  },
  {
    name: "Hardcoded Password",
    pattern:
      /(?:password|pwd)\s*[:=]\s*['"](?![\s{}$])([^'"]{4,})['"](?!\s*(?:\|\||&&|;|$))/gi,
    severity: "high",
  },
  {
    name: "Bearer Token",
    pattern: /['"]Bearer\s+[A-Za-z0-9._\-]{20,}['"]/g,
    severity: "high",
  },
];

// File extensions to skip during secret scanning
const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
  ".zip",
  ".tar",
  ".gz",
  ".lock",
  ".min.js",
  ".min.css",
  ".map",
]);

const SYSTEM_PROMPT = `You are the CodIn Security Agent. You analyze code for vulnerabilities.

RULES:
1. Check for OWASP Top 10 vulnerabilities (injection, XSS, SSRF, broken auth, etc.)
2. Audit dependencies for known CVEs
3. Identify hardcoded secrets and credentials
4. Check for insecure defaults and missing input validation
5. Provide actionable remediation steps with severity ratings

SEVERITY LEVELS: critical, high, medium, low, info

You have tools to read files, run npm audit, scan for secrets, and check dependencies.
Use them systematically: scan relevant files, run audits, then synthesize findings.

OUTPUT FORMAT (JSON):
{
  "result": "Security analysis summary",
  "findings": [
    {
      "severity": "high",
      "category": "OWASP category",
      "location": "file:line",
      "description": "What's wrong",
      "remediation": "How to fix it"
    }
  ],
  "overallRisk": "low|medium|high|critical",
  "confidence": 0.0-1.0
}`;

class SecurityAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.SECURITY,
        constraints: {
          network: false,
          write: false,
          commands: true,
          git: false,
          mcp: false,
        },
      },
      deps,
    );
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  describeCapabilities() {
    return "OWASP vulnerability scanning, dependency audit, security analysis, credential detection.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_READ,
      `Security agent scanning: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Perform security analysis:

TASK: ${node.goal}

CONTEXT:
${context.workspaceSummary || "No workspace context."}
${context.repoContext?.context ? `REPO CONTEXT:\n${String(context.repoContext.context).slice(0, 6000)}` : ""}
${context.previousResults ? `PREVIOUS RESULTS:\n${context.previousResults.slice(0, 1000)}` : ""}

FOCUS AREAS:
${context.focusAreas || "OWASP Top 10, hardcoded secrets, insecure defaults, dependency vulnerabilities"}

Use the available tools to scan files, run audits, and detect secrets. Then provide a structured vulnerability report.`;

    const toolRegistry = this._getToolRegistry(context, node);

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry, {
        maxIterations: 8,
      });
      return {
        result: result.answer,
        toolLog: result.toolLog,
        confidence: 0.85,
      };
    } else {
      const result = await this.callLLMJson(prompt);
      return {
        result: result.result || "Security analysis complete",
        findings: result.findings || [],
        overallRisk: result.overallRisk || "unknown",
        confidence: result.confidence || 0.7,
      };
    }
  }

  /**
   * Build tool registry for security scanning
   * @private
   */
  _getToolRegistry(context, node) {
    const registry = {};
    const workspaceRoot = this._resolveWorkspaceRoot(context);

    // ─── read_file ─────────────────────────────────────────
    registry.read_file = {
      description: "Read the contents of a file for security analysis",
      execute: async (args) => {
        const { path } = args || {};
        if (!path || typeof path !== "string") {
          throw new Error("path is required");
        }
        const targetPath = this._resolveSafePath(workspaceRoot, path);
        const content = await fs.readFile(targetPath, "utf8");
        return content.slice(0, 120000);
      },
    };

    // ─── run_audit ─────────────────────────────────────────
    registry.run_audit = {
      description:
        "Run npm audit (or pnpm/yarn audit) and return vulnerability report as JSON. Args: { manager?: 'npm'|'pnpm'|'yarn' }",
      execute: async (args) => {
        const manager = (args && args.manager) || "npm";
        const cmd = process.platform === "win32" ? `${manager}.cmd` : manager;

        if (!AUDIT_COMMANDS.has(cmd)) {
          throw new Error(`Package manager not allowed: ${manager}`);
        }

        const perm = await this.requestPermission(
          node.id,
          PERMISSION_TYPE.COMMAND_RUN,
          `Security tool run_audit: ${manager} audit --json`,
        );
        if (perm.decision !== PERMISSION_DECISION.APPROVED) {
          throw new Error(`Audit command denied: ${perm.reason}`);
        }

        try {
          const { stdout, stderr } = await execFileAsync(
            cmd,
            ["audit", "--json"],
            {
              cwd: workspaceRoot,
              timeout: 60000,
              maxBuffer: 1024 * 1024,
              windowsHide: true,
            },
          );
          // npm audit exits with non-zero when vulnerabilities found,
          // but that's handled by catch below
          return this._summarizeAudit(stdout || stderr);
        } catch (err) {
          // npm audit returns exit code > 0 when vulns are found
          if (err.stdout) {
            return this._summarizeAudit(err.stdout);
          }
          throw new Error(`Audit failed: ${err.message}`);
        }
      },
    };

    // ─── scan_secrets ──────────────────────────────────────
    registry.scan_secrets = {
      description:
        "Scan a file or directory for hardcoded secrets (API keys, passwords, tokens). Args: { path: string }",
      execute: async (args) => {
        const { path: targetPath } = args || {};
        if (!targetPath || typeof targetPath !== "string") {
          throw new Error("path is required");
        }

        const resolved = this._resolveSafePath(workspaceRoot, targetPath);
        const stat = await fs.stat(resolved);
        const findings = [];

        if (stat.isDirectory()) {
          await this._scanDirectoryForSecrets(
            resolved,
            workspaceRoot,
            findings,
            0,
          );
        } else {
          await this._scanFileForSecrets(resolved, workspaceRoot, findings);
        }

        if (findings.length === 0) {
          return "No hardcoded secrets detected.";
        }

        return JSON.stringify(
          {
            secretsFound: findings.length,
            findings: findings.slice(0, 50), // Cap output
          },
          null,
          2,
        );
      },
    };

    // ─── scan_dependencies ─────────────────────────────────
    registry.scan_dependencies = {
      description:
        "Check package.json for known risky or deprecated packages. Args: { path?: string } (defaults to 'package.json')",
      execute: async (args) => {
        const pkgPath = (args && args.path) || "package.json";
        const resolved = this._resolveSafePath(workspaceRoot, pkgPath);
        const raw = await fs.readFile(resolved, "utf8");
        const pkg = JSON.parse(raw);

        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        const warnings = [];

        // Known risky/deprecated packages
        const riskyPackages = {
          "event-stream": {
            severity: "critical",
            reason: "Known malicious versions (flatmap-stream incident)",
          },
          "ua-parser-js": {
            severity: "high",
            reason: "Had supply chain attack in v0.7.29",
          },
          coa: {
            severity: "high",
            reason: "Had supply chain attack in v2.0.3+",
          },
          rc: { severity: "high", reason: "Had supply chain attack" },
          colors: {
            severity: "medium",
            reason: "Maintainer sabotaged v1.4.1+",
          },
          faker: { severity: "medium", reason: "Maintainer sabotaged v6.6.6+" },
          request: {
            severity: "low",
            reason: "Deprecated — use node-fetch, axios, or undici",
          },
          querystring: {
            severity: "low",
            reason: "Deprecated — use URLSearchParams",
          },
          uuid: {
            severity: "info",
            reason: "Ensure version >= 9.x for crypto.randomUUID",
          },
        };

        for (const [name, version] of Object.entries(allDeps)) {
          if (riskyPackages[name]) {
            warnings.push({
              package: name,
              version,
              ...riskyPackages[name],
            });
          }

          // Flag wildcard or latest versions
          if (version === "*" || version === "latest") {
            warnings.push({
              package: name,
              version,
              severity: "high",
              reason: "Unpinned version — vulnerable to supply chain attacks",
            });
          }

          // Flag git dependencies
          if (
            typeof version === "string" &&
            (version.startsWith("git") || version.startsWith("github:"))
          ) {
            warnings.push({
              package: name,
              version,
              severity: "medium",
              reason: "Git dependency — not auditable via npm audit",
            });
          }
        }

        if (warnings.length === 0) {
          return "No known risky dependencies detected.";
        }

        return JSON.stringify(
          {
            totalDeps: Object.keys(allDeps).length,
            warnings: warnings.length,
            details: warnings,
          },
          null,
          2,
        );
      },
    };

    return registry;
  }

  /**
   * Summarize npm audit JSON output into a readable report.
   * @private
   */
  _summarizeAudit(rawJson) {
    try {
      const audit = JSON.parse(rawJson);
      const meta = audit.metadata || {};
      const vulns = audit.vulnerabilities || {};

      const summary = {
        totalDependencies: meta.totalDependencies || 0,
        vulnerabilities: meta.vulnerabilities || {},
        details: [],
      };

      for (const [name, info] of Object.entries(vulns)) {
        summary.details.push({
          package: name,
          severity: info.severity || "unknown",
          title: info.title || info.name || name,
          range: info.range || "unknown",
          fixAvailable: !!info.fixAvailable,
        });
      }

      // Cap the output
      if (summary.details.length > 30) {
        summary.details = summary.details.slice(0, 30);
        summary.truncated = true;
      }

      return JSON.stringify(summary, null, 2);
    } catch {
      // If JSON parse fails, return raw (truncated)
      return rawJson.slice(0, 10000);
    }
  }

  /**
   * Recursively scan a directory for secrets, with depth limit.
   * @private
   */
  async _scanDirectoryForSecrets(dir, workspaceRoot, findings, depth) {
    if (depth > 5 || findings.length > 100) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (findings.length > 100) break;

      // Skip common non-source directories
      if (
        entry.isDirectory() &&
        [
          "node_modules",
          ".git",
          "dist",
          "build",
          ".next",
          "coverage",
          "__pycache__",
          ".venv",
        ].includes(entry.name)
      ) {
        continue;
      }

      const fullPath = pathModule.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._scanDirectoryForSecrets(
          fullPath,
          workspaceRoot,
          findings,
          depth + 1,
        );
      } else if (entry.isFile()) {
        const ext = pathModule.extname(entry.name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) continue;
        await this._scanFileForSecrets(fullPath, workspaceRoot, findings);
      }
    }
  }

  /**
   * Scan a single file for secret patterns.
   * @private
   */
  async _scanFileForSecrets(filePath, workspaceRoot, findings) {
    try {
      const stat = await fs.stat(filePath);
      // Skip files > 500KB
      if (stat.size > 500 * 1024) return;

      const content = await fs.readFile(filePath, "utf8");
      const relativePath = pathModule.relative(workspaceRoot, filePath);
      const lines = content.split("\n");

      for (const secretDef of SECRET_PATTERNS) {
        // Reset regex lastIndex
        secretDef.pattern.lastIndex = 0;
        let match;
        while ((match = secretDef.pattern.exec(content)) !== null) {
          // Find line number
          const beforeMatch = content.slice(0, match.index);
          const lineNum = beforeMatch.split("\n").length;

          // Skip if inside a comment that looks like documentation
          const line = lines[lineNum - 1] || "";
          if (line.trim().startsWith("//") && line.includes("example"))
            continue;
          if (line.trim().startsWith("*") && line.includes("example")) continue;

          // Skip .env.example and similar template files
          if (
            relativePath.includes(".example") ||
            relativePath.includes(".template")
          )
            continue;

          findings.push({
            type: secretDef.name,
            severity: secretDef.severity,
            file: relativePath,
            line: lineNum,
            snippet: line.trim().slice(0, 100),
          });

          // One finding per pattern per file is enough
          break;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  // ─── Path safety (same pattern as CoderAgent) ──────────

  _resolveWorkspaceRoot(context) {
    const candidate =
      context?.workspaceRoot || context?.workspacePath || process.cwd();
    return pathModule.resolve(candidate);
  }

  _resolveSafePath(workspaceRoot, relativePath) {
    const resolved = pathModule.resolve(workspaceRoot, relativePath);
    const rootWithSep = workspaceRoot.endsWith(pathModule.sep)
      ? workspaceRoot
      : workspaceRoot + pathModule.sep;
    if (resolved !== workspaceRoot && !resolved.startsWith(rootWithSep)) {
      throw new Error("Path traversal detected");
    }
    return resolved;
  }
}

module.exports = { SecurityAgent };
