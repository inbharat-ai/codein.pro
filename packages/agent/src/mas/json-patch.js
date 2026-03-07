/**
 * CodIn MAS — JSON Patch Engine
 *
 * Strict JSON patch validation, auto-repair, backup, and rollback.
 * Follows RFC 6902 subset: add, remove, replace, move, copy, test.
 *
 * Safety guarantees:
 *   - Schema-validate every patch before apply
 *   - Auto-repair malformed patches (one retry)
 *   - Backup original file before applying
 *   - Rollback on failure
 *   - Never apply an invalid patch
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

// ─── Constants ───────────────────────────────────────────────
const VALID_OPS = new Set(["add", "remove", "replace", "move", "copy", "test"]);
const BACKUP_DIR_BASE = path.join(os.homedir(), ".codein", "swarm");

// ═══════════════════════════════════════════════════════════════
// PATCH VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validate a single JSON patch operation.
 * @param {object} op
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePatchOp(op) {
  const errors = [];
  if (!op || typeof op !== "object") {
    return { valid: false, errors: ["Patch op must be an object"] };
  }
  if (!VALID_OPS.has(op.op)) {
    errors.push(
      `Invalid op: '${op.op}'. Must be one of: ${[...VALID_OPS].join(", ")}`,
    );
  }
  if (typeof op.path !== "string") {
    errors.push("'path' must be a string");
  } else if (!op.path.startsWith("/") && op.path !== "") {
    errors.push("'path' must start with '/' or be empty string");
  }
  if (op.op === "add" || op.op === "replace" || op.op === "test") {
    if (!("value" in op)) {
      errors.push(`'${op.op}' requires a 'value' field`);
    }
  }
  if (op.op === "move" || op.op === "copy") {
    if (typeof op.from !== "string") {
      errors.push(`'${op.op}' requires a 'from' string`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an array of patch operations.
 * @param {object[]} patches
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePatch(patches) {
  if (!Array.isArray(patches)) {
    return { valid: false, errors: ["Patch must be an array of operations"] };
  }
  if (patches.length === 0) {
    return { valid: false, errors: ["Patch array is empty"] };
  }
  const errors = [];
  for (let i = 0; i < patches.length; i++) {
    const result = validatePatchOp(patches[i]);
    if (!result.valid) {
      for (const e of result.errors) errors.push(`[${i}] ${e}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════
// PATCH APPLICATION (RFC 6902 subset)
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a JSON pointer path into an array of segments.
 * @param {string} pointer — e.g., "/foo/bar/0"
 * @returns {string[]}
 */
