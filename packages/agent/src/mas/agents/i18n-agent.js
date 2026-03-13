/**
 * CodIn MAS — I18N Agent
 *
 * Handles internationalization: extracts strings from JSX/TSX,
 * creates/updates translation files, and validates locale coverage.
 */
"use strict";

const pathModule = require("node:path");
const fs = require("node:fs/promises");
const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");
const {
  buildToolRegistry,
  resolveWorkspaceRoot,
  resolveSafePath,
} = require("../tool-registry");

// Regex patterns for extracting user-facing strings from JSX/TSX
const STRING_EXTRACTION_PATTERNS = [
  { name: "jsx_text", pattern: />([A-Z][^<>{]*?[a-z][^<>{}]*?)</g },
  {
    name: "jsx_attr",
    pattern:
      /(?:title|placeholder|label|alt|aria-label|description|message|tooltip|helperText)\s*=\s*"([^"]{2,})"/g,
  },
  {
    name: "template_literal",
    pattern:
      /(?:alert|confirm|prompt|toast|notify|showMessage)\s*\(\s*[`'"]([A-Z][^`'"]{5,})[`'"]/g,
  },
  {
    name: "ui_string",
    pattern:
      /(?:message|title|label|heading|description|buttonText|placeholder|errorMsg|successMsg|warningMsg)\s*[:=]\s*['"]([A-Z][^'"]{3,})['"]/g,
  },
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  ".venv",
  "__tests__",
  "__mocks__",
]);

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
  ".d.ts",
]);

const SCANNABLE_EXTENSIONS = new Set([
  ".jsx",
  ".tsx",
  ".js",
  ".ts",
  ".vue",
  ".svelte",
]);

const SYSTEM_PROMPT = `You are the CodIn I18N Agent. You handle internationalization and localization.

RULES:
1. Extract user-facing strings into translation keys
2. Create/update locale JSON or YAML files
3. Wrap UI text in i18n function calls (t(), $t(), intl.formatMessage, etc.)
4. Maintain consistent key naming conventions
5. Flag hardcoded strings that should be localized

You have tools to read files, write locale files, extract strings from source code,
and validate locale coverage. Use them systematically.

OUTPUT FORMAT (JSON):
{
  "result": "Summary of i18n changes made",
  "files": [
    {
      "path": "relative/path/to/file",
      "action": "create|edit",
      "content": "File content or description of changes"
    }
  ],
  "locales": ["en", "hi", "ta"],
  "keysAdded": 0,
  "confidence": 0.0-1.0
}`;

