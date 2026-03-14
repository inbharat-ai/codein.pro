/**
 * CodIn MAS — Smart Apply & Command Runner
 *
 * AST-aware / intelligent code editing capabilities for agents, replacing
 * naive file overwrites with surgical edits, fuzzy matching, syntax
 * validation, backup/restore, and structured command execution.
 *
 * No external dependencies — uses only Node built-ins.
 */
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { createLogger } = require("./logger");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Compute the Levenshtein edit-distance between two strings.
 * Uses the classic dynamic-programming matrix with O(min(a,b)) space.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure `a` is the shorter string for space efficiency.
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Single-row DP — prev stores row i-1, curr stores row i.
  let prev = new Array(aLen + 1);
  let curr = new Array(aLen + 1);

  for (let j = 0; j <= aLen; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= bLen; i++) {
    curr[0] = i;
    for (let j = 1; j <= aLen; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[aLen];
}

/**
 * Return a 0-1 similarity score between two strings.
 * 1 = identical, 0 = completely different.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function similarity(a, b) {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/* ------------------------------------------------------------------ */
/*  SmartApply                                                         */
/* ------------------------------------------------------------------ */

const SIMILARITY_THRESHOLD = 0.7;
const BACKUP_DIR = ".codein/backups";

class SmartApply {
  /**
   * @param {object} [opts]
   * @param {string} [opts.workspaceRoot] — root directory (defaults to cwd)
   * @param {number} [opts.similarityThreshold] — fuzzy-match threshold (0-1)
   */
  constructor(opts = {}) {
    this._log = createLogger("SmartApply");
    this._root = opts.workspaceRoot || process.cwd();
    this._threshold = opts.similarityThreshold ?? SIMILARITY_THRESHOLD;
  }

  /* ---- public API ------------------------------------------------ */

  /**
   * Apply a single edit to a file.
   *
   * @param {string} filePath — absolute or workspace-relative path
   * @param {{ type: "insert"|"replace"|"delete", search?: string, replacement?: string, lineNumber?: number }} edit
   * @returns {Promise<{ success: boolean, filePath: string, diff: string, linesChanged: number }>}
   */
  async applyEdit(filePath, edit) {
    const abs = this._resolve(filePath);
    this._log.debug("applyEdit", { filePath: abs, type: edit.type });

    try {
      const original = await fs.readFile(abs, "utf-8");
      const modified = this._performEdit(original, edit, abs);

      if (modified === original) {
        this._log.warn("Edit produced no change", { filePath: abs });
        return { success: true, filePath: abs, diff: "", linesChanged: 0 };
      }

      const valid = this.validateSyntax(abs, modified);
      if (!valid.valid) {
        this._log.warn("Post-edit syntax validation failed — applying anyway", {
          filePath: abs,
          errors: valid.errors,
        });
      }

      await fs.writeFile(abs, modified, "utf-8");

      const diff = this.generateUnifiedDiff(original, modified, abs);
      const linesChanged = this._countChangedLines(original, modified);

      this._log.info("Edit applied", { filePath: abs, linesChanged });
      return { success: true, filePath: abs, diff, linesChanged };
    } catch (err) {
      this._log.error("applyEdit failed", {
        filePath: abs,
        error: err.message,
      });
      return { success: false, filePath: abs, diff: "", linesChanged: 0 };
    }
  }

  /**
   * Atomically apply multiple edits to a single file.
   * Reads once, applies all edits in order, writes once.
   * Rolls back to a backup on any failure.
   *
   * @param {string} filePath
   * @param {Array<{ type: "insert"|"replace"|"delete", search?: string, replacement?: string, lineNumber?: number }>} edits
   * @returns {Promise<{ success: boolean, filePath: string, diff: string, linesChanged: number }>}
   */
  async applyEdits(filePath, edits) {
    const abs = this._resolve(filePath);
    this._log.info("applyEdits — batch", {
      filePath: abs,
      count: edits.length,
    });

    let backupPath;
    try {
      backupPath = await this.createBackup(abs);
      const original = await fs.readFile(abs, "utf-8");
      let content = original;

      for (let i = 0; i < edits.length; i++) {
        try {
          content = this._performEdit(content, edits[i], abs);
        } catch (editErr) {
          this._log.error(`Edit ${i} failed — rolling back`, {
            error: editErr.message,
          });
          await this.restoreBackup(abs, backupPath);
          return { success: false, filePath: abs, diff: "", linesChanged: 0 };
        }
      }

      const valid = this.validateSyntax(abs, content);
      if (!valid.valid) {
        this._log.warn(
          "Post-batch syntax validation failed — applying anyway",
          {
            errors: valid.errors,
          },
        );
      }

      await fs.writeFile(abs, content, "utf-8");

      const diff = this.generateUnifiedDiff(original, content, abs);
      const linesChanged = this._countChangedLines(original, content);

      this._log.info("Batch edits applied", { filePath: abs, linesChanged });
      return { success: true, filePath: abs, diff, linesChanged };
    } catch (err) {
      this._log.error("applyEdits failed", {
        filePath: abs,
        error: err.message,
      });
      if (backupPath) {
        try {
          await this.restoreBackup(abs, backupPath);
        } catch (_) {
          /* best-effort rollback */
        }
      }
      return { success: false, filePath: abs, diff: "", linesChanged: 0 };
    }
  }

  /**
   * Produce a standard unified diff between two strings.
   *
   * @param {string} original
   * @param {string} modified
   * @param {string} filePath — used in the diff header
   * @returns {string}
   */
  generateUnifiedDiff(original, modified, filePath) {
    const oldLines = original.split("\n");
    const newLines = modified.split("\n");
    const label = filePath || "file";

    const hunks = this._buildHunks(oldLines, newLines);
    if (hunks.length === 0) return "";

    const header = [`--- a/${label}`, `+++ b/${label}`];

    const body = [];
    for (const hunk of hunks) {
      body.push(
        `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
      );
      for (const line of hunk.lines) {
        body.push(line);
      }
    }

    return header.concat(body).join("\n");
  }

  /**
   * Basic syntax validation for common file types.
   *
   * @param {string} filePath — used to detect language by extension
   * @param {string} content
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateSyntax(filePath, content) {
    const ext = path.extname(filePath).toLowerCase();
    const errors = [];

    switch (ext) {
      case ".json": {
        try {
          JSON.parse(content);
        } catch (e) {
          errors.push(`JSON parse error: ${e.message}`);
        }
        break;
      }

      case ".js":
      case ".jsx":
      case ".ts":
      case ".tsx":
      case ".mjs":
      case ".cjs": {
        const bracketErrors = this._checkBalanced(content);
        if (bracketErrors.length > 0) {
          errors.push(...bracketErrors);
        }
        break;
      }

      default:
        // No validation available for this extension.
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Create a timestamped backup of a file.
   *
   * @param {string} filePath — absolute or workspace-relative
   * @returns {Promise<string>} — absolute path to the backup file
   */
  async createBackup(filePath) {
    const abs = this._resolve(filePath);
    const backupDir = path.join(this._root, BACKUP_DIR);
    await fs.mkdir(backupDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.basename(abs);
    const backupPath = path.join(backupDir, `${base}.${ts}.bak`);

    await fs.copyFile(abs, backupPath);
    this._log.debug("Backup created", { source: abs, backup: backupPath });
    return backupPath;
  }

  /**
   * Restore a file from a backup.
   *
   * @param {string} filePath — destination (original location)
   * @param {string} backupPath — path to the backup file
   * @returns {Promise<void>}
   */
  async restoreBackup(filePath, backupPath) {
    const abs = this._resolve(filePath);
    await fs.copyFile(backupPath, abs);
    this._log.info("Backup restored", { filePath: abs, from: backupPath });
  }

  /* ---- internal -------------------------------------------------- */

  /**
   * Resolve a file path against the workspace root.
   * @param {string} p
   * @returns {string}
   */
  _resolve(p) {
    return path.isAbsolute(p) ? p : path.join(this._root, p);
  }

  /**
   * Apply a single edit operation to content in memory and return the result.
   * Throws on failure.
   * @param {string} content
   * @param {object} edit
   * @param {string} filePath — for logging only
   * @returns {string}
   */
  _performEdit(content, edit, filePath) {
    const { type } = edit;

    switch (type) {
      case "replace":
        return this._applyReplace(content, edit);
      case "insert":
        return this._applyInsert(content, edit);
      case "delete":
        return this._applyDelete(content, edit);
      default:
        throw new Error(`Unknown edit type: ${type}`);
    }
  }

  /**
   * Replace: exact match first, then fuzzy fallback.
   */
  _applyReplace(content, edit) {
    const { search, replacement } = edit;
    if (!search) throw new Error("replace edit requires a 'search' string");
    if (replacement == null)
      throw new Error("replace edit requires a 'replacement' string");

    // Exact match — use function replacement to avoid $ pattern interpolation
    if (content.includes(search)) {
      const idx = content.indexOf(search);
      return (
        content.slice(0, idx) + replacement + content.slice(idx + search.length)
      );
    }

    // Fuzzy match — search line-by-line blocks
    const match = this._fuzzyFind(content, search);
    if (match) {
      return (
        content.slice(0, match.start) + replacement + content.slice(match.end)
      );
    }

    throw new Error(
      `Could not find a match for search string (best similarity below threshold ${this._threshold})`,
    );
  }

  /**
   * Insert: at a specific line number or after a search pattern.
   */
  _applyInsert(content, edit) {
    const { lineNumber, search, replacement } = edit;
    if (replacement == null)
      throw new Error("insert edit requires a 'replacement' string");

    const lines = content.split("\n");

    if (lineNumber != null) {
      // Insert at the given 1-based line number.
      const idx = Math.max(0, Math.min(lineNumber - 1, lines.length));
      lines.splice(idx, 0, replacement);
      return lines.join("\n");
    }

    if (search) {
      // Insert after the first line that contains the search pattern.
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(search)) {
          lines.splice(i + 1, 0, replacement);
          return lines.join("\n");
        }
      }

      // Fuzzy line match
      let bestIdx = -1;
      let bestScore = 0;
      for (let i = 0; i < lines.length; i++) {
        const score = similarity(lines[i].trim(), search.trim());
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestScore >= this._threshold && bestIdx >= 0) {
        lines.splice(bestIdx + 1, 0, replacement);
        return lines.join("\n");
      }

      throw new Error("insert: could not locate search pattern");
    }

    // No lineNumber, no search — append to end.
    lines.push(replacement);
    return lines.join("\n");
  }

  /**
   * Delete: remove a matching block of text.
   */
  _applyDelete(content, edit) {
    const { search } = edit;
    if (!search) throw new Error("delete edit requires a 'search' string");

    // Exact match — use slice to avoid $ pattern issues in String.replace
    if (content.includes(search)) {
      const idx = content.indexOf(search);
      return content.slice(0, idx) + content.slice(idx + search.length);
    }

    // Fuzzy match
    const match = this._fuzzyFind(content, search);
    if (match) {
      return content.slice(0, match.start) + content.slice(match.end);
    }

    throw new Error("delete: could not locate search string");
  }

  /**
   * Fuzzy-find a multi-line search string inside content.
   * Slides a window of the same line count across the content lines,
   * scoring each window. Returns the best match above threshold.
   *
   * @param {string} content
   * @param {string} search
   * @returns {{ start: number, end: number, score: number } | null}
   */
  _fuzzyFind(content, search) {
    const contentLines = content.split("\n");
    const searchLines = search.split("\n");
    const windowSize = searchLines.length;

    if (windowSize > contentLines.length) return null;

    let bestScore = 0;
    let bestStart = -1;
    let bestEnd = -1;

    // Precompute character offsets for each line start.
    const offsets = new Array(contentLines.length);
    let offset = 0;
    for (let i = 0; i < contentLines.length; i++) {
      offsets[i] = offset;
      offset += contentLines[i].length + 1; // +1 for '\n'
    }

    for (let i = 0; i <= contentLines.length - windowSize; i++) {
      const window = contentLines.slice(i, i + windowSize).join("\n");
      const score = similarity(window, search);
      if (score > bestScore) {
        bestScore = score;
        bestStart = offsets[i];
        const endLine = i + windowSize - 1;
        bestEnd = offsets[endLine] + contentLines[endLine].length;
        // Include the trailing newline so replacement doesn't leave orphan newlines
        if (bestEnd < content.length && content[bestEnd] === "\n") {
          bestEnd += 1;
        }
      }
    }

    if (bestScore >= this._threshold) {
      return { start: bestStart, end: bestEnd, score: bestScore };
    }

    return null;
  }

  /**
   * Check that braces, brackets, and parentheses are balanced.
   * @param {string} content
   * @returns {string[]}
   */
  _checkBalanced(content) {
    const errors = [];
    const stack = [];
    const pairs = { "(": ")", "[": "]", "{": "}" };
    const closers = new Set([")", "]", "}"]);

    let inString = false;
    let stringChar = "";
    let escaped = false;
    let inLineComment = false;
    let inBlockComment = false;
    let inTemplate = false;
    let line = 1;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      const next = content[i + 1];

      if (ch === "\n") {
        line++;
        inLineComment = false;
        escaped = false;
        continue;
      }

      if (inLineComment) continue;

      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i++; // skip '/'
        }
        continue;
      }

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        if (inString || inTemplate) {
          escaped = true;
        }
        continue;
      }

      if (inString) {
        if (ch === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inTemplate) {
        if (ch === "`") {
          inTemplate = false;
        }
        // Template literal ${} nesting is complex — skip for basic check.
        continue;
      }

      // Not inside string / comment
      if (ch === "/" && next === "/") {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === "`") {
        inTemplate = true;
        continue;
      }

      if (pairs[ch]) {
        stack.push({ ch, expected: pairs[ch], line });
      } else if (closers.has(ch)) {
        if (stack.length === 0) {
          errors.push(`Unexpected '${ch}' at line ${line}`);
        } else {
          const top = stack.pop();
          if (top.expected !== ch) {
            errors.push(
              `Mismatched '${top.ch}' (line ${top.line}) closed by '${ch}' at line ${line}`,
            );
          }
        }
      }
    }

    for (const unclosed of stack) {
      errors.push(`Unclosed '${unclosed.ch}' opened at line ${unclosed.line}`);
    }

    return errors;
  }

  /**
   * Build unified-diff hunks from two arrays of lines.
   * Uses a simple LCS-based diff that groups consecutive changes into hunks
   * with up to 3 lines of context.
   *
   * @param {string[]} oldLines
   * @param {string[]} newLines
   * @returns {Array<{ oldStart: number, oldCount: number, newStart: number, newCount: number, lines: string[] }>}
   */
  _buildHunks(oldLines, newLines) {
    const CONTEXT = 3;

    // Compute edit script via simple O(nd) Myers-like approach.
    // For practicality on large files use an O(nm) DP LCS.
    const changes = this._diffLines(oldLines, newLines);
    if (changes.length === 0) return [];

    // Group changes into hunks with context.
    const hunks = [];
    let hunkChanges = [changes[0]];

    for (let i = 1; i < changes.length; i++) {
      const prev = hunkChanges[hunkChanges.length - 1];
      const curr = changes[i];
      // If the gap between consecutive changes is <= 2*CONTEXT, merge into same hunk.
      const gapOld = curr.oldIdx - prev.oldEndIdx;
      const gapNew = curr.newIdx - prev.newEndIdx;
      const gap = Math.max(gapOld, gapNew);
      if (gap <= CONTEXT * 2) {
        hunkChanges.push(curr);
      } else {
        hunks.push(this._formatHunk(hunkChanges, oldLines, newLines, CONTEXT));
        hunkChanges = [curr];
      }
    }
    hunks.push(this._formatHunk(hunkChanges, oldLines, newLines, CONTEXT));

    return hunks;
  }

  /**
   * Produce a list of change ranges by comparing old and new lines.
   * Each entry: { oldIdx, oldEndIdx, newIdx, newEndIdx }
   */
  _diffLines(oldLines, newLines) {
    // Simple line-by-line comparison using LCS to find matching lines,
    // then deriving change blocks. For very large files this could be
    // slow, but it's acceptable for typical source files.
    const lcs = this._lcs(oldLines, newLines);
    const changes = [];

    let oi = 0;
    let ni = 0;
    let li = 0;

    while (oi < oldLines.length || ni < newLines.length) {
      if (li < lcs.length && oi === lcs[li].oi && ni === lcs[li].ni) {
        // Matching line — skip.
        oi++;
        ni++;
        li++;
      } else {
        // Collect consecutive non-matching lines.
        const startOi = oi;
        const startNi = ni;
        while (oi < oldLines.length && (li >= lcs.length || oi < lcs[li].oi)) {
          oi++;
        }
        while (ni < newLines.length && (li >= lcs.length || ni < lcs[li].ni)) {
          ni++;
        }
        if (oi !== startOi || ni !== startNi) {
          changes.push({
            oldIdx: startOi,
            oldEndIdx: oi,
            newIdx: startNi,
            newEndIdx: ni,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Compute LCS of two line arrays.
   * Returns array of { oi, ni } matched pairs in order.
   */
  _lcs(a, b) {
    const m = a.length;
    const n = b.length;

    // For very large files, cap the DP to avoid OOM.
    if (m * n > 10_000_000) {
      // Fallback: treat entire old as removed and entire new as added.
      return [];
    }

    // Standard DP table.
    const dp = new Array(m + 1);
    for (let i = 0; i <= m; i++) {
      dp[i] = new Uint16Array(n + 1);
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to get the matching pairs.
    const result = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.push({ oi: i - 1, ni: j - 1 });
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    result.reverse();
    return result;
  }

  /**
   * Format a single hunk for unified diff output.
   */
  _formatHunk(changes, oldLines, newLines, ctx) {
    const firstChange = changes[0];
    const lastChange = changes[changes.length - 1];

    const hunkOldStart = Math.max(0, firstChange.oldIdx - ctx);
    const hunkOldEnd = Math.min(oldLines.length, lastChange.oldEndIdx + ctx);
    const hunkNewStart = Math.max(0, firstChange.newIdx - ctx);
    const hunkNewEnd = Math.min(newLines.length, lastChange.newEndIdx + ctx);

    const lines = [];
    let oi = hunkOldStart;
    let ni = hunkNewStart;

    for (const change of changes) {
      // Leading context
      while (oi < change.oldIdx && ni < change.newIdx) {
        lines.push(` ${oldLines[oi]}`);
        oi++;
        ni++;
      }
      // Removed lines
      while (oi < change.oldEndIdx) {
        lines.push(`-${oldLines[oi]}`);
        oi++;
      }
      // Added lines
      while (ni < change.newEndIdx) {
        lines.push(`+${newLines[ni]}`);
        ni++;
      }
    }
    // Trailing context
    while (oi < hunkOldEnd && ni < hunkNewEnd) {
      lines.push(` ${oldLines[oi]}`);
      oi++;
      ni++;
    }

    return {
      oldStart: hunkOldStart + 1, // 1-based
      oldCount: hunkOldEnd - hunkOldStart,
      newStart: hunkNewStart + 1,
      newCount: hunkNewEnd - hunkNewStart,
      lines,
    };
  }

  /**
   * Count lines that differ between original and modified.
   */
  _countChangedLines(original, modified) {
    const a = original.split("\n");
    const b = modified.split("\n");
    let changed = 0;
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      if (a[i] !== b[i]) changed++;
    }
    return changed;
  }
}

/* ------------------------------------------------------------------ */
/*  CommandRunner                                                       */
/* ------------------------------------------------------------------ */

/** Maximum output size kept in memory (bytes). */
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MiB

class CommandRunner {
  /**
   * @param {object} [opts]
   * @param {string} [opts.cwd] — default working directory
   * @param {number} [opts.timeout] — default timeout in ms (30 s)
   * @param {string} [opts.shell] — shell to use (defaults to platform shell)
   */
  constructor(opts = {}) {
    this._log = createLogger("CommandRunner");
    this._cwd = opts.cwd || process.cwd();
    this._timeout = opts.timeout ?? 30_000;
    this._shell =
      opts.shell || (process.platform === "win32" ? "cmd.exe" : "/bin/sh");
  }

  /* ---- public API ------------------------------------------------ */

  /**
   * Run a command and capture its full output.
   *
   * @param {string} command — the command string to execute
   * @param {object} [opts]
   * @param {string}   [opts.cwd]     — working directory override
   * @param {number}   [opts.timeout] — timeout in ms
   * @param {Record<string,string>} [opts.env] — extra environment variables
   * @returns {Promise<{ exitCode: number, stdout: string[], stderr: string[], duration: number, command: string, truncated: boolean }>}
   */
  run(command, opts = {}) {
    const cwd = opts.cwd || this._cwd;
    const timeout = opts.timeout ?? this._timeout;
    const env = opts.env ? { ...process.env, ...opts.env } : process.env;

    this._log.debug("run", { command, cwd });
    const startTime = Date.now();

    return new Promise((resolve) => {
      const shellFlag = this._shell.includes("cmd") ? "/c" : "-c";
      const child = execFile(
        this._shell,
        [shellFlag, command],
        {
          cwd,
          env,
          timeout,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const duration = Date.now() - startTime;
          const exitCode = error
            ? error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
              ? 1
              : (error.code ?? 1)
            : 0;
          const truncated = error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";

          const stdoutLines = stdout
            ? stdout.split("\n").filter((l) => l.length > 0)
            : [];
          const stderrLines = stderr
            ? stderr.split("\n").filter((l) => l.length > 0)
            : [];

          this._log.debug("run complete", { command, exitCode, duration });

          resolve({
            exitCode: typeof exitCode === "number" ? exitCode : 1,
            stdout: stdoutLines,
            stderr: stderrLines,
            duration,
            command,
            truncated: !!truncated,
          });
        },
      );

      // Safety: if the child hangs past timeout, kill it.
      child.on("error", () => {
        /* handled by execFile callback */
      });
    });
  }

  /**
   * Run a command, retrying up to maxRetries times on non-zero exit.
   *
   * @param {string} command
   * @param {object} [opts] — same as run(), plus:
   * @param {number} [opts.maxRetries] — max retry count (default 2)
   * @param {number} [opts.retryDelay] — ms between retries (default 1000)
   * @returns {Promise<{ exitCode: number, stdout: string[], stderr: string[], duration: number, command: string, truncated: boolean, attempts: number }>}
   */
  async runWithRetry(command, opts = {}) {
    const maxRetries = opts.maxRetries ?? 2;
    const retryDelay = opts.retryDelay ?? 1000;
    let attempts = 0;
    let result;

    while (attempts <= maxRetries) {
      attempts++;
      result = await this.run(command, opts);

      if (result.exitCode === 0) {
        return { ...result, attempts };
      }

      if (attempts <= maxRetries) {
        this._log.warn(
          `Command failed (attempt ${attempts}/${maxRetries + 1}), retrying...`,
          {
            command,
            exitCode: result.exitCode,
          },
        );
        await this._sleep(retryDelay);
      }
    }

    this._log.error("Command failed after all retries", {
      command,
      exitCode: result.exitCode,
      attempts,
    });
    return { ...result, attempts };
  }

  /**
   * Parse structured output from common dev tools.
   *
   * @param {string[]} stdout — array of output lines
   * @param {"jest"|"eslint"|"tsc"|"generic"} type
   * @returns {object}
   */
  parseOutput(stdout, type) {
    switch (type) {
      case "jest":
        return this._parseJest(stdout);
      case "eslint":
        return this._parseEslint(stdout);
      case "tsc":
        return this._parseTsc(stdout);
      case "generic":
      default:
        return { lines: stdout };
    }
  }

  /* ---- internal -------------------------------------------------- */

  /**
   * Parse Jest test output.
   * Looks for summary lines like "Tests: 5 passed, 1 failed, 6 total".
   */
  _parseJest(lines) {
    const result = { passed: 0, failed: 0, total: 0, coverage: null };

    for (const line of lines) {
      // "Tests:       5 passed, 1 failed, 6 total"
      const testsMatch = line.match(
        /Tests:\s+(?:(\d+)\s+passed)?[,\s]*(?:(\d+)\s+failed)?[,\s]*(\d+)\s+total/,
      );
      if (testsMatch) {
        result.passed = parseInt(testsMatch[1] || "0", 10);
        result.failed = parseInt(testsMatch[2] || "0", 10);
        result.total = parseInt(testsMatch[3], 10);
      }

      // "All files |   85.5 |   72.3 |   90.1 |   85.5 |"
      const covMatch = line.match(/All files\s*\|\s*([\d.]+)\s*\|/);
      if (covMatch) {
        result.coverage = parseFloat(covMatch[1]);
      }
    }

    return result;
  }

  /**
   * Parse ESLint output (default formatter).
   * Lines like "/path/file.js:10:5: error some message (rule-name)"
   */
  _parseEslint(lines) {
    const errors = [];
    const pattern =
      /^(.+):(\d+):(\d+):\s+(error|warning)\s+(.+?)(?:\s+\((.+)\))?$/;

    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        errors.push({
          file: m[1],
          line: parseInt(m[2], 10),
          column: parseInt(m[3], 10),
          severity: m[4],
          message: m[5].trim(),
          rule: m[6] || null,
        });
      }
    }

    return {
      errors,
      errorCount: errors.filter((e) => e.severity === "error").length,
      warningCount: errors.filter((e) => e.severity === "warning").length,
    };
  }

  /**
   * Parse TypeScript compiler output.
   * Lines like "src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'."
   */
  _parseTsc(lines) {
    const errors = [];
    const pattern = /^(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;

    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        errors.push({
          file: m[1],
          line: parseInt(m[2], 10),
          column: parseInt(m[3], 10),
          code: m[4],
          message: m[5].trim(),
        });
      }
    }

    return { errors, errorCount: errors.length };
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

module.exports = {
  SmartApply,
  CommandRunner,
  levenshteinDistance,
  similarity,
};
