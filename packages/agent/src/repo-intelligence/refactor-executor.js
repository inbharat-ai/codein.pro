/**
 * Repo Intelligence — Refactor Executor
 *
 * Closed-loop refactoring engine:
 *   1. Backup all target files
 *   2. Apply edits (via LLM or programmatic transforms)
 *   3. Validate (lint + typecheck + test)
 *   4. If validation fails → attempt auto-fix (up to N retries)
 *   5. If still failing → rollback to backup
 *   6. Report results
 *
 * Integrates: RefactorPlanner, ValidationPipeline, file I/O.
 * Pure CJS, no core/ deps.
 */
"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { logger } = require("../logger");

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BACKUP_DIR_NAME = ".codein-refactor-backup";

/**
 * @typedef {Object} EditPayload
 * @property {string} relativePath
 * @property {string} [newContent] - Complete replacement content
 * @property {string} [patch] - Unified diff patch for this file
 * @property {string} [expectedHash] - Optional SHA-256 hash of current content for conflict safety
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {string} refactorId
 * @property {'completed'|'rolled_back'|'partial'|'failed'} status
 * @property {number} filesModified
 * @property {number} retries
 * @property {Object} validation - Final validation report
 * @property {string[]} rolledBackFiles
 * @property {string[]} errors
 * @property {number} durationMs
 */

// ─── Refactor Executor ──────────────────────────────────────────────────────

class RefactorExecutor {
  /**
   * @param {Object} deps
   * @param {import('./refactor-planner').RefactorPlanner} deps.planner
   * @param {import('./validation-pipeline').ValidationPipeline} deps.validator
   * @param {function} [deps.runLLM] - (systemPrompt, userPrompt, opts) => Promise<string>
   */
  constructor(deps) {
    this.planner = deps.planner;
    this.validator = deps.validator;
    this.runLLM = deps.runLLM || null;

    /** Active execution state */
    this._executions = new Map();
  }

  /**
   * Execute a full refactoring with backup, validation, retry, and rollback.
   *
   * @param {string} repoRoot - Absolute path to the project root
   * @param {import('./refactor-planner').RefactorPlan} plan
   * @param {Object} [opts]
   * @param {EditPayload[]} [opts.edits] - Pre-computed edits (skip LLM)
   * @param {number} [opts.maxRetries=3] - Max fix-retry attempts
   * @param {boolean} [opts.dryRun=false] - Only plan, don't write
   * @param {boolean} [opts.skipValidation=false] - Skip lint/typecheck/test
   * @returns {Promise<ExecutionResult>}
   */
  async execute(repoRoot, plan, opts = {}) {
    const startTime = Date.now();
    const maxRetries = opts.maxRetries ?? MAX_RETRIES;
    const refactorId = plan.id;
    const errors = [];

    logger.info("RefactorExecutor: starting", {
      refactorId,
      files: plan.steps.length,
      dryRun: opts.dryRun,
    });

    const state = {
      id: refactorId,
      status: "running",
      backedUpFiles: new Map(), // relativePath → backup absolute path
      modifiedFiles: [],
      retries: 0,
    };
    this._executions.set(refactorId, state);

    try {
      // 1. Compute edits (either provided or generated via LLM)
      let edits;
      if (opts.edits && opts.edits.length > 0) {
        edits = opts.edits;
      } else if (this.runLLM) {
        edits = await this._generateEditsViaLLM(plan);
      } else {
        throw new Error("No edits provided and no LLM function available");
      }

      if (opts.dryRun) {
        return {
          refactorId,
          status: "completed",
          filesModified: edits.length,
          retries: 0,
          validation: { allPassed: true, results: [], summary: "dry-run" },
          rolledBackFiles: [],
          errors: [],
          durationMs: Date.now() - startTime,
          dryRun: true,
          plannedEdits: edits.map((e) => e.relativePath),
        };
      }

      // 2. Backup all target files
      const backupDir = await this._createBackup(repoRoot, edits, state);

      // 3. Apply edits
      await this._applyEdits(repoRoot, edits, state);

      // 4. Validate
      if (opts.skipValidation) {
        state.status = "completed";
        return this._buildResult(
          state,
          { allPassed: true, results: [], summary: "validation-skipped" },
          startTime,
          errors,
        );
      }

      let validation = await this.validator.validate(repoRoot, {
        changedFiles: edits.map((e) => e.relativePath),
      });

      // 5. Retry loop: if validation fails, attempt LLM fix
      while (!validation.allPassed && state.retries < maxRetries) {
        state.retries++;
        logger.info("RefactorExecutor: validation failed, attempting fix", {
          refactorId,
          retry: state.retries,
          failedSteps: validation.failedSteps,
        });

        if (!this.runLLM) {
          errors.push(`Retry ${state.retries}: No LLM available for auto-fix`);
          break;
        }

        // Generate fix edits based on validation errors
        const fixEdits = await this._generateFixEdits(plan, edits, validation);
        if (fixEdits.length === 0) {
          errors.push(`Retry ${state.retries}: LLM produced no fix edits`);
          break;
        }

        // Apply fix edits
        await this._applyEdits(repoRoot, fixEdits, state);

        // Merge fix edits into main edits list
        for (const fix of fixEdits) {
          const idx = edits.findIndex(
            (e) => e.relativePath === fix.relativePath,
          );
          if (idx >= 0) edits[idx] = fix;
          else edits.push(fix);
        }

        // Re-validate
        validation = await this.validator.validate(repoRoot, {
          changedFiles: edits.map((e) => e.relativePath),
        });
      }

      // 6. If still failing after retries → rollback
      if (!validation.allPassed) {
        logger.warn("RefactorExecutor: all retries exhausted, rolling back", {
          refactorId,
        });
        const rolledBack = await this._rollback(repoRoot, state);
        state.status = "rolled_back";
        return this._buildResult(
          state,
          validation,
          startTime,
          errors,
          rolledBack,
        );
      }

      // 7. Success — clean up backups
      state.status = "completed";
      await this._cleanupBackup(backupDir);

      return this._buildResult(state, validation, startTime, errors);
    } catch (err) {
      logger.error("RefactorExecutor: fatal error", {
        refactorId,
        error: err.message,
      });
      errors.push(err.message);

      // Attempt rollback on fatal error
      try {
        const rolledBack = await this._rollback(repoRoot, state);
        state.status = "rolled_back";
        return this._buildResult(state, null, startTime, errors, rolledBack);
      } catch (rollbackError) {
        errors.push(`Rollback failed: ${rollbackError.message}`);
        state.status = "failed";
        return this._buildResult(state, null, startTime, errors);
      }
    } finally {
      this._executions.delete(refactorId);
    }
  }

