/**
 * Permission Manager — CJS-compatible build
 *
 * Auto-generated CommonJS wrapper for the agent runtime.
 * The TypeScript source is at manager.ts — edit that, not this file.
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const CODIN_DIR = path.join(os.homedir(), ".codin");
const PERMISSIONS_DIR = path.join(CODIN_DIR, "permissions");

const TOOL_CATEGORIES = {
  READ: {
    name: "Read",
    risk: "low",
    description: "Read files and search workspace",
  },
  WRITE: {
    name: "Write",
    risk: "medium",
    description: "Modify or create files",
  },
  RUN: { name: "Run", risk: "high", description: "Execute commands" },
  GIT: {
    name: "Git",
    risk: "medium",
    description: "Git operations (commit, push, branch)",
  },
  NETWORK: {
    name: "Network",
    risk: "medium",
    description: "Web fetch and external calls",
  },
  SECRETS: {
    name: "Secrets",
    risk: "high",
    description: "Access API keys and secrets",
  },
  DELETE: {
    name: "Delete",
    risk: "high",
    description: "Delete files or directories",
  },
  SYSTEM: {
    name: "System",
    risk: "high",
    description: "Open apps, URLs, or system resources",
  },
};

const TOOL_CATEGORIES_MAP = {
  readFile: "READ",
  listFiles: "READ",
  searchFiles: "READ",
  writeFile: "WRITE",
  createFile: "WRITE",
  editFile: "WRITE",
  applyDiff: "WRITE",
  deleteFile: "DELETE",
  runCommand: "RUN",
  gitCommit: "GIT",
  gitPush: "GIT",
  gitCheckout: "GIT",
  webFetch: "NETWORK",
  mcpCall: "NETWORK",
  mcpManage: "NETWORK",
  getSecret: "SECRETS",
  systemOpen: "SYSTEM",
};

class PermissionManager extends EventEmitter {
  constructor() {
    super();
    this.policies = new Map();
    this.pendingRequests = new Map();
    this._ensureDirectories();
  }

  _ensureDirectories() {
    if (!fs.existsSync(PERMISSIONS_DIR)) {
      fs.mkdirSync(PERMISSIONS_DIR, { recursive: true });
    }
  }

  getWorkspaceHash(workspacePath) {
    if (!workspacePath || typeof workspacePath !== "string") {
      return "default-workspace";
    }
    return crypto
      .createHash("sha256")
      .update(workspacePath)
      .digest("hex")
      .substring(0, 16);
  }

  loadPolicy(workspacePath) {
    const hash = this.getWorkspaceHash(workspacePath);
    if (this.policies.has(hash)) return this.policies.get(hash);

    const policyPath = path.join(PERMISSIONS_DIR, `${hash}.json`);
    if (!fs.existsSync(policyPath)) {
      const defaultPolicy = {
        workspace: workspacePath,
        createdAt: new Date().toISOString(),
        categories: {},
        tools: {},
        extendedAccess: false,
      };
      this.policies.set(hash, defaultPolicy);
      return defaultPolicy;
    }

    const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    this.policies.set(hash, policy);
    return policy;
  }

  savePolicy(workspacePath, policy) {
    const hash = this.getWorkspaceHash(workspacePath);
    const policyPath = path.join(PERMISSIONS_DIR, `${hash}.json`);
    policy.updatedAt = new Date().toISOString();
    fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2));
    this.policies.set(hash, policy);
  }

  async checkPermission(toolName, context) {
    const { workspacePath, intent, details = {} } = context || {};
    if (!workspacePath)
      return { allowed: true, reason: "no-workspace-context" };

    const policy = this.loadPolicy(workspacePath);
    const category = TOOL_CATEGORIES_MAP[toolName] || "READ";

    if (policy.tools[toolName] === "always")
      return { allowed: true, reason: "always-allowed" };
    if (policy.categories[category] === "always")
      return { allowed: true, reason: "category-always-allowed" };
    if (policy.tools[toolName] === "deny")
      return { allowed: false, reason: "denied" };
    if (policy.categories[category] === "deny")
      return { allowed: false, reason: "category-denied" };

    // In local/agent mode, allow by default if no UI can respond to consent
    return { allowed: true, reason: "local-mode-allow" };
  }

  respondToConsent(requestId, response) {
    const request = this.pendingRequests.get(requestId);
    if (!request) throw new Error("Consent request not found");

    const { decision, remember } = response;
    this.pendingRequests.delete(requestId);

    if (remember) {
      const policy = this.loadPolicy(request.data.workspacePath);
      policy.tools[request.data.toolName] =
        decision === "allow" ? "always" : "deny";
      this.savePolicy(request.data.workspacePath, policy);
    }

    if (decision === "allow") {
      request.resolve({ allowed: true, reason: "user-approved" });
    } else {
      request.resolve({ allowed: false, reason: "user-denied" });
    }
  }

  grantExtendedAccess(workspacePath) {
    const policy = this.loadPolicy(workspacePath);
    policy.extendedAccess = true;
    this.savePolicy(workspacePath, policy);
    return { success: true };
  }

  revokeExtendedAccess(workspacePath) {
    const policy = this.loadPolicy(workspacePath);
    policy.extendedAccess = false;
    this.savePolicy(workspacePath, policy);
    return { success: true };
  }

  isPathWithinWorkspace(filePath, workspacePath, extendedAccess = false) {
    const normalizedFile = path.resolve(filePath);
    const normalizedWorkspace = path.resolve(workspacePath);
    if (normalizedFile.startsWith(normalizedWorkspace)) return true;
    if (extendedAccess) {
      const allowedPaths = [os.homedir(), os.tmpdir()];
      return allowedPaths.some((a) => normalizedFile.startsWith(a));
    }
    return false;
  }

  async validateFileOperation(operation, filePath, workspacePath) {
    const policy = this.loadPolicy(workspacePath);
    if (
      !this.isPathWithinWorkspace(
        filePath,
        workspacePath,
        policy.extendedAccess,
      )
    ) {
      throw new Error("Access denied: Path is outside workspace");
    }
    const toolName = operation === "read" ? "readFile" : "writeFile";
    const permission = await this.checkPermission(toolName, {
      workspacePath,
      intent: `${operation} ${filePath}`,
      details: { path: filePath, operation },
    });
    if (!permission.allowed) throw new Error("Permission denied");
    return true;
  }

  getPolicySummary(workspacePath) {
    if (!workspacePath) {
      return {
        workspace: null,
        extendedAccess: false,
        allowedTools: [],
        deniedTools: [],
        categories: {},
      };
    }
    const policy = this.loadPolicy(workspacePath);
    return {
      workspace: workspacePath,
      extendedAccess: policy.extendedAccess,
      allowedTools: Object.entries(policy.tools)
        .filter(([, v]) => v === "always")
        .map(([t]) => t),
      deniedTools: Object.entries(policy.tools)
        .filter(([, v]) => v === "deny")
        .map(([t]) => t),
      categories: policy.categories,
    };
  }

  resetPolicy(workspacePath) {
    const hash = this.getWorkspaceHash(workspacePath);
    const policyPath = path.join(PERMISSIONS_DIR, `${hash}.json`);
    if (fs.existsSync(policyPath)) fs.unlinkSync(policyPath);
    this.policies.delete(hash);
    return { success: true };
  }

  redactSecrets(text) {
    if (typeof text !== "string") return text;
    return text
      .replace(/(sk-[A-Za-z0-9]{20,})/g, "[REDACTED]")
      .replace(/(AKIA[A-Z0-9]{16})/g, "[REDACTED]");
  }

  getConsentQueue() {
    const queue = [];
    for (const [requestId, request] of this.pendingRequests.entries()) {
      queue.push({
        requestId,
        toolName: request.data.toolName,
        category: request.data.category,
        intent: request.data.intent,
        risk: request.data.risk,
        timestamp: parseInt(requestId.split("-")[1], 10),
      });
    }
    return queue.sort((a, b) => b.timestamp - a.timestamp);
  }
}

const permissionManager = new PermissionManager();

module.exports = { permissionManager, TOOL_CATEGORIES, TOOL_CATEGORIES_MAP };
