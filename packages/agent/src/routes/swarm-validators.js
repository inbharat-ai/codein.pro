"use strict";

/**
 * CodeIn MAS — Security Validators
 *
 * Pure validation functions extracted from swarm routes for
 * testability and consistent security enforcement.
 */

/**
 * Validate a terminal command string.
 * Uses an allowlist approach: only printable ASCII (0x20-0x7E) minus
 * a set of dangerous shell metacharacters.
 *
 * @param {string} command - Raw command string
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTerminalCommand(command) {
  if (!command || typeof command !== "string") {
    return {
      valid: false,
      error: "'command' is required and must be a string",
    };
  }

  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "'command' must not be empty" };
  }
  if (trimmed.length > 4096) {
    return {
      valid: false,
      error: "Command exceeds maximum length of 4096 characters",
    };
  }

  // Allowlist: only printable ASCII (0x20-0x7E)
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return {
        valid: false,
        error: "Command contains non-printable or non-ASCII characters",
      };
    }
  }

  // Reject dangerous shell metacharacters
  if (/[;&|`$(){}<>]/.test(trimmed)) {
    return {
      valid: false,
      error: "Command contains disallowed shell metacharacters",
    };
  }

  return { valid: true, trimmed };
}

/**
 * Validate a git branch name.
 *
 * Rules:
 *  - Max 100 characters
 *  - Must start and end with alphanumeric
 *  - Allowed chars: a-z A-Z 0-9 . _ - /
 *  - No "..", no "//", no ".lock" suffix, no control characters
 *
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
function validateGitBranch(name) {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "'name' is required and must be a string" };
  }
  if (name.length > 100) {
    return {
      valid: false,
      error: "Branch name exceeds maximum length of 100 characters",
    };
  }
  // Must start with alphanumeric (also rejects leading "-")
  if (!/^[a-zA-Z0-9]/.test(name)) {
    return {
      valid: false,
      error: "Branch name must start with an alphanumeric character",
    };
  }
  // Must end with alphanumeric
  if (!/[a-zA-Z0-9]$/.test(name)) {
    return {
      valid: false,
      error: "Branch name must end with an alphanumeric character",
    };
  }
  // Only allowed characters
  if (!/^[a-zA-Z0-9._\-/]+$/.test(name)) {
    return {
      valid: false,
      error:
        "Branch name contains invalid characters — only alphanumeric, hyphens, underscores, dots, slashes allowed",
    };
  }
  // Reject ".."
  if (name.includes("..")) {
    return { valid: false, error: "Branch name must not contain '..'" };
  }
  // Reject "//"
  if (name.includes("//")) {
    return { valid: false, error: "Branch name must not contain '//'" };
  }
  // Reject ".lock" suffix
  if (name.endsWith(".lock")) {
    return { valid: false, error: "Branch name must not end with '.lock'" };
  }

  return { valid: true };
}

/**
 * Validate an array of file paths for git staging.
 *
 * Rules:
 *  - Must be a non-empty array, max 100 files
 *  - Each path: string, no "..", no leading "/" or "\\",
 *    no null bytes, no control characters (< 0x20), max 500 chars
 *
 * @param {any} files
 * @returns {{ valid: boolean, error?: string }}
 */
function validateGitStagePaths(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return {
      valid: false,
      error: "'files' is required and must be a non-empty array",
    };
  }
  if (files.length > 100) {
    return {
      valid: false,
      error: "Too many files — maximum 100 files per request",
    };
  }

  for (const f of files) {
    if (typeof f !== "string") {
      return { valid: false, error: `Invalid file path: not a string` };
    }
    if (f.length > 500) {
      return {
        valid: false,
        error: `File path exceeds maximum length of 500 characters`,
      };
    }
    if (f.includes("\0")) {
      return { valid: false, error: `File path contains null byte` };
    }
    // Reject control characters (< 0x20)
    for (let i = 0; i < f.length; i++) {
      if (f.charCodeAt(i) < 0x20) {
        return { valid: false, error: `File path contains control characters` };
      }
    }
    if (f.includes("..")) {
      return { valid: false, error: `Invalid file path: ${f.slice(0, 60)}` };
    }
    if (f.startsWith("/") || f.startsWith("\\")) {
      return { valid: false, error: `Invalid file path: ${f.slice(0, 60)}` };
    }
  }

  return { valid: true };
}

module.exports = {
  validateTerminalCommand,
  validateGitBranch,
  validateGitStagePaths,
};