  /**
   * Get status of a running execution.
   */
  getStatus(refactorId) {
    return this._executions.get(refactorId) || null;
  }

  // ─── Private: LLM Edit Generation ──────────────────────────────────────

  async _generateEditsViaLLM(plan) {
    const edits = [];

    // For small refactors (≤8 files), use consolidated prompt
    if (plan.steps.length <= 8) {
      const { systemPrompt, userPrompt } =
        this.planner.generateConsolidatedPrompt(plan, 16000);
      const response = await this.runLLM(systemPrompt, userPrompt, {
        temperature: 0.1,
        maxTokens: 16000,
      });
      const parsed = parseMultiFileResponse(response);
      for (const [relPath, content] of Object.entries(parsed)) {
        edits.push({ relativePath: relPath, newContent: content });
      }
      // For files not in the response, assume no changes needed
    } else {
      // For large refactors, process file-by-file
      for (const step of plan.steps) {
        const { systemPrompt, userPrompt } = this.planner.generateEditPrompt(
          plan,
          step,
        );
        const response = await this.runLLM(systemPrompt, userPrompt, {
          temperature: 0.1,
          maxTokens: 8000,
        });
        const content = cleanCodeResponse(response);
        if (content && content.trim()) {
          edits.push({ relativePath: step.relativePath, newContent: content });
        }
      }
    }

    return edits;
  }

