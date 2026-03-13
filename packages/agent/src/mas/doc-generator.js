/**
 * CodIn MAS — Documentation Generator
 *
 * Handles documentation generation, PR descriptions, commit messages, and
 * changelog generation. Natural extensions of coding that don't require
 * dedicated agent types. Rule-based when possible, LLM-assisted for complex
 * or creative tasks.
 *
 * @module doc-generator
 */
"use strict";

const path = require("node:path");
const { createLogger } = require("./logger");

const log = createLogger("DocGenerator");

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Conventional commit types with metadata for rendering.
 * @type {Record<string, {emoji: string, description: string, changelogSection: string}>}
 */
const COMMIT_TYPES = Object.freeze({
  feat: {
    emoji: "\u2728",
    description: "New feature",
    changelogSection: "Added",
  },
  fix: {
    emoji: "\uD83D\uDC1B",
    description: "Bug fix",
    changelogSection: "Fixed",
  },
  refactor: {
    emoji: "\u267B\uFE0F",
    description: "Code refactoring",
    changelogSection: "Changed",
  },
  docs: {
    emoji: "\uD83D\uDCDD",
    description: "Documentation",
    changelogSection: "Documentation",
  },
  test: { emoji: "\u2705", description: "Tests", changelogSection: "Testing" },
  chore: {
    emoji: "\uD83D\uDD27",
    description: "Maintenance",
    changelogSection: "Maintenance",
  },
  style: {
    emoji: "\uD83D\uDC84",
    description: "Style/formatting",
    changelogSection: "Style",
  },
  perf: {
    emoji: "\u26A1",
    description: "Performance",
    changelogSection: "Performance",
  },
  ci: {
    emoji: "\uD83D\uDC77",
    description: "CI/CD",
    changelogSection: "CI/CD",
  },
  build: {
    emoji: "\uD83D\uDCE6",
    description: "Build system",
    changelogSection: "Build",
  },
  revert: {
    emoji: "\u23EA",
    description: "Revert",
    changelogSection: "Reverted",
  },
});

/**
 * Maps file-path glob patterns to likely commit types.
 * Evaluated in order — first match wins.
 * @type {Record<string, string>}
 */
const FILE_TYPE_INDICATORS = Object.freeze({
  "*.test.*": "test",
  "*.spec.*": "test",
  "*.md": "docs",
  Dockerfile: "ci",
  ".github/*": "ci",
  "*.css": "style",
  "*.scss": "style",
  "package.json": "chore",
});

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Minimatch-style glob test (very simplified — supports * and leading dot).
 * @param {string} pattern - Glob pattern from FILE_TYPE_INDICATORS
 * @param {string} filePath - File path to test
 * @returns {boolean}
 */
function _matchGlob(pattern, filePath) {
  const base = path.basename(filePath);
  const normalized = filePath.replace(/\\/g, "/");

  // Exact filename match (e.g. "Dockerfile", "package.json")
  if (!pattern.includes("*")) {
    if (base === pattern) return true;
    // Also check directory-prefixed (e.g. ".github/*")
    return false;
  }

  // Directory wildcard — ".github/*"
  if (pattern.includes("/")) {
    const dir = pattern.split("/")[0];
    return normalized.includes(`${dir}/`);
  }

  // Extension wildcard — "*.test.*", "*.md", "*.css"
  // Convert to regex: *.test.* → /^.*\.test\..*$/
  const escaped = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(base);
}

/**
 * Extract changed file paths from a unified diff string.
 * @param {string} diff
 * @returns {string[]}
 */
function _extractFilePaths(diff) {
  const files = [];
  const lines = diff.split("\n");
  for (const line of lines) {
    // "+++ b/some/path" or "--- a/some/path"
    const m = line.match(/^(?:\+\+\+|---) [ab]\/(.+)/);
    if (m && m[1] !== "/dev/null") {
      const fp = m[1];
      if (!files.includes(fp)) files.push(fp);
    }
  }
  return files;
}

/**
 * Estimate the "complexity" of a diff — line count of actual changes.
 * @param {string} diff
 * @returns {{added: number, removed: number, total: number}}
 */
function _diffStats(diff) {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed, total: added + removed };
}

/**
 * Derive the most likely scope from an array of file paths.
 * Uses the deepest common directory, or the most frequent top-level dir.
 * @param {string[]} files
 * @returns {string|null}
 */