class I18nAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.I18N,
        constraints: {
          network: false,
          write: true,
          commands: false,
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
    return "Extracts strings, creates locale files, wraps text in i18n calls.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_READ,
      `I18N agent reading files: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Internationalization task:

TASK: ${node.goal}

CONTEXT:
${context.workspaceSummary || "No workspace context."}
${context.repoContext?.context ? `REPO CONTEXT:\n${String(context.repoContext.context).slice(0, 6000)}` : ""}
${context.previousResults ? `PREVIOUS RESULTS:\n${context.previousResults.slice(0, 1000)}` : ""}

Use the available tools to:
1. Extract user-facing strings from source files
2. Create or update locale JSON files
3. Validate locale coverage
Then provide a structured summary of changes.`;

    // Build standard read/write from central registry
    const toolRegistry = buildToolRegistry(this, context, node, {
      tools: ["read_file", "write_file"],
      agentLabel: "I18N",
    });

    // Add I18N-specific tools
    const workspaceRoot = resolveWorkspaceRoot(context);
    toolRegistry.extract_strings =
      this._createExtractStringsTool(workspaceRoot);
    toolRegistry.validate_locales =
      this._createValidateLocalesTool(workspaceRoot);

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry, {
        maxIterations: 8,
      });
      return {
        result: result.answer,
        toolLog: result.toolLog,
        confidence: this.computeConfidence(result, context),
      };
    } else {
      const result = await this.callLLMJson(prompt);
      return {
        result: result.result || "I18N changes applied",
        files: result.files || [],
        locales: result.locales || [],
        keysAdded: result.keysAdded || 0,
        confidence: result.confidence || 0.75,
      };
    }
  }

  /** @private */
  _createExtractStringsTool(workspaceRoot) {
    return {
      description:
        "Extract user-facing strings from JSX/TSX/Vue files. Args: { path: string } (file or directory)",
      execute: async (args) => {
        const { path: targetPath } = args || {};
        if (!targetPath || typeof targetPath !== "string") {
          throw new Error("path is required");
        }

        const resolved = resolveSafePath(workspaceRoot, targetPath);
        const stat = await fs.stat(resolved);
        const extracted = [];

        if (stat.isDirectory()) {
          await this._extractFromDirectory(
            resolved,
            workspaceRoot,
            extracted,
            0,
          );
        } else {
          await this._extractFromFile(resolved, workspaceRoot, extracted);
        }

        if (extracted.length === 0) {
          return "No extractable user-facing strings found.";
        }

        const seen = new Set();
        const unique = extracted.filter((item) => {
          if (seen.has(item.string)) return false;
          seen.add(item.string);
          return true;
        });

        const withKeys = unique.map((item) => ({
          ...item,
          suggestedKey: this._generateKey(item.string),
        }));

        return JSON.stringify(
          {
            totalFound: extracted.length,
            unique: withKeys.length,
            strings: withKeys.slice(0, 100),
          },
          null,
          2,
        );
      },
    };
  }

  /** @private */
  _createValidateLocalesTool(workspaceRoot) {
    return {
      description:
        "Validate locale files for missing keys and inconsistencies. Args: { localeDir: string, baseLocale?: string }",
      execute: async (args) => {
        const { localeDir, baseLocale } = args || {};
        if (!localeDir || typeof localeDir !== "string") {
          throw new Error("localeDir is required");
        }

        const resolved = resolveSafePath(workspaceRoot, localeDir);
        const base = baseLocale || "en";

        let entries;
        try {
          entries = await fs.readdir(resolved, { withFileTypes: true });
        } catch {
          throw new Error(`Cannot read locale directory: ${localeDir}`);
        }

        const locales = {};
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const ext = pathModule.extname(entry.name).toLowerCase();
          if (ext !== ".json") continue;
          const localeName = pathModule.basename(entry.name, ext);
          try {
            const content = await fs.readFile(
              pathModule.join(resolved, entry.name),
              "utf8",
            );
            locales[localeName] = this._flattenKeys(JSON.parse(content));
          } catch (err) {
            locales[localeName] = { _parseError: err.message };
          }
        }

        if (Object.keys(locales).length === 0) {
          return "No locale JSON files found in directory.";
        }

        const baseKeys = locales[base];
        if (!baseKeys) {
          return `Base locale "${base}" not found. Available: ${Object.keys(locales).join(", ")}`;
        }
        if (baseKeys._parseError) {
          return `Base locale "${base}" has parse error: ${baseKeys._parseError}`;
        }

        const baseKeySet = new Set(Object.keys(baseKeys));
        const report = {
          baseLocale: base,
          baseKeyCount: baseKeySet.size,
          locales: {},
        };

        for (const [name, keys] of Object.entries(locales)) {
          if (name === base) continue;
          if (keys._parseError) {
            report.locales[name] = { error: keys._parseError };
            continue;
          }
          const localeKeySet = new Set(Object.keys(keys));
          const missing = [...baseKeySet].filter((k) => !localeKeySet.has(k));
          const extra = [...localeKeySet].filter((k) => !baseKeySet.has(k));
          report.locales[name] = {
            keyCount: localeKeySet.size,
            coverage: `${((1 - missing.length / baseKeySet.size) * 100).toFixed(1)}%`,
            missingKeys: missing.slice(0, 30),
            extraKeys: extra.slice(0, 15),
          };
        }

        return JSON.stringify(report, null, 2);
      },
    };
  }

  /** @private */
  async _extractFromDirectory(dir, workspaceRoot, results, depth) {
    if (depth > 5 || results.length > 200) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length > 200) break;
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const fullPath = pathModule.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._extractFromDirectory(
          fullPath,
          workspaceRoot,
          results,
          depth + 1,
        );
      } else if (entry.isFile()) {
        const ext = pathModule.extname(entry.name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) continue;
        if (!SCANNABLE_EXTENSIONS.has(ext)) continue;
        await this._extractFromFile(fullPath, workspaceRoot, results);
      }
    }
  }

  /** @private */
  async _extractFromFile(filePath, workspaceRoot, results) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 500 * 1024) return;
      const content = await fs.readFile(filePath, "utf8");
      const relativePath = pathModule.relative(workspaceRoot, filePath);
      for (const patternDef of STRING_EXTRACTION_PATTERNS) {
        patternDef.pattern.lastIndex = 0;
        let match;
        while ((match = patternDef.pattern.exec(content)) !== null) {
          const str = match[1] || match[0];
          if (str.length < 3) continue;
          if (/^https?:\/\//.test(str)) continue;
          if (/^[a-z]+(-[a-z]+)+$/.test(str)) continue;
          if (/^[A-Z_]+$/.test(str)) continue;
          if (/^\d+$/.test(str)) continue;
          const beforeMatch = content.slice(0, match.index);
          const lineNum = beforeMatch.split("\n").length;
          results.push({
            string: str.trim(),
            file: relativePath,
            line: lineNum,
            source: patternDef.name,
          });
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  /** @private */
  _generateKey(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join("_");
  }

  /** @private */
  _flattenKeys(obj, prefix = "") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(result, this._flattenKeys(value, fullKey));
      } else {
        result[fullKey] = value;
      }
    }
    return result;
  }
}

module.exports = { I18nAgent };