  async _generateFixEdits(plan, previousEdits, validation) {
    const fixEdits = [];

    // Collect all error messages
    const errorSummary = validation.results
      .filter((r) => !r.passed)
      .map((r) => {
        const issues = (r.issues || [])
          .slice(0, 20)
          .map((i) => `  ${i.file}:${i.line}: ${i.message}`)
          .join("\n");
        return `[${r.step}] exit=${r.exitCode}\n${issues || r.stderr.slice(0, 2000)}`;
      })
      .join("\n\n");

    const systemPrompt = `You are an expert code fixer. You receive code files that have validation errors (lint/typecheck/test failures).
Fix ALL reported errors. Output each fixed file in this format:
===FILE: <relative_path>===
<complete fixed file content>
===END_FILE===

Only output files that need changes. Preserve unchanged files.`;

    // Include the current content of erroring files
    const errorFiles = new Set();
    for (const result of validation.results) {
      for (const issue of result.issues || []) {
        if (issue.file) {
          // Normalize to relative path
          const rel = previousEdits.find((e) =>
            issue.file.endsWith(e.relativePath),
          );
          if (rel) errorFiles.add(rel.relativePath);
        }
      }
    }
    // If no specific files identified, include all modified files
    if (errorFiles.size === 0) {
      for (const edit of previousEdits) errorFiles.add(edit.relativePath);
    }

    const fileContents = [];
    for (const relPath of errorFiles) {
      const edit = previousEdits.find((e) => e.relativePath === relPath);
      if (edit) {
        fileContents.push(`--- ${relPath} ---\n${edit.newContent}`);
      }
    }

    const userPrompt = `ORIGINAL REFACTORING GOAL: ${plan.goal}

VALIDATION ERRORS:
${errorSummary}

CURRENT FILE CONTENTS:
${fileContents.join("\n\n")}

Fix all errors and output the corrected files:`;

    const response = await this.runLLM(systemPrompt, userPrompt, {
      temperature: 0.1,
      maxTokens: 16000,
    });
    const parsed = parseMultiFileResponse(response);

    for (const [relPath, content] of Object.entries(parsed)) {
      fixEdits.push({ relativePath: relPath, newContent: content });
    }

    return fixEdits;
  }

  // ─── Private: File Operations ──────────────────────────────────────────

  async _createBackup(repoRoot, edits, state) {
    const backupId = crypto.randomBytes(8).toString("hex");
    const backupDir = path.join(repoRoot, BACKUP_DIR_NAME, backupId);
    await fsp.mkdir(backupDir, { recursive: true });

    for (const edit of edits) {
      const srcPath = resolveWithinRepo(repoRoot, edit.relativePath);
      try {
        const exists = fs.existsSync(srcPath);
        if (exists) {
          const destPath = path.join(backupDir, edit.relativePath);
          await fsp.mkdir(path.dirname(destPath), { recursive: true });
          await fsp.copyFile(srcPath, destPath);
          state.backedUpFiles.set(edit.relativePath, destPath);
        }
      } catch (err) {
        logger.warn("RefactorExecutor: backup failed for file", {
          file: edit.relativePath,
          error: err.message,
        });
      }
    }

    logger.info("RefactorExecutor: backup created", {
      backupDir,
      files: state.backedUpFiles.size,
    });
    return backupDir;
  }

  async _applyEdits(repoRoot, edits, state) {
    for (const edit of edits) {
      const targetPath = resolveWithinRepo(repoRoot, edit.relativePath);

      await fsp.mkdir(path.dirname(targetPath), { recursive: true });

      const currentContent = fs.existsSync(targetPath)
        ? await fsp.readFile(targetPath, "utf-8")
        : "";

      if (edit.expectedHash) {
        const currentHash = sha256(currentContent);
        if (currentHash !== String(edit.expectedHash)) {
          throw new Error(
            `Conflict detected for ${edit.relativePath}: content hash mismatch`,
          );
        }
      }

      let nextContent;
      if (typeof edit.patch === "string" && edit.patch.trim()) {
        nextContent = applyUnifiedPatchWithFallback(currentContent, edit.patch);
      } else if (typeof edit.newContent === "string") {
        nextContent = edit.newContent;
      } else {
        throw new Error(
          `Invalid edit payload for ${edit.relativePath}: expected newContent or patch`,
        );
      }

      await fsp.writeFile(targetPath, nextContent, "utf-8");

      if (!state.modifiedFiles.includes(edit.relativePath)) {
        state.modifiedFiles.push(edit.relativePath);
      }
    }

    logger.info("RefactorExecutor: edits applied", { count: edits.length });
  }

  async _rollback(repoRoot, state) {
    const rolledBack = [];

    for (const [relPath, backupPath] of state.backedUpFiles) {
      try {
        const targetPath = resolveWithinRepo(repoRoot, relPath);
        await fsp.copyFile(backupPath, targetPath);
        rolledBack.push(relPath);
      } catch (err) {
        logger.error("RefactorExecutor: rollback failed for file", {
          file: relPath,
          error: err.message,
        });
      }
    }

    logger.info("RefactorExecutor: rollback complete", {
      files: rolledBack.length,
    });
    return rolledBack;
  }

  async _cleanupBackup(backupDir) {
    try {
      await fsp.rm(backupDir, { recursive: true, force: true });
    } catch {
      // Non-critical
    }
  }