function _deriveScope(files) {
  if (!files.length) return null;
  if (files.length === 1) {
    const parts = files[0].replace(/\\/g, "/").split("/");
    // Use parent directory or filename sans extension
    if (parts.length > 1) return parts[parts.length - 2];
    return path.basename(files[0], path.extname(files[0]));
  }

  // Find deepest common prefix
  const split = files.map((f) => f.replace(/\\/g, "/").split("/"));
  const minLen = Math.min(...split.map((s) => s.length));
  let common = [];
  for (let i = 0; i < minLen; i++) {
    const seg = split[0][i];
    if (split.every((s) => s[i] === seg)) {
      common.push(seg);
    } else {
      break;
    }
  }

  // If common prefix is meaningful, use last segment
  if (common.length > 0) return common[common.length - 1];

  // Fallback: most frequent top-level directory
  const counts = {};
  for (const f of files) {
    const top = f.replace(/\\/g, "/").split("/")[0];
    counts[top] = (counts[top] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Build a subject line from stats and file info (≤72 chars).
 * @param {string} type
 * @param {string|null} scope
 * @param {string[]} files
 * @param {{added: number, removed: number}} stats
 * @returns {string}
 */
function _buildSubject(type, scope, files, stats) {
  if (files.length === 1) {
    const base = path.basename(files[0]);
    const verb =
      stats.removed === 0 ? "add" : stats.added === 0 ? "remove" : "update";
    return `${verb} ${base}`;
  }
  const verb =
    stats.removed === 0 ? "add" : stats.added === 0 ? "remove" : "update";
  return `${verb} ${files.length} files`;
}

/**
 * Truncate a string to a maximum length, appending ellipsis if trimmed.
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
function _truncate(s, max) {
  return s.length <= max ? s : s.slice(0, max - 3) + "...";
}

/**
 * Format a date as YYYY-MM-DD.
 * @param {Date} d
 * @returns {string}
 */
function _isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  DocGenerator class                                                 */
/* ------------------------------------------------------------------ */

/**
 * Documentation and commit-message generator.
 * Uses rule-based heuristics when possible, LLM for complex or creative work.
 */
class DocGenerator {
  /**
   * @param {object} opts
   * @param {Function|null} opts.runLLM - LLM invocation function (may be null for offline ops)
   */
  constructor({ runLLM = null } = {}) {
    /** @type {Function|null} */
    this._runLLM = runLLM;
  }

  /* ---------------------------------------------------------------- */
  /*  generateCommitMessage                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Generate a conventional commit message from a git diff.
   *
   * For small / obvious diffs the message is produced entirely rule-based.
   * Complex diffs are forwarded to the LLM for a higher-quality result.
   *
   * @param {string} diff - Unified diff string
   * @param {object} [opts]
   * @param {"conventional"|"angular"|"simple"} [opts.style="conventional"]
   * @returns {Promise<{type: string, scope: string|null, subject: string, body: string, fullMessage: string, breaking: boolean}>}
   */
  async generateCommitMessage(diff, opts = {}) {
    const style = opts.style || "conventional";
    const files = _extractFilePaths(diff);
    const stats = _diffStats(diff);
    const analysis = this.analyzeCommitType(diff);

    const type = analysis.type;
    const scope = analysis.scope;

    // Threshold: if the diff is small and the type detection is confident,
    // skip the LLM entirely.
    const isSimple = stats.total <= 30 && analysis.confidence >= 0.7;

    let subject;
    let body = "";
    let breaking = false;

    if (isSimple || !this._runLLM) {
      // Rule-based
      subject = _truncate(_buildSubject(type, scope, files, stats), 72);
      if (stats.total > 10) {
        body = `${stats.added} insertion(s), ${stats.removed} deletion(s) across ${files.length} file(s).`;
      }
      breaking =
        diff.includes("BREAKING CHANGE") || diff.includes("BREAKING-CHANGE");
      log.debug("Rule-based commit message generated", {
        type,
        scope,
        subject,
      });
    } else {
      // LLM-assisted
      const prompt = [
        "Generate a conventional commit message for this diff.",
        `Style: ${style}. Return ONLY a JSON object with keys: type, scope (nullable), subject (≤72 chars), body (optional paragraph), breaking (boolean).`,
        "---",
        diff.length > 8000 ? diff.slice(0, 8000) + "\n... (truncated)" : diff,
      ].join("\n");

      try {
        const raw = await this._runLLM(prompt);
        const parsed = _safeParseLLMJson(raw);
        if (parsed) {
          subject = _truncate(String(parsed.subject || ""), 72);
          body = parsed.body || "";
          breaking = Boolean(parsed.breaking);
          log.debug("LLM commit message generated", {
            type: parsed.type || type,
            scope,
          });
          // Prefer LLM type if valid
          const llmType = parsed.type;
          if (llmType && COMMIT_TYPES[llmType]) {
            return _formatCommitResult(
              llmType,
              parsed.scope || scope,
              subject,
              body,
              breaking,
              style,
            );
          }
        } else {
          // Fallback — LLM returned unparseable output
          subject = _truncate(_buildSubject(type, scope, files, stats), 72);
          log.warn(
            "LLM returned unparseable commit JSON; falling back to rule-based",
          );
        }
      } catch (err) {
        log.warn(
          "LLM call failed for commit message; falling back to rule-based",
          { error: err.message },
        );
        subject = _truncate(_buildSubject(type, scope, files, stats), 72);
      }
    }

    return _formatCommitResult(type, scope, subject, body, breaking, style);
  }

  /* ---------------------------------------------------------------- */
  /*  generatePRDescription                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Generate a pull-request description with summary, changes, test plan,
   * and review checklist.
   *
   * @param {object} opts
   * @param {string}   opts.title       - PR title
   * @param {string}   opts.diff        - Unified diff
   * @param {string[]} [opts.commits]   - List of commit messages
   * @param {string}   [opts.baseBranch] - e.g. "main"
   * @param {string}   [opts.headBranch] - e.g. "feat/login"
   * @param {string}   [opts.template]  - Optional PR template
   * @returns {Promise<{title: string, body: string, labels: string[], reviewers: string[]}>}
   */
  async generatePRDescription(opts) {
    const {
      title,
      diff,
      commits = [],
      baseBranch = "main",
      headBranch = "",
      template = "",
    } = opts;
    const files = _extractFilePaths(diff);
    const stats = _diffStats(diff);

    // Derive labels from changed file types
    const labels = _deriveLabels(files);

    if (!this._runLLM) {
      // Offline / rule-based fallback
      const body = _buildRuleBasedPRBody({
        title,
        files,
        stats,
        commits,
        baseBranch,
        headBranch,
        template,
      });
      return { title, body, labels, reviewers: [] };
    }

    const commitList = commits.length
      ? commits.map((c) => `- ${c}`).join("\n")
      : "(no commits provided)";

    const prompt = [
      "Generate a pull request description. Return ONLY a JSON object with keys:",
      "  title (string), body (markdown string), labels (string[]), reviewers (string[]).",
      "",
      `PR title: ${title}`,
      `Base branch: ${baseBranch}`,
      `Head branch: ${headBranch}`,
      `Files changed (${files.length}): ${files.slice(0, 20).join(", ")}${files.length > 20 ? "..." : ""}`,
      `Stats: +${stats.added} -${stats.removed}`,
      "",
      "Commits:",
      commitList,
      "",
      "The body MUST include these sections in markdown:",
      "## Summary  (3-5 bullet points)",
      "## Changes  (grouped by area)",
      "## Test Plan  (checklist)",
      "## Review Checklist  (checklist)",
      template ? `\nUse this PR template as a guide:\n${template}` : "",
      "",
      "Diff (truncated):",
      diff.length > 6000 ? diff.slice(0, 6000) + "\n... (truncated)" : diff,
    ].join("\n");

    try {
      const raw = await this._runLLM(prompt);
      const parsed = _safeParseLLMJson(raw);
      if (parsed && parsed.body) {
        return {
          title: parsed.title || title,
          body: parsed.body,
          labels: Array.isArray(parsed.labels) ? parsed.labels : labels,
          reviewers: Array.isArray(parsed.reviewers) ? parsed.reviewers : [],
        };
      }
    } catch (err) {
      log.warn(
        "LLM call failed for PR description; falling back to rule-based",
        { error: err.message },
      );
    }

    // Fallback
    const body = _buildRuleBasedPRBody({
      title,
      files,
      stats,
      commits,
      baseBranch,
      headBranch,
      template,
    });
    return { title, body, labels, reviewers: [] };
  }

  /* ---------------------------------------------------------------- */
  /*  generateChangelog                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Generate a changelog from an array of commit messages.
   * Entirely rule-based — no LLM needed.
   *
   * @param {object} opts
   * @param {string[]}  opts.commits     - Raw commit message strings
   * @param {string}    [opts.fromVersion] - e.g. "1.2.0"
   * @param {string}    [opts.toVersion]   - e.g. "1.3.0"
   * @param {"keepachangelog"|"angular"|"simple"} [opts.style="keepachangelog"]
   * @returns {{markdown: string, version: string, date: string, sections: Array<{title: string, items: string[]}>}}
   */
  generateChangelog(opts) {
    const {
      commits = [],
      fromVersion = "",
      toVersion = "Unreleased",
      style = "keepachangelog",
    } = opts;
    const date = _isoDate(new Date());

    // Parse each commit and bucket into sections
    /** @type {Record<string, string[]>} */
    const buckets = {};

    for (const msg of commits) {
      const parsed = this.parseConventionalCommit(msg);
      const commitType = parsed.type || "chore";
      const meta = COMMIT_TYPES[commitType] || COMMIT_TYPES.chore;
      const section = meta.changelogSection;

      if (!buckets[section]) buckets[section] = [];

      const scopePrefix = parsed.scope ? `**${parsed.scope}:** ` : "";
      const breakingMark = parsed.breaking ? " **BREAKING**" : "";
      buckets[section].push(`${scopePrefix}${parsed.subject}${breakingMark}`);
    }

    // Build ordered sections (features first, then fixes, then rest)
    const sectionOrder = [
      "Added",
      "Fixed",
      "Changed",
      "Performance",
      "Documentation",
      "Testing",
      "Style",
      "CI/CD",
      "Build",
      "Maintenance",
      "Reverted",
    ];

    /** @type {Array<{title: string, items: string[]}>} */
    const sections = [];
    for (const sec of sectionOrder) {
      if (buckets[sec] && buckets[sec].length) {
        sections.push({ title: sec, items: buckets[sec] });
      }
    }

    // Render markdown
    let markdown;
    switch (style) {
      case "angular":
        markdown = _renderAngularChangelog(toVersion, date, sections);
        break;
      case "simple":
        markdown = _renderSimpleChangelog(toVersion, date, sections);
        break;
      case "keepachangelog":
      default:
        markdown = _renderKeepAChangelog(
          toVersion,
          date,
          sections,
          fromVersion,
        );
        break;
    }

    log.debug("Changelog generated", {
      commits: commits.length,
      sections: sections.length,
      style,
    });
    return { markdown, version: toVersion, date, sections };
  }

  /* ---------------------------------------------------------------- */
  /*  generateAPIDoc                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Generate API documentation for a code string.
   * Extracts functions/classes via regex, then uses LLM for rich docstrings.
   *
   * @param {string} code - Source code
   * @param {string} [language="javascript"] - Language identifier
   * @returns {Promise<{documentation: string, functions: Array<{name: string, params: string[], returnType: string}>, classes: Array<{name: string, methods: string[]}>}>}
   */
  async generateAPIDoc(code, language = "javascript") {
    const functions = _extractFunctions(code, language);
    const classes = _extractClasses(code, language);

    if (!this._runLLM) {
      // Offline: produce skeleton docs
      const documentation = _buildSkeletonAPIDocs(functions, classes, language);
      return { documentation, functions, classes };
    }

    const prompt = [
      `Generate API documentation in ${language} doc-comment style for the following code.`,
      "Return ONLY a JSON object with keys:",
      "  documentation (full markdown string),",
      "  functions (array of {name, params: string[], returnType}),",
      "  classes (array of {name, methods: string[]}).",
      "",
      "Code:",
      code.length > 10000 ? code.slice(0, 10000) + "\n// ... truncated" : code,
    ].join("\n");

    try {
      const raw = await this._runLLM(prompt);
      const parsed = _safeParseLLMJson(raw);
      if (parsed && parsed.documentation) {
        return {
          documentation: parsed.documentation,
          functions: Array.isArray(parsed.functions)
            ? parsed.functions
            : functions,
          classes: Array.isArray(parsed.classes) ? parsed.classes : classes,
        };
      }
    } catch (err) {
      log.warn("LLM call failed for API doc; falling back to skeleton", {
        error: err.message,
      });
    }

    const documentation = _buildSkeletonAPIDocs(functions, classes, language);
    return { documentation, functions, classes };
  }

  /* ---------------------------------------------------------------- */
  /*  generateREADME                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Generate a README.md from project information.
   *
   * @param {object} projectInfo
   * @param {string}  projectInfo.name
   * @param {string}  [projectInfo.description]
   * @param {object}  [projectInfo.packageJson]
   * @param {string}  [projectInfo.structure] - Directory tree string
   * @param {string}  [projectInfo.existingReadme] - Existing README to improve
   * @returns {Promise<{markdown: string, sections: string[]}>}
   */
  async generateREADME(projectInfo) {
    const {
      name,
      description = "",
      packageJson = {},
      structure = "",
      existingReadme = "",
    } = projectInfo;

    if (!this._runLLM) {
      const { markdown, sections } = _buildRuleBasedREADME(
        name,
        description,
        packageJson,
        structure,
      );
      return { markdown, sections };
    }

    const pkgSummary = packageJson
      ? JSON.stringify(
          {
            name: packageJson.name,
            version: packageJson.version,
            description: packageJson.description,
            scripts: packageJson.scripts
              ? Object.keys(packageJson.scripts)
              : [],
            dependencies: packageJson.dependencies
              ? Object.keys(packageJson.dependencies)
              : [],
          },
          null,
          2,
        )
      : "{}";

    const prompt = [
      "Generate a comprehensive README.md. Return ONLY a JSON object with keys:",
      "  markdown (the full README string), sections (array of section heading strings).",
      "",
      `Project name: ${name}`,
      `Description: ${description}`,
      "",
      "package.json summary:",
      pkgSummary,
      "",
      structure ? `Directory structure:\n${structure}` : "",
      existingReadme
        ? `Existing README to improve:\n${existingReadme.slice(0, 3000)}`
        : "",
      "",
      "Include sections: Title with badges, Description, Features, Installation, Usage, API (if applicable), Contributing, License.",
    ].join("\n");

    try {
      const raw = await this._runLLM(prompt);
      const parsed = _safeParseLLMJson(raw);
      if (parsed && parsed.markdown) {
        return {
          markdown: parsed.markdown,
          sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        };
      }
    } catch (err) {
      log.warn("LLM call failed for README; falling back to rule-based", {
        error: err.message,
      });
    }

    const { markdown, sections } = _buildRuleBasedREADME(
      name,
      description,
      packageJson,
      structure,
    );
    return { markdown, sections };
  }

  /* ---------------------------------------------------------------- */
  /*  analyzeCommitType (rule-based, no LLM)                           */
  /* ---------------------------------------------------------------- */

  /**
   * Determine the most likely conventional commit type from a diff
   * using rule-based heuristics. No LLM involved.
   *
   * @param {string} diff - Unified diff string
   * @returns {{type: string, confidence: number, scope: string|null}}
   */
  analyzeCommitType(diff) {
    const files = _extractFilePaths(diff);
    const stats = _diffStats(diff);

    if (!files.length) {
      return { type: "chore", confidence: 0.3, scope: null };
    }

    const scope = _deriveScope(files);

    // Map each file to its indicator type
    const typeCounts = {};
    for (const fp of files) {
      for (const [pattern, commitType] of Object.entries(
        FILE_TYPE_INDICATORS,
      )) {
        if (_matchGlob(pattern, fp)) {
          typeCounts[commitType] = (typeCounts[commitType] || 0) + 1;
          break; // first match wins per file
        }
      }
    }

    // Check for new-file-only diffs (all lines are additions, no deletions
    // of existing code — indicates "feat")
    const hasNewFiles = diff.includes("new file mode");
    const allFilesNew =
      hasNewFiles && !diff.includes("deleted file mode") && stats.removed === 0;

    // All test files → "test"
    if (typeCounts.test && typeCounts.test === files.length) {
      return { type: "test", confidence: 0.95, scope };
    }

    // All doc files → "docs"
    if (typeCounts.docs && typeCounts.docs === files.length) {
      return { type: "docs", confidence: 0.95, scope };
    }

    // All style files → "style"
    if (typeCounts.style && typeCounts.style === files.length) {
      return { type: "style", confidence: 0.9, scope };
    }

    // All CI files → "ci"
    if (typeCounts.ci && typeCounts.ci === files.length) {
      return { type: "ci", confidence: 0.9, scope };
    }

    // Only package.json / lock files → "chore"
    if (typeCounts.chore && typeCounts.chore === files.length) {
      return { type: "chore", confidence: 0.85, scope };
    }

    // Brand-new files (no deletions) → "feat"
    if (allFilesNew) {
      return { type: "feat", confidence: 0.85, scope };
    }

    // Check for renames / moves
    if (diff.includes("rename from") && diff.includes("rename to")) {
      return { type: "refactor", confidence: 0.8, scope };
    }

    // Small changes in existing files → likely "fix"
    if (stats.total <= 15 && stats.added > 0 && stats.removed > 0) {
      return { type: "fix", confidence: 0.6, scope };
    }

    // Default: if there are additions, lean toward "feat"
    if (stats.added > stats.removed) {
      return { type: "feat", confidence: 0.5, scope };
    }

    return { type: "refactor", confidence: 0.4, scope };
  }

  /* ---------------------------------------------------------------- */
  /*  parseConventionalCommit                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Parse a conventional commit message string into its components.
   *
   * Handles formats:
   *   - "feat(auth): add login"
   *   - "fix!: critical bug"
   *   - "chore: update deps"
   *   - "feat(api)!: breaking change\n\nBody paragraph\n\nBREAKING CHANGE: details"
   *
   * @param {string} message
   * @returns {{type: string, scope: string|null, subject: string, body: string, footer: string, breaking: boolean}}
   */
  parseConventionalCommit(message) {
    const lines = message.trim().split("\n");
    const header = lines[0] || "";

    // Regex: type(scope)!: subject
    const headerRe = /^(\w+)(?:\(([^)]*)\))?(!)?\s*:\s*(.*)$/;
    const m = header.match(headerRe);

    if (!m) {
      // Not a conventional commit — treat entire first line as subject
      return {
        type: "chore",
        scope: null,
        subject: header,
        body: lines.slice(1).join("\n").trim(),
        footer: "",
        breaking: false,
      };
    }

    const type = m[1];
    const scope = m[2] || null;
    const bangBreaking = m[3] === "!";
    const subject = m[4].trim();

    // Separate body from footer (footer starts after a blank line and
    // contains tokens like "BREAKING CHANGE:", "Signed-off-by:", etc.)
    let body = "";
    let footer = "";
    if (lines.length > 1) {
      // Skip blank line after header
      const rest = lines.slice(1).join("\n").trim();
      const footerIdx = rest.search(
        /\n\s*\n\s*(?:BREAKING[ -]CHANGE|Signed-off-by|Co-authored-by|Reviewed-by|Refs?:|Closes?:|Fixes?:)/i,
      );
      if (footerIdx >= 0) {
        body = rest.slice(0, footerIdx).trim();
        footer = rest.slice(footerIdx).trim();
      } else {
        body = rest;
      }
    }

    const breakingInFooter =
      /BREAKING[ -]CHANGE\s*:/i.test(footer) ||
      /BREAKING[ -]CHANGE\s*:/i.test(body);

    return {
      type,
      scope,
      subject,
      body,
      footer,
      breaking: bangBreaking || breakingInFooter,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Private formatting helpers                                         */
/* ------------------------------------------------------------------ */

/**
 * Build the final commit result object and format the fullMessage string.
 * @param {string} type
 * @param {string|null} scope
 * @param {string} subject
 * @param {string} body
 * @param {boolean} breaking
 * @param {string} style
 * @returns {{type: string, scope: string|null, subject: string, body: string, fullMessage: string, breaking: boolean}}
 */
function _formatCommitResult(type, scope, subject, body, breaking, style) {
  let fullMessage;
  const breakingMark = breaking ? "!" : "";

  switch (style) {
    case "simple":
      fullMessage = subject;
      if (body) fullMessage += `\n\n${body}`;
      break;

    case "angular":
    case "conventional":
    default: {
      const scopePart = scope ? `(${scope})` : "";
      fullMessage = `${type}${scopePart}${breakingMark}: ${subject}`;
      if (body) fullMessage += `\n\n${body}`;
      if (breaking && body && !body.includes("BREAKING CHANGE")) {
        fullMessage += `\n\nBREAKING CHANGE: ${subject}`;
      }
      break;
    }
  }

  return { type, scope, subject, body, fullMessage, breaking };
}

/**
 * Safely parse JSON from LLM output, which may be wrapped in markdown fences.
 * @param {string} raw
 * @returns {object|null}
 */
function _safeParseLLMJson(raw) {
  if (!raw || typeof raw !== "string") return null;
  let cleaned = raw.trim();

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract a JSON object from the string
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Derive PR labels from changed file paths.
 * @param {string[]} files
 * @returns {string[]}
 */
function _deriveLabels(files) {
  const labels = new Set();
  for (const fp of files) {
    for (const [pattern, commitType] of Object.entries(FILE_TYPE_INDICATORS)) {
      if (_matchGlob(pattern, fp)) {
        labels.add(commitType);
        break;
      }
    }
  }

  // Map commit types to PR label names
  const labelMap = {
    test: "tests",
    docs: "documentation",
    ci: "ci/cd",
    style: "style",
    chore: "dependencies",
  };

  return [...labels].map((l) => labelMap[l] || l);
}

/**
 * Build a rule-based PR body (fallback when LLM is unavailable).
 * @param {object} ctx
 * @returns {string}
 */
function _buildRuleBasedPRBody({
  title,
  files,
  stats,
  commits,
  baseBranch,
  headBranch,
}) {
  const lines = [
    `## Summary`,
    "",
    `This PR merges \`${headBranch || "feature"}\` into \`${baseBranch}\`.`,
    "",
    `- ${files.length} file(s) changed`,
    `- ${stats.added} insertion(s), ${stats.removed} deletion(s)`,
  ];

  if (commits.length) {
    lines.push("", "## Commits", "");
    for (const c of commits.slice(0, 30)) {
      lines.push(`- ${c}`);
    }
    if (commits.length > 30) {
      lines.push(`- ... and ${commits.length - 30} more`);
    }
  }

  lines.push("", "## Changes", "", "**Files:**", "");
  for (const f of files.slice(0, 30)) {
    lines.push(`- \`${f}\``);
  }
  if (files.length > 30) {
    lines.push(`- ... and ${files.length - 30} more`);
  }

  lines.push(
    "",
    "## Test Plan",
    "",
    "- [ ] Verify all changed files work as expected",
    "- [ ] Run existing test suite",
    "- [ ] Manual QA if applicable",
    "",
    "## Review Checklist",
    "",
    "- [ ] Code follows project conventions",
    "- [ ] No unintended side effects",
    "- [ ] Documentation updated if needed",
  );

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Changelog renderers                                                */
/* ------------------------------------------------------------------ */

/**
 * Render in keepachangelog.com format.
 * @param {string} version
 * @param {string} date
 * @param {Array<{title: string, items: string[]}>} sections
 * @param {string} fromVersion
 * @returns {string}
 */
function _renderKeepAChangelog(version, date, sections, fromVersion) {
  const lines = [
    `# Changelog`,
    "",
    `All notable changes to this project will be documented in this file.`,
    "",
    `The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).`,
    "",
    `## [${version}] - ${date}`,
    "",
  ];

  for (const sec of sections) {
    lines.push(`### ${sec.title}`, "");
    for (const item of sec.items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (fromVersion) {
    lines.push(`[${version}]: compare/${fromVersion}...${version}`);
  }

  return lines.join("\n");
}

/**
 * Render in Angular changelog style.
 * @param {string} version
 * @param {string} date
 * @param {Array<{title: string, items: string[]}>} sections
 * @returns {string}
 */
function _renderAngularChangelog(version, date, sections) {
  const lines = [`# ${version} (${date})`, ""];
  for (const sec of sections) {
    lines.push(`### ${sec.title}`, "");
    for (const item of sec.items) {
      lines.push(`* ${item}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Render a simple flat changelog.
 * @param {string} version
 * @param {string} date
 * @param {Array<{title: string, items: string[]}>} sections
 * @returns {string}
 */
function _renderSimpleChangelog(version, date, sections) {
  const lines = [`${version} (${date})`, ""];
  for (const sec of sections) {
    for (const item of sec.items) {
      lines.push(`- ${item}`);
    }
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Code extraction helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Extract function signatures from source code using regex.
 * @param {string} code
 * @param {string} language
 * @returns {Array<{name: string, params: string[], returnType: string}>}
 */
function _extractFunctions(code, language) {
  const results = [];
  const patterns = {
    javascript: [
      // function name(params)
      /function\s+(\w+)\s*\(([^)]*)\)/g,
      // const name = (params) =>
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g,
      // async function name(params)
      /async\s+function\s+(\w+)\s*\(([^)]*)\)/g,
      // name(params) { — method
      /^\s+(\w+)\s*\(([^)]*)\)\s*\{/gm,
    ],
    typescript: [
      /function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*([^\s{]+))?/g,
      /(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*([^\s=]+))?\s*=>/g,
    ],
    python: [/def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\w+))?/g],
  };

  const langPatterns = patterns[language] || patterns.javascript;

  for (const re of langPatterns) {
    let m;
    while ((m = re.exec(code)) !== null) {
      const name = m[1];
      // Skip duplicates
      if (results.some((r) => r.name === name)) continue;
      const params = m[2]
        ? m[2]
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
        : [];
      const returnType = m[3] || "any";
      results.push({ name, params, returnType });
    }
  }

  return results;
}

/**
 * Extract class declarations from source code using regex.
 * @param {string} code
 * @param {string} language
 * @returns {Array<{name: string, methods: string[]}>}
 */
function _extractClasses(code, language) {
  const results = [];

  // Match class blocks
  const classRe = /class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g;
  let cm;
  while ((cm = classRe.exec(code)) !== null) {
    const className = cm[1];
    // Find the matching closing brace (simplified — counts braces)
    let depth = 1;
    let idx = cm.index + cm[0].length;
    let classBody = "";
    while (idx < code.length && depth > 0) {
      if (code[idx] === "{") depth++;
      else if (code[idx] === "}") depth--;
      if (depth > 0) classBody += code[idx];
      idx++;
    }

    // Extract method names from the class body
    const methodRe = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
    const methods = [];
    let mm;
    while ((mm = methodRe.exec(classBody)) !== null) {
      const methodName = mm[1];
      if (
        !["if", "for", "while", "switch", "catch", "function"].includes(
          methodName,
        )
      ) {
        methods.push(methodName);
      }
    }

    results.push({ name: className, methods: [...new Set(methods)] });
  }

  return results;
}

/**
 * Build skeleton API docs without LLM.
 * @param {Array<{name: string, params: string[], returnType: string}>} functions
 * @param {Array<{name: string, methods: string[]}>} classes
 * @param {string} language
 * @returns {string}
 */
function _buildSkeletonAPIDocs(functions, classes, language) {
  const lines = ["# API Documentation", ""];

  if (classes.length) {
    lines.push("## Classes", "");
    for (const cls of classes) {
      lines.push(`### \`${cls.name}\``, "");
      if (cls.methods.length) {
        lines.push("**Methods:**", "");
        for (const m of cls.methods) {
          lines.push(`- \`${m}()\``);
        }
        lines.push("");
      }
    }
  }

  if (functions.length) {
    lines.push("## Functions", "");
    for (const fn of functions) {
      const paramStr = fn.params.join(", ");
      lines.push(`### \`${fn.name}(${paramStr})\``, "");
      if (fn.params.length) {
        lines.push("**Parameters:**", "");
        for (const p of fn.params) {
          lines.push(`- \`${p}\``);
        }
        lines.push("");
      }
      lines.push(`**Returns:** \`${fn.returnType}\``, "");
    }
  }

  if (!classes.length && !functions.length) {
    lines.push("_No public API detected._");
  }

  return lines.join("\n");
}

/**
 * Build a rule-based README when LLM is unavailable.
 * @param {string} name
 * @param {string} description
 * @param {object} packageJson
 * @param {string} structure
 * @returns {{markdown: string, sections: string[]}}
 */
function _buildRuleBasedREADME(name, description, packageJson, structure) {
  const sections = [];
  const lines = [];

  // Title
  sections.push("Title");
  lines.push(`# ${name}`, "");

  // Description
  if (description) {
    sections.push("Description");
    lines.push(description, "");
  }

  // Installation
  sections.push("Installation");
  lines.push("## Installation", "");
  if (packageJson && packageJson.name) {
    lines.push("```bash", `npm install ${packageJson.name}`, "```", "");
  } else {
    lines.push(
      "```bash",
      `git clone <repository-url>`,
      `cd ${name}`,
      `npm install`,
      "```",
      "",
    );
  }

  // Usage
  sections.push("Usage");
  lines.push("## Usage", "");
  const scripts =
    packageJson && packageJson.scripts ? Object.keys(packageJson.scripts) : [];
  if (scripts.length) {
    lines.push("Available scripts:", "");
    for (const s of scripts) {
      lines.push(`- \`npm run ${s}\``);
    }
    lines.push("");
  } else {
    lines.push("```bash", `npm start`, "```", "");
  }

  // Project structure
  if (structure) {
    sections.push("Project Structure");
    lines.push("## Project Structure", "", "```", structure, "```", "");
  }

  // Dependencies
  if (packageJson && packageJson.dependencies) {
    const deps = Object.keys(packageJson.dependencies);
    if (deps.length) {
      sections.push("Dependencies");
      lines.push("## Dependencies", "");
      for (const d of deps) {
        lines.push(`- \`${d}\``);
      }
      lines.push("");
    }
  }

  // Contributing
  sections.push("Contributing");
  lines.push(
    "## Contributing",
    "",
    "1. Fork the repository",
    "2. Create your feature branch (`git checkout -b feat/my-feature`)",
    "3. Commit your changes (`git commit -m 'feat: add my feature'`)",
    "4. Push to the branch (`git push origin feat/my-feature`)",
    "5. Open a Pull Request",
    "",
  );

  // License
  const license =
    packageJson && packageJson.license ? packageJson.license : "MIT";
  sections.push("License");
  lines.push(
    "## License",
    "",
    `This project is licensed under the ${license} License.`,
    "",
  );

  return { markdown: lines.join("\n"), sections };
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

module.exports = { DocGenerator, COMMIT_TYPES };