function parsePointer(pointer) {
  if (pointer === "" || pointer === "/") return [];
  return pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/**
 * Get a value at a JSON pointer path.
 * @param {*} doc
 * @param {string[]} segments
 * @returns {*}
 */
function getAtPath(doc, segments) {
  let current = doc;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = seg === "-" ? current.length : parseInt(seg, 10);
      current = current[idx];
    } else if (typeof current === "object") {
      current = current[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Set a value at a JSON pointer path (mutates doc).
 * @param {*} doc
 * @param {string[]} segments
 * @param {*} value
 */
function setAtPath(doc, segments, value) {
  if (segments.length === 0) {
    throw new Error("Cannot set at root — return the value directly");
  }
  let current = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (Array.isArray(current)) {
      current = current[parseInt(seg, 10)];
    } else {
      current = current[seg];
    }
    if (current === null || current === undefined) {
      throw new Error(`Path segment '${seg}' does not exist`);
    }
  }
  const lastSeg = segments[segments.length - 1];
  if (Array.isArray(current)) {
    const idx = lastSeg === "-" ? current.length : parseInt(lastSeg, 10);
    current.splice(idx, 0, value);
  } else {
    current[lastSeg] = value;
  }
}

/**
 * Remove a value at a JSON pointer path (mutates doc).
 * @param {*} doc
 * @param {string[]} segments
 */
function removeAtPath(doc, segments) {
  if (segments.length === 0) {
    throw new Error("Cannot remove root");
  }
  let current = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (Array.isArray(current)) {
      current = current[parseInt(seg, 10)];
    } else {
      current = current[seg];
    }
    if (current === null || current === undefined) {
      throw new Error(`Path segment '${seg}' does not exist`);
    }
  }
  const lastSeg = segments[segments.length - 1];
  if (Array.isArray(current)) {
    current.splice(parseInt(lastSeg, 10), 1);
  } else {
    delete current[lastSeg];
  }
}

/**
 * Apply a single patch operation to a document (mutates doc).
 * @param {*} doc
 * @param {object} op
 * @returns {*} modified doc (for root-level replacements)
 */
function applyOp(doc, op) {
  const segments = parsePointer(op.path);

  switch (op.op) {
    case "add":
      if (segments.length === 0) return op.value;
      setAtPath(doc, segments, structuredClone(op.value));
      return doc;

    case "remove":
      removeAtPath(doc, segments);
      return doc;

    case "replace": {
      if (segments.length === 0) return op.value;
      removeAtPath(doc, segments);
      setAtPath(doc, segments, structuredClone(op.value));
      return doc;
    }

    case "move": {
      const fromSegments = parsePointer(op.from);
      const value = getAtPath(doc, fromSegments);
      if (value === undefined)
        throw new Error(`move: source '${op.from}' not found`);
      removeAtPath(doc, fromSegments);
      setAtPath(doc, segments, structuredClone(value));
      return doc;
    }

    case "copy": {
      const fromSegments = parsePointer(op.from);
      const value = getAtPath(doc, fromSegments);
      if (value === undefined)
        throw new Error(`copy: source '${op.from}' not found`);
      setAtPath(doc, segments, structuredClone(value));
      return doc;
    }

    case "test": {
      const actual = getAtPath(doc, segments);
      if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
        throw new Error(
          `test failed: at '${op.path}', expected ${JSON.stringify(op.value)}, got ${JSON.stringify(actual)}`,
        );
      }
      return doc;
    }

    default:
      throw new Error(`Unknown op: ${op.op}`);
  }
}

/**
 * Apply a full patch (array of operations) to a document.
 * Returns a new document (deep clones first).
 *
 * @param {*} doc — Original document
 * @param {object[]} patches — Array of patch ops
 * @returns {{ success: boolean, result?: *, error?: string, appliedOps: number }}
 */