  _buildResult(state, validation, startTime, errors, rolledBackFiles = []) {
    return {
      refactorId: state.id,
      status: state.status,
      filesModified: state.modifiedFiles.length,
      retries: state.retries,
      validation: validation || {
        allPassed: false,
        results: [],
        summary: "not-run",
      },
      rolledBackFiles,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
}

function sha256(content) {
  return crypto
    .createHash("sha256")
    .update(content || "", "utf8")
    .digest("hex");
}

function resolveWithinRepo(repoRoot, filePath) {
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, String(filePath || ""));
  const relative = path.relative(root, resolved);
  const escapesRoot =
    relative.startsWith("..") || path.isAbsolute(relative) || relative === "";
  if (escapesRoot) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
  return resolved;
}

/**
 * Apply unified diff hunks to file content.
 * Supports standard hunk headers: @@ -start,count +start,count @@
 */
function applyUnifiedPatchToText(original, patchText) {
  const originalLines = String(original || "").split("\n");
  const patchLines = String(patchText || "").split("\n");
  const hunks = [];

  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i];
    if (!line.startsWith("@@")) continue;
    const m = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);
    if (!m) {
      throw new Error(`Invalid patch hunk header: ${line}`);
    }

    const oldStart = Number(m[1]);
    const body = [];
    i++;
    while (i < patchLines.length && !patchLines[i].startsWith("@@")) {
      const bodyLine = patchLines[i];
      if (bodyLine.startsWith("\\ No newline at end of file")) {
        i++;
        continue;
      }
      body.push(bodyLine);
      i++;
    }
    i--;
    hunks.push({ oldStart, body });
  }

  if (hunks.length === 0) {
    throw new Error("Patch has no hunks");
  }

  let cursor = 0;
  const out = [];

  for (const hunk of hunks) {
    const expectedIndex = Math.max(0, hunk.oldStart - 1);
    const anchorLine =
      hunk.body.find((l) => l.startsWith(" ") || l.startsWith("-"))?.slice(1) ||
      "";

    let startIndex = expectedIndex;
    if (anchorLine && originalLines[startIndex] !== anchorLine) {
      const fuzzy = findFuzzyAnchor(originalLines, anchorLine, expectedIndex);
      if (fuzzy === -1) {
        throw new Error(
          `Patch conflict: unable to locate hunk anchor '${anchorLine}'`,
        );
      }
      startIndex = fuzzy;
    }

    if (startIndex < cursor) {
      throw new Error("Patch conflict: overlapping or out-of-order hunks");
    }

    while (cursor < startIndex) {
      out.push(originalLines[cursor]);
      cursor++;
    }

    let verificationCursor = startIndex;
    for (const bodyLine of hunk.body) {
      const kind = bodyLine[0];
      const text = bodyLine.slice(1);
      if (kind === " ") {
        if (originalLines[verificationCursor] !== text) {
          throw new Error(`Patch conflict at context line '${text}'`);
        }
        out.push(text);
        verificationCursor++;
      } else if (kind === "-") {
        if (originalLines[verificationCursor] !== text) {
          throw new Error(`Patch conflict at removal line '${text}'`);
        }
        verificationCursor++;
      } else if (kind === "+") {
        out.push(text);
      } else {
        throw new Error(`Unsupported patch line: ${bodyLine}`);
      }
    }

    cursor = verificationCursor;
  }

  while (cursor < originalLines.length) {
    out.push(originalLines[cursor]);
    cursor++;
  }

  return out.join("\n");
}

/**
 * Attempt strict unified patch first, then semantic fallback if strict apply conflicts.
 */
function applyUnifiedPatchWithFallback(original, patchText) {
  try {
    return applyUnifiedPatchToText(original, patchText);
  } catch (err) {
    if (!/Patch conflict/i.test(String(err && err.message))) {
      throw err;
    }
    return applySemanticPatchFallback(original, patchText);
  }
}

function applySemanticPatchFallback(original, patchText) {
  const originalLines = String(original || "").split("\n");
  const hunks = parsePatchHunks(patchText);
  let working = originalLines.slice();

  for (const hunk of hunks) {
    const removeLines = hunk.body
      .filter((l) => l.startsWith("-"))
      .map((l) => l.slice(1));
    const addLines = hunk.body
      .filter((l) => l.startsWith("+"))
      .map((l) => l.slice(1));
    const contextLines = hunk.body
      .filter((l) => l.startsWith(" "))
      .map((l) => l.slice(1));

    const oldStart = Math.max(0, hunk.oldStart - 1);
    const anchor = contextLines[0] || removeLines[0] || "";
    let at = oldStart;

    if (anchor) {
      at = findSemanticAnchor(working, anchor, oldStart);
      if (at === -1) {
        throw new Error(
          `Patch conflict: semantic anchor not found '${anchor}'`,
        );
      }
    }

    const removeStart = findRemovalBlockStart(working, removeLines, at);
    if (removeLines.length > 0 && removeStart === -1) {
      throw new Error("Patch conflict: semantic removal block not found");
    }

    if (removeLines.length === 0) {
      // Pure insertion around anchor.
      const insertAt = Math.min(working.length, at + contextLines.length);
      working = [
        ...working.slice(0, insertAt),
        ...addLines,
        ...working.slice(insertAt),
      ];
    } else {
      working = [
        ...working.slice(0, removeStart),
        ...addLines,
        ...working.slice(removeStart + removeLines.length),
      ];
    }
  }

  return working.join("\n");
}

