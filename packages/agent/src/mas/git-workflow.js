/**
 * CodeIn MAS — Git Workflow Automation
 *
 * Provides automated git operations: branch management,
 * commit generation, PR description, changelog creation.
 * Used by agents to manage code changes safely.
 */
"use strict";

const { execSync, spawn } = require("node:child_process");
const path = require("node:path");

const GIT_TIMEOUT_MS = 30000; // 30 seconds per git command
const MAX_DIFF_SIZE = 100 * 1024; // 100KB max diff for LLM

/**
 * Execute a git command safely.
 * @param {string} args - Git arguments (not the `git` binary itself)
 * @param {object} opts - { cwd, timeout }
 * @returns {string} stdout
 */
function gitExec(args, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const timeout = opts.timeout || GIT_TIMEOUT_MS;

  try {
    const result = execSync(`git ${args}`, {
      cwd,
      timeout,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.trim();
  } catch (err) {
    if (err.stderr) {
      throw new Error(`git ${args.split(" ")[0]} failed: ${err.stderr.trim()}`);
    }
    throw err;
  }
}

class GitWorkflow {
  constructor(opts = {}) {
    this._cwd = opts.cwd || process.cwd();
    this._runLLM = opts.runLLM || null;
  }

  /**
   * Get repository status.
   */
  status() {
    const branch = gitExec("rev-parse --abbrev-ref HEAD", { cwd: this._cwd });
    const statusRaw = gitExec("status --porcelain", { cwd: this._cwd });
    const files = statusRaw
      ? statusRaw.split("\n").map((line) => ({
          status: line.substring(0, 2).trim(),
          file: line.substring(3),
        }))
      : [];

    let ahead = 0;
    let behind = 0;
    try {
      const tracking = gitExec("rev-list --left-right --count HEAD...@{u}", {
        cwd: this._cwd,
      });
      const parts = tracking.split("\t");
      ahead = parseInt(parts[0], 10) || 0;
      behind = parseInt(parts[1], 10) || 0;
    } catch {
      // No upstream branch
    }

    return { branch, files, ahead, behind, clean: files.length === 0 };
  }

  /**
   * Get diff for staged or all changes.
   * @param {object} opts - { staged, maxSize }
   */
  diff(opts = {}) {
    const staged = opts.staged ? "--staged" : "";
    const raw = gitExec(`diff ${staged}`, { cwd: this._cwd });
    const maxSize = opts.maxSize || MAX_DIFF_SIZE;
    if (raw.length > maxSize) {
      return raw.slice(0, maxSize) + "\n... (truncated)";
    }
    return raw;
  }

  /**
   * Get recent commit log.
   * @param {number} count
   */
  log(count = 10) {
    const raw = gitExec(`log --oneline --no-decorate -${Math.min(count, 50)}`, {
      cwd: this._cwd,
    });
    return raw
      ? raw.split("\n").map((line) => {
          const spaceIdx = line.indexOf(" ");
          return {
            hash: line.substring(0, spaceIdx),
            message: line.substring(spaceIdx + 1),
          };
        })
      : [];
  }

  /**
   * Create and checkout a new branch.
   * @param {string} name - Branch name (will be sanitized)
   * @param {string} baseBranch - Optional base branch
   */
  createBranch(name, baseBranch) {
    // Sanitize branch name
    const safe = name
      .replace(/[^a-zA-Z0-9_\-/]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100);

    if (!safe) throw new Error("Invalid branch name");

    if (baseBranch) {
      gitExec(`checkout -b ${safe} ${baseBranch}`, { cwd: this._cwd });
    } else {
      gitExec(`checkout -b ${safe}`, { cwd: this._cwd });
    }
    return safe;
  }

  /**
   * Stage files.
   * @param {string[]} files - File paths to stage, or ['.'] for all
   */
  stage(files) {
    if (!files || files.length === 0) {
      throw new Error("No files specified for staging");
    }
    // Stage each file individually for safety
    for (const file of files) {
      const safePath = file.replace(/"/g, '\\"');
      gitExec(`add "${safePath}"`, { cwd: this._cwd });
    }
  }

  /**
   * Commit staged changes.
   * @param {string} message
   * @returns {{ hash: string, message: string }}
   */
  commit(message) {
    if (!message || typeof message !== "string") {
      throw new Error("Commit message is required");
    }
    // Use stdin to avoid shell escaping issues
    const result = execSync("git commit -F -", {
      cwd: this._cwd,
      input: message,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
    });

    const hash = gitExec("rev-parse --short HEAD", { cwd: this._cwd });
    return { hash, message: message.split("\n")[0] };
  }

  /**
   * Generate a commit message using LLM.
   * @param {string} diff
   * @param {object} opts - { style }
   * @returns {Promise<{suggestion: string}>}
   */
  async generateCommitMessage(diff, opts = {}) {
    if (!this._runLLM) {
      return { suggestion: this._fallbackCommitMessage(diff) };
    }

    const truncated =
      diff.length > MAX_DIFF_SIZE
        ? diff.slice(0, MAX_DIFF_SIZE) + "\n...(truncated)"
        : diff;
    const style = opts.style || "conventional";

    const prompt = `Generate a ${style} commit message for this diff. Be concise. First line max 72 chars. Include a body if the change is complex.\n\nDiff:\n${truncated}`;

    try {
      const result = await this._runLLM(prompt, { maxTokens: 200 });
      return {
        suggestion:
          typeof result === "string"
            ? result.trim()
            : result.text?.trim() || this._fallbackCommitMessage(diff),
      };
    } catch {
      return { suggestion: this._fallbackCommitMessage(diff) };
    }
  }

  /**
   * Generate a PR description using LLM.
   * @param {object} params - { gitDiff, commitMessages }
   * @returns {Promise<{title: string, body: string}>}
   */
  async generatePRDescription(params) {
    const { gitDiff, commitMessages } = params;

    if (!this._runLLM) {
      return this._fallbackPRDescription(commitMessages);
    }

    const truncatedDiff = (gitDiff || "").slice(0, MAX_DIFF_SIZE);
    const commits = (commitMessages || []).join("\n");

    const prompt = `Generate a PR title (max 70 chars) and body with ## Summary and ## Changes sections.\n\nCommits:\n${commits}\n\nDiff:\n${truncatedDiff}`;

    try {
      const result = await this._runLLM(prompt, { maxTokens: 500 });
      const text = typeof result === "string" ? result : result.text || "";
      const lines = text.trim().split("\n");
      const title = lines[0]
        .replace(/^#+\s*/, "")
        .replace(/^title:\s*/i, "")
        .trim();
      const body = lines.slice(1).join("\n").trim();
      return {
        title: title || "Update",
        body: body || "Changes as described in commits.",
      };
    } catch {
      return this._fallbackPRDescription(commitMessages);
    }
  }

  /**
   * Generate a changelog from commits.
   */
  generateChangelog(params) {
    const { commits } = params;
    if (!commits || commits.length === 0) {
      return { changelog: "No changes." };
    }
    const sections = { feat: [], fix: [], refactor: [], docs: [], other: [] };
    for (const msg of commits) {
      const match = msg.match(/^(\w+)(?:\(.*?\))?:\s*(.*)$/);
      if (match) {
        const type = match[1].toLowerCase();
        const desc = match[2];
        if (sections[type]) {
          sections[type].push(desc);
        } else {
          sections.other.push(msg);
        }
      } else {
        sections.other.push(msg);
      }
    }

    let changelog = "";
    if (sections.feat.length)
      changelog +=
        "### Features\n" +
        sections.feat.map((s) => `- ${s}`).join("\n") +
        "\n\n";
    if (sections.fix.length)
      changelog +=
        "### Bug Fixes\n" +
        sections.fix.map((s) => `- ${s}`).join("\n") +
        "\n\n";
    if (sections.refactor.length)
      changelog +=
        "### Refactoring\n" +
        sections.refactor.map((s) => `- ${s}`).join("\n") +
        "\n\n";
    if (sections.docs.length)
      changelog +=
        "### Documentation\n" +
        sections.docs.map((s) => `- ${s}`).join("\n") +
        "\n\n";
    if (sections.other.length)
      changelog +=
        "### Other Changes\n" +
        sections.other.map((s) => `- ${s}`).join("\n") +
        "\n\n";

    return { changelog: changelog.trim() || "No categorizable changes." };
  }

  // ─── Fallbacks ──────────────────────────────────────────────

  _fallbackCommitMessage(diff) {
    const lines = diff.split("\n");
    const adds = lines.filter(
      (l) => l.startsWith("+") && !l.startsWith("+++"),
    ).length;
    const dels = lines.filter(
      (l) => l.startsWith("-") && !l.startsWith("---"),
    ).length;
    const files = lines
      .filter((l) => l.startsWith("diff --git"))
      .map((l) => l.split(" b/")[1])
      .filter(Boolean);

    if (files.length === 0) return "chore: update files";
    if (files.length === 1)
      return `update ${path.basename(files[0])} (+${adds}/-${dels})`;
    return `update ${files.length} files (+${adds}/-${dels})`;
  }

  _fallbackPRDescription(commitMessages) {
    const msgs = commitMessages || [];
    return {
      title: msgs[0] || "Update",
      body: `## Summary\n${msgs.map((m) => `- ${m}`).join("\n") || "Changes."}\n\n## Changes\nSee commit history for details.`,
    };
  }
}

module.exports = { GitWorkflow, gitExec };
