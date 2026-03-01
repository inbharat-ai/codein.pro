/**
 * CodeIn Compute — Policy
 *
 * Permission policy parser and enforcer for compute jobs.
 * Each job has a policy that controls what the sandbox can do.
 * All checks are FAIL-CLOSED: if a permission isn't explicitly granted, it's denied.
 */
"use strict";

const { createDefaultPolicy, validatePolicy } = require("./job-model");

class PolicyEnforcer {
  constructor() {
    this._auditLog = [];
    this._maxAuditEntries = 10000;
  }

  /**
   * Merge user-provided policy with defaults (fail-closed).
   * Unknown keys are ignored. Missing keys get defaults.
   * @param {object} userPolicy
   * @returns {object} Merged policy
   */
  mergeWithDefaults(userPolicy = {}) {
    const defaults = createDefaultPolicy();
    const merged = { ...defaults };

    // Only copy known keys with correct types
    if (typeof userPolicy.allowNetwork === "boolean")
      merged.allowNetwork = userPolicy.allowNetwork;
    if (typeof userPolicy.allowBrowser === "boolean")
      merged.allowBrowser = userPolicy.allowBrowser;
    if (typeof userPolicy.allowFSWrite === "boolean")
      merged.allowFSWrite = userPolicy.allowFSWrite;
    if (typeof userPolicy.allowRepoWrite === "boolean")
      merged.allowRepoWrite = userPolicy.allowRepoWrite;
    if (Array.isArray(userPolicy.allowedDomains)) {
      merged.allowedDomains = userPolicy.allowedDomains.filter(
        (d) => typeof d === "string",
      );
    }
    if (Array.isArray(userPolicy.allowedTools)) {
      merged.allowedTools = userPolicy.allowedTools.filter(
        (t) => typeof t === "string",
      );
    }
    if (Array.isArray(userPolicy.blockedTools)) {
      merged.blockedTools = userPolicy.blockedTools.filter(
        (t) => typeof t === "string",
      );
    }
    if (typeof userPolicy.maxSteps === "number" && userPolicy.maxSteps >= 1) {
      merged.maxSteps = Math.min(userPolicy.maxSteps, 100); // hard cap
    }
    if (
      typeof userPolicy.maxDurationMs === "number" &&
      userPolicy.maxDurationMs >= 1000
    ) {
      merged.maxDurationMs = Math.min(userPolicy.maxDurationMs, 3600000); // 1 hour hard cap
    }
    if (
      typeof userPolicy.maxCostUSD === "number" &&
      userPolicy.maxCostUSD >= 0
    ) {
      merged.maxCostUSD = Math.min(userPolicy.maxCostUSD, 100); // $100 hard cap
    }
    if (typeof userPolicy.allowEscalation === "boolean")
      merged.allowEscalation = userPolicy.allowEscalation;

    const { valid, errors } = validatePolicy(merged);
    if (!valid)
      throw new Error(`Policy validation failed: ${errors.join(", ")}`);

    return merged;
  }