function parsePatchHunks(patchText) {
  const patchLines = String(patchText || "").split("\n");
  const hunks = [];
  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i];
    if (!line.startsWith("@@")) continue;
    const m = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);
    if (!m) throw new Error(`Invalid patch hunk header: ${line}`);
    const oldStart = Number(m[1]);
    const body = [];
    i++;
    while (i < patchLines.length && !patchLines[i].startsWith("@@")) {
      const bodyLine = patchLines[i];
      if (!bodyLine.startsWith("\\ No newline")) body.push(bodyLine);
      i++;
    }
    i--;
    hunks.push({ oldStart, body });
  }
  if (hunks.length === 0) throw new Error("Patch has no hunks");
  return hunks;
}

function normalizeWs(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .trim();
}

function findSemanticAnchor(lines, anchorLine, aroundIndex) {
  const norm = normalizeWs(anchorLine);
  if (!norm) return aroundIndex;
  const maxDelta = 120;
  for (let delta = 0; delta <= maxDelta; delta++) {
    const low = aroundIndex - delta;
    if (low >= 0 && normalizeWs(lines[low]) === norm) return low;
    const high = aroundIndex + delta;
    if (high < lines.length && normalizeWs(lines[high]) === norm) return high;
  }
  for (let i = 0; i < lines.length; i++) {
    if (normalizeWs(lines[i]) === norm) return i;
  }
  return -1;
}

function findRemovalBlockStart(lines, removeLines, aroundIndex) {
  if (!Array.isArray(removeLines) || removeLines.length === 0) {
    return aroundIndex;
  }
  const normRemove = removeLines.map(normalizeWs);
  const maxScan = Math.min(lines.length, aroundIndex + 200);
  const minScan = Math.max(0, aroundIndex - 200);

  for (let i = minScan; i <= maxScan; i++) {
    let ok = true;
    for (let j = 0; j < normRemove.length; j++) {
      if (i + j >= lines.length) {
        ok = false;
        break;
      }
      if (normalizeWs(lines[i + j]) !== normRemove[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function findFuzzyAnchor(lines, anchor, aroundIndex) {
  const maxDelta = 60;
  for (let delta = 0; delta <= maxDelta; delta++) {
    const low = aroundIndex - delta;
    if (low >= 0 && lines[low] === anchor) return low;
    const high = aroundIndex + delta;
    if (high < lines.length && lines[high] === anchor) return high;
  }
  return -1;
}

// ─── Response Parsers ───────────────────────────────────────────────────────

/**
 * Parse a multi-file LLM response in the format:
 *   ===FILE: relative/path.ts===
 *   <content>
 *   ===END_FILE===
 *
 * @param {string} response
 * @returns {Object<string, string>} relativePath → content
 */
function parseMultiFileResponse(response) {
  const files = {};
  const re = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g;
  let m;
  while ((m = re.exec(response)) !== null) {
    const filePath = m[1].trim();
    const content = m[2];
    // Validate path doesn't contain traversal
    if (!filePath.includes("..") && !path.isAbsolute(filePath)) {
      files[filePath] = content;
    }
  }
  return files;
}

/**
 * Clean a single-file LLM response: strip markdown fences, leading/trailing text.
 */
function cleanCodeResponse(response) {
  if (!response) return "";
  let code = response;

  // Remove markdown code fences
  code = code.replace(/^```[\w]*\n/gm, "").replace(/\n```$/gm, "");

  // If the response starts with explanatory text before code, try to find the code block
  const fenceMatch = response.match(/```[\w]*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    code = fenceMatch[1];
  }

  return code;
}

module.exports = {
  RefactorExecutor,
  parseMultiFileResponse,
  cleanCodeResponse,
  applyUnifiedPatchToText,
  applyUnifiedPatchWithFallback,
};
