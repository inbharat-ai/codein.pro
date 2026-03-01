/**
 * Permission Manager
 * Handles agent tool permissions with consent UI
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";

const CODIN_DIR = path.join(os.homedir(), ".codin");
const PERMISSIONS_DIR = path.join(CODIN_DIR, "permissions");

// Tool categories with risk levels
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

// Tool to category mapping
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
  getSecret: "SECRETS",
  systemOpen: "SYSTEM",
};

class PermissionManager extends EventEmitter {
  policies: Map<string, any>;
  pendingRequests: Map<string, any>;

  constructor() {
    super();
    this.policies = new Map(); // workspaceHash -> PermissionPolicy
    this.pendingRequests = new Map(); // requestId -> { resolve, reject, data }
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(PERMISSIONS_DIR)) {
      fs.mkdirSync(PERMISSIONS_DIR, { recursive: true });
    }
  }

  /**
   * Get workspace hash
   */
  getWorkspaceHash(workspacePath: string): string {
    return crypto
      .createHash("sha256")
      .update(workspacePath)
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * Load permission policy
   */
  loadPolicy(workspacePath: string): any {
    const hash = this.getWorkspaceHash(workspacePath);

    if (this.policies.has(hash)) {
      return this.policies.get(hash);
    }

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

  /**
   * Save permission policy
   */
  savePolicy(workspacePath: string, policy: any): void {
    const hash = this.getWorkspaceHash(workspacePath);
    const policyPath = path.join(PERMISSIONS_DIR, `${hash}.json`);

    policy.updatedAt = new Date().toISOString();

    fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2));
    this.policies.set(hash, policy);
  }

  /**
   * Check permission for tool
   */
  async checkPermission(toolName: string, context: any): Promise<any> {
    const { workspacePath, intent, details = {} } = context;

    const policy = this.loadPolicy(workspacePath);
    const category: string = (TOOL_CATEGORIES_MAP as any)[toolName] || "READ";

    // Check if already allowed
    if (policy.tools[toolName] === "always") {
      return { allowed: true, reason: "always-allowed" };
    }

    if (policy.categories[category] === "always") {
      return { allowed: true, reason: "category-always-allowed" };
    }

    // Check if denied
    if (policy.tools[toolName] === "deny") {
      return { allowed: false, reason: "denied" };
    }

    if (policy.categories[category] === "deny") {
      return { allowed: false, reason: "category-denied" };
    }

    // Request user consent
    const decision = await this.requestConsent({
      toolName,
      category,
      intent,
      details,
      workspacePath,
      risk: (TOOL_CATEGORIES as any)[category]?.risk || "medium",
    });

    return decision;
  }

  /**
   * Request user consent (blocking)
   */
  async requestConsent(request: any): Promise<any> {
    const requestId = `consent-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject, data: request });

      // Emit event for UI to show dialog
      this.emit("consent-required", {
        requestId,
        ...request,
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error("Consent timeout"));
        }
      }, 300000);
    });
  }

  /**
   * Respond to consent request
   */
  respondToConsent(requestId: string, response: any): void {
    const request = this.pendingRequests.get(requestId);

    if (!request) {
      throw new Error("Consent request not found");
    }

    const { decision, remember } = response; // decision: 'allow' | 'deny'

    this.pendingRequests.delete(requestId);

    // Update policy if remember is true
    if (remember) {
      const policy = this.loadPolicy(request.data.workspacePath);

      if (decision === "allow") {
        policy.tools[request.data.toolName] = "always";
      } else {
        policy.tools[request.data.toolName] = "deny";
      }

      this.savePolicy(request.data.workspacePath, policy);
    }

    // Resolve promise
    if (decision === "allow") {
      request.resolve({ allowed: true, reason: "user-approved" });
    } else {
      request.resolve({ allowed: false, reason: "user-denied" });
    }
  }

  /**
   * Grant extended access
   */
  grantExtendedAccess(workspacePath: string): { success: boolean } {
    const policy = this.loadPolicy(workspacePath);
    policy.extendedAccess = true;
    this.savePolicy(workspacePath, policy);

    return { success: true };
  }

  /**
   * Revoke extended access
   */
  revokeExtendedAccess(workspacePath: string): { success: boolean } {
    const policy = this.loadPolicy(workspacePath);
    policy.extendedAccess = false;
    this.savePolicy(workspacePath, policy);

    return { success: true };
  }

  /**
   * Check if path is within workspace (sandbox)
   */
  isPathWithinWorkspace(
    filePath: string,
    workspacePath: string,
    extendedAccess: boolean = false,
  ): boolean {
    const normalizedFile = path.resolve(filePath);
    const normalizedWorkspace = path.resolve(workspacePath);

    if (normalizedFile.startsWith(normalizedWorkspace)) {
      return true;
    }

    if (extendedAccess) {
      // Allow some common paths with extended access
      const allowedPaths = [os.homedir(), os.tmpdir()];

      return allowedPaths.some((allowed) => normalizedFile.startsWith(allowed));
    }

    return false;
  }

  /**
   * Validate file operation
   */
  async validateFileOperation(
    operation: string,
    filePath: string,
    workspacePath: string,
  ): Promise<boolean> {
    const policy = this.loadPolicy(workspacePath);

    // Check if path is within workspace
    if (
      !this.isPathWithinWorkspace(
        filePath,
        workspacePath,
        policy.extendedAccess,
      )
    ) {
      throw new Error("Access denied: Path is outside workspace");
    }

    // Check permission
    const toolName = operation === "read" ? "readFile" : "writeFile";
    const permission: any = await this.checkPermission(toolName, {
      workspacePath,
      intent: `${operation} ${filePath}`,
      details: { path: filePath, operation },
    });

    if (!permission.allowed) {
      throw new Error("Permission denied");
    }

    return true;
  }

  /**
   * Get policy summary
   */
  getPolicySummary(workspacePath: string): any {
    const policy = this.loadPolicy(workspacePath);

    const summary = {
      workspace: workspacePath,
      extendedAccess: policy.extendedAccess,
      allowedTools: Object.entries(policy.tools)
        .filter(([, value]) => value === "always")
        .map(([tool]) => tool),
      deniedTools: Object.entries(policy.tools)
        .filter(([, value]) => value === "deny")
        .map(([tool]) => tool),
      categories: policy.categories,
    };

    return summary;
  }

  /**
   * Reset policy
   */
  resetPolicy(workspacePath: string): { success: boolean } {
    const hash = this.getWorkspaceHash(workspacePath);
    const policyPath = path.join(PERMISSIONS_DIR, `${hash}.json`);

    if (fs.existsSync(policyPath)) {
      fs.unlinkSync(policyPath);
    }

    this.policies.delete(hash);

    return { success: true };
  }

  /**
   * Redact secrets from string
   */
  redactSecrets(text: string): string {
    if (typeof text !== "string") {
      return text;
    }

    const patterns = [
      // API keys
      /([A-Za-z0-9_-]{20,})/g,
      // Tokens
      /(sk-[A-Za-z0-9]{20,})/g,
      // AWS keys
      /(AKIA[A-Z0-9]{16})/g,
    ];

    let redacted = text;

    for (const pattern of patterns) {
      redacted = redacted.replace(pattern, "[REDACTED]");
    }

    return redacted;
  }

  /**
   * Get consent queue
   */
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

export const permissionManager = new PermissionManager();
export { TOOL_CATEGORIES, TOOL_CATEGORIES_MAP };