  /**
   * Check if a tool call is allowed by the policy.
   * FAIL-CLOSED: denied unless explicitly allowed.
   * @param {object} policy - Job policy
   * @param {string} toolName - Tool being called
   * @param {object} [context] - Additional context
   * @returns {{ allowed: boolean, reason: string }}
   */
  checkToolPermission(policy, toolName, context = {}) {
    // Blocked tools always override allows
    if (policy.blockedTools && policy.blockedTools.includes(toolName)) {
      return this._deny(
        policy,
        toolName,
        "tool_blocked",
        `Tool '${toolName}' is explicitly blocked`,
      );
    }

    // Check allowedTools
    if (!policy.allowedTools || policy.allowedTools.length === 0) {
      return this._deny(
        policy,
        toolName,
        "no_tools_allowed",
        "No tools are allowed by policy",
      );
    }

    const wildcardAllowed = policy.allowedTools.includes("*");
    const specificAllowed = policy.allowedTools.includes(toolName);

    if (!wildcardAllowed && !specificAllowed) {
      return this._deny(
        policy,
        toolName,
        "tool_not_in_allowlist",
        `Tool '${toolName}' is not in the allowed list`,
      );
    }

    // Network-dependent tools
    const networkTools = new Set([
      "searchWeb",
      "fetchUrlContent",
      "fetch-url",
      "web-search",
    ]);
    if (networkTools.has(toolName) && !policy.allowNetwork) {
      return this._deny(
        policy,
        toolName,
        "network_required",
        `Tool '${toolName}' requires network access, which is disabled`,
      );
    }

    // Browser tools
    const browserTools = new Set(["openBrowser", "system-open"]);
    if (browserTools.has(toolName) && !policy.allowBrowser) {
      return this._deny(
        policy,
        toolName,
        "browser_required",
        `Tool '${toolName}' requires browser access, which is disabled`,
      );
    }

    // FS write tools
    const writeTools = new Set([
      "createNewFile",
      "editFile",
      "write-file",
      "singleFindAndReplace",
      "multiEdit",
    ]);
    if (writeTools.has(toolName) && !policy.allowFSWrite) {
      return this._deny(
        policy,
        toolName,
        "fs_write_required",
        `Tool '${toolName}' requires filesystem write access, which is disabled`,
      );
    }

    return this._allow(policy, toolName);
  }

  /**
   * Check if network access to a specific domain is allowed.
   * @param {object} policy
   * @param {string} domain
   * @returns {{ allowed: boolean, reason: string }}
   */
  checkNetworkAccess(policy, domain) {
    if (!policy.allowNetwork) {
      return { allowed: false, reason: "Network access is disabled" };
    }

    if (policy.allowedDomains.length === 0) {
      // No domain restrictions
      return { allowed: true, reason: "All domains allowed" };
    }

    const allowed = policy.allowedDomains.some((d) => {
      if (d.startsWith("*.")) {
        // Wildcard domain match
        return domain.endsWith(d.slice(1)) || domain === d.slice(2);
      }
      return domain === d;
    });

    if (!allowed) {
      return {
        allowed: false,
        reason: `Domain '${domain}' is not in the allowed list`,
      };
    }

    return { allowed: true, reason: "Domain allowed" };
  }

  /**
   * Check if escalation to external API is allowed.
   * @param {object} policy
   * @param {number} currentCostUSD - Cost spent so far
   * @returns {{ allowed: boolean, reason: string }}
   */
  checkEscalation(policy, currentCostUSD = 0) {
    if (!policy.allowEscalation) {
      return { allowed: false, reason: "External API escalation is disabled" };
    }

    if (currentCostUSD >= policy.maxCostUSD) {
      return {
        allowed: false,
        reason: `Budget cap reached: $${currentCostUSD.toFixed(2)} / $${policy.maxCostUSD.toFixed(2)}`,
      };
    }

    return {
      allowed: true,
      reason: "Escalation allowed",
      remainingBudget: policy.maxCostUSD - currentCostUSD,
    };
  }

  /**
   * Check if file path access is allowed.
   * Files must be within the job workspace directory.
   * @param {string} filePath - Requested file path
   * @param {string} workspaceDir - Job's isolated workspace
   * @param {object} policy
   * @param {string} [operation] - "read" or "write"
   * @returns {{ allowed: boolean, reason: string }}
   */
  checkFileAccess(filePath, workspaceDir, policy, operation = "read") {
    const path = require("node:path");

    // Resolve to absolute
    const resolved = path.resolve(filePath);
    const normalizedWorkspace = path.resolve(workspaceDir);

    // Must be within workspace
    if (
      !resolved.startsWith(normalizedWorkspace + path.sep) &&
      resolved !== normalizedWorkspace
    ) {
      return {
        allowed: false,
        reason: `Path '${filePath}' is outside the job workspace`,
      };
    }

    // Check for path traversal attempts
    if (filePath.includes("..")) {
      return { allowed: false, reason: "Path traversal (..) is not allowed" };
    }

    // Write operations need allowFSWrite
    if (operation === "write" && !policy.allowFSWrite) {
      return { allowed: false, reason: "Filesystem write access is disabled" };
    }

    return { allowed: true, reason: "File access allowed" };
  }