function applyPatch(doc, patches) {
  const validation = validatePatch(patches);
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join("; ")}`,
      appliedOps: 0,
    };
  }

  let working = structuredClone(doc);
  let appliedOps = 0;

  try {
    for (const op of patches) {
      working = applyOp(working, op);
      appliedOps++;
    }
    return { success: true, result: working, appliedOps };
  } catch (err) {
    return { success: false, error: err.message, appliedOps };
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTO-REPAIR
// ═══════════════════════════════════════════════════════════════

/**
 * Attempt to repair a malformed patch array.
 * Fixes common issues: missing leading slash, wrong op names.
 *
 * @param {*} patches
 * @returns {{ repaired: boolean, patches: object[], fixes: string[] }}
 */
function repairPatch(patches) {
  if (!Array.isArray(patches)) {
    return { repaired: false, patches: [], fixes: ["Not an array"] };
  }
  const fixes = [];
  const repaired = patches.map((op, i) => {
    const fixed = { ...op };

    // Fix missing leading slash in path
    if (
      typeof fixed.path === "string" &&
      fixed.path &&
      !fixed.path.startsWith("/")
    ) {
      fixed.path = "/" + fixed.path;
      fixes.push(`[${i}] Added leading '/' to path`);
    }

    // Fix missing leading slash in from
    if (
      typeof fixed.from === "string" &&
      fixed.from &&
      !fixed.from.startsWith("/")
    ) {
      fixed.from = "/" + fixed.from;
      fixes.push(`[${i}] Added leading '/' to from`);
    }

    // Fix common op name typos
    if (typeof fixed.op === "string") {
      const normalized = fixed.op.toLowerCase().trim();
      if (
        normalized === "set" ||
        normalized === "put" ||
        normalized === "update"
      ) {
        fixed.op = "replace";
        fixes.push(`[${i}] Changed op '${op.op}' → 'replace'`);
      } else if (normalized === "insert" || normalized === "append") {
        fixed.op = "add";
        fixes.push(`[${i}] Changed op '${op.op}' → 'add'`);
      } else if (
        normalized === "del" ||
        normalized === "delete" ||
        normalized === "unset"
      ) {
        fixed.op = "remove";
        fixes.push(`[${i}] Changed op '${op.op}' → 'remove'`);
      } else {
        fixed.op = normalized;
      }
    }

    return fixed;
  });

  return { repaired: fixes.length > 0, patches: repaired, fixes };
}

// ═══════════════════════════════════════════════════════════════
// FILE-LEVEL PATCH ENGINE
// ═══════════════════════════════════════════════════════════════

class JsonPatchEngine {
  /**
   * @param {object} [opts]
   * @param {string} [opts.workspaceHash] — For backup directory
   */
  constructor(opts = {}) {
    this._backupDir = path.join(
      BACKUP_DIR_BASE,
      opts.workspaceHash || "default",
      "backups",
    );
  }

  /**
   * Apply a JSON patch to a file with backup and rollback.
   *
   * @param {string} filePath — Absolute path to JSON file
   * @param {object[]} patches — Array of patch ops
   * @param {object} [opts]
   * @param {boolean} [opts.autoRepair] — Try to repair malformed patches (default true)
   * @returns {Promise<{ success: boolean, backupPath?: string, error?: string, appliedOps: number, fixes?: string[] }>}
   */
  async applyToFile(filePath, patches, opts = {}) {
    const autoRepair = opts.autoRepair !== false;

    // 1. Read original
    let original;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      original = JSON.parse(raw);
    } catch (err) {
      return {
        success: false,
        error: `Cannot read/parse file: ${err.message}`,
        appliedOps: 0,
      };
    }

    // 2. Validate patch
    let patchesToApply = patches;
    let fixes = [];
    const validation = validatePatch(patches);

    if (!validation.valid && autoRepair) {
      const repair = repairPatch(patches);
      if (repair.repaired) {
        fixes = repair.fixes;
        patchesToApply = repair.patches;
        const revalidation = validatePatch(patchesToApply);
        if (!revalidation.valid) {
          return {
            success: false,
            error: `Repair failed: ${revalidation.errors.join("; ")}`,
            appliedOps: 0,
            fixes,
          };
        }
      } else {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join("; ")}`,
          appliedOps: 0,
        };
      }
    } else if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join("; ")}`,
        appliedOps: 0,
      };
    }

    // 3. Backup
    const backupPath = this._backup(filePath, original);

    // 4. Apply
    const result = applyPatch(original, patchesToApply);
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        appliedOps: result.appliedOps,
        backupPath,
        fixes,
      };
    }

    // 5. Write patched file
    try {
      fs.writeFileSync(
        filePath,
        JSON.stringify(result.result, null, 2),
        "utf8",
      );
    } catch (err) {
      // Rollback
      this._rollback(filePath, backupPath);
      return {
        success: false,
        error: `Write failed (rolled back): ${err.message}`,
        appliedOps: result.appliedOps,
        backupPath,
        fixes,
      };
    }

    return {
      success: true,
      appliedOps: result.appliedOps,
      backupPath,
      fixes: fixes.length > 0 ? fixes : undefined,
    };
  }

  /**
   * Rollback a file from its backup.
   * @param {string} filePath
   * @param {string} backupPath
   */
  rollback(filePath, backupPath) {
    this._rollback(filePath, backupPath);
  }

  _backup(filePath, content) {
    fs.mkdirSync(this._backupDir, { recursive: true });
    const hash = crypto
      .createHash("md5")
      .update(filePath)
      .digest("hex")
      .slice(0, 8);
    const ts = Date.now();
    const backupPath = path.join(this._backupDir, `${hash}_${ts}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(content, null, 2), "utf8");
    return backupPath;
  }

  _rollback(filePath, backupPath) {
    try {
      if (fs.existsSync(backupPath)) {
        const backup = fs.readFileSync(backupPath, "utf8");
        fs.writeFileSync(filePath, backup, "utf8");
      }
    } catch {
      // Cannot rollback — log but don't crash
    }
  }
}

module.exports = {
  validatePatchOp,
  validatePatch,
  parsePointer,
  getAtPath,
  setAtPath,
  removeAtPath,
  applyOp,
  applyPatch,
  repairPatch,
  JsonPatchEngine,
  VALID_OPS,
};