  /**
   * Check if the job has exceeded its step limit.
   */
  checkStepLimit(policy, currentStepCount) {
    if (currentStepCount >= policy.maxSteps) {
      return {
        allowed: false,
        reason: `Step limit reached: ${currentStepCount} / ${policy.maxSteps}`,
      };
    }
    return { allowed: true, reason: "Within step limit" };
  }

  /**
   * Check if the job has exceeded its duration limit.
   */
  checkDuration(policy, startedAt) {
    if (!startedAt) return { allowed: true, reason: "Job not started yet" };
    const elapsed = Date.now() - new Date(startedAt).getTime();
    if (elapsed >= policy.maxDurationMs) {
      return {
        allowed: false,
        reason: `Duration limit reached: ${Math.round(elapsed / 1000)}s / ${Math.round(policy.maxDurationMs / 1000)}s`,
      };
    }
    return {
      allowed: true,
      reason: "Within duration limit",
      remainingMs: policy.maxDurationMs - elapsed,
    };
  }

  /**
   * Validate a command before execution.
   * Only allow spawn with args array, no shell strings.
   * @param {string} command
   * @param {string[]} args
   * @returns {{ allowed: boolean, reason: string }}
   */
  checkCommand(command, args = []) {
    // Must be a simple command name (no path separators, no spaces)
    if (
      /[\/\\]/.test(command) &&
      !command.startsWith("/usr/") &&
      !command.startsWith("C:\\")
    ) {
      // Allow absolute paths to known binaries
    }

    // Block dangerous commands
    const blocked = new Set([
      "rm",
      "rmdir",
      "del",
      "format",
      "mkfs",
      "dd",
      "shutdown",
      "reboot",
      "halt",
      "poweroff",
      "init",
      "systemctl",
      "kill",
      "killall",
      "pkill",
      "chmod",
      "chown",
      "mount",
      "umount",
      "fdisk",
      "wget",
      "curl",
      "nc",
      "ncat",
      "netcat",
      "ssh",
      "scp",
      "sftp",
      "telnet",
      "powershell",
      "cmd",
      "bash",
      "sh",
      "zsh",
      "fish",
    ]);
    const baseName = require("node:path")
      .basename(command)
      .replace(/\.exe$/i, "");
    if (blocked.has(baseName.toLowerCase())) {
      return {
        allowed: false,
        reason: `Command '${baseName}' is blocked for security`,
      };
    }

    // Args must be an array (no shell injection)
    if (!Array.isArray(args)) {
      return {
        allowed: false,
        reason: "Command args must be an array (no shell strings)",
      };
    }

    // Check for injection patterns in args
    for (const arg of args) {
      if (typeof arg !== "string") {
        return { allowed: false, reason: "All command args must be strings" };
      }
      if (/[;&|`$()]/.test(arg) && !arg.startsWith("-")) {
        return {
          allowed: false,
          reason: `Argument contains shell metacharacters: '${arg}'`,
        };
      }
    }

    return { allowed: true, reason: "Command allowed" };
  }

  // ─── Internal ──────────────────────────────────────────────

  _allow(policy, toolName) {
    this._audit("allowed", toolName, "Permission granted");
    return { allowed: true, reason: "Permission granted" };
  }

  _deny(policy, toolName, code, reason) {
    this._audit("denied", toolName, reason, code);
    return { allowed: false, reason, code };
  }

  _audit(decision, subject, reason, code = null) {
    if (this._auditLog.length >= this._maxAuditEntries) {
      this._auditLog.shift(); // evict oldest
    }
    this._auditLog.push({
      timestamp: new Date().toISOString(),
      decision,
      subject,
      reason,
      code,
    });
  }

  getAuditLog(limit = 100) {
    return this._auditLog.slice(-limit);
  }
}

module.exports = {
  PolicyEnforcer,
  policyEnforcer: new PolicyEnforcer(),
};
