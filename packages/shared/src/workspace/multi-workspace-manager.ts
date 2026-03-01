import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";

/**
 * MultiWorkspaceManager - Manages isolated workspaces with RBAC and quotas
 * Provides workspace creation, deletion, permission management, and storage quotas
 */
export interface Workspace {
  id: string;
  name: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  quota: number;
  usedStorage: number;
  members: Map<string, WorkspaceMember>;
  settings: Record<string, any>;
}

export interface WorkspaceMember {
  userId: string;
  username: string;
  role: "owner" | "admin" | "editor" | "viewer";
  joinedAt: number;
  permissions: string[];
}

export interface WorkspaceStats {
  id: string;
  name: string;
  owner: string;
  members: number;
  usedStorage: number;
  quota: number;
  utilization: string;
  createdAt: Date;
}

export class MultiWorkspaceManager extends EventEmitter {
  private workspaces: Map<string, Workspace>;
  private baseStoragePath: string;
  private defaultQuota: number;
  private auditLog: Array<any>;

  constructor(
    options: {
      baseStoragePath?: string;
      defaultQuota?: number;
    } = {},
  ) {
    super();

    this.baseStoragePath =
      options.baseStoragePath || path.join(process.cwd(), "workspaces");
    this.defaultQuota = options.defaultQuota || 1024 * 1024 * 1024; // 1GB
    this.workspaces = new Map();
    this.auditLog = [];

    this.initializeStoragePath();
  }

  /**
   * Initialize base storage path
   */
  private initializeStoragePath(): void {
    try {
      if (!fs.existsSync(this.baseStoragePath)) {
        fs.mkdirSync(this.baseStoragePath, { recursive: true, mode: 0o700 });
      }
    } catch (error) {
      console.error(
        "[MultiWorkspaceManager] Failed to initialize storage:",
        error,
      );
    }
  }

  /**
   * Create new workspace
   */
  async createWorkspace(
    workspaceId: string,
    name: string,
    owner: string,
    options: { quota?: number; settings?: Record<string, any> } = {},
  ): Promise<Workspace> {
    if (this.workspaces.has(workspaceId)) {
      throw new Error(`Workspace already exists: ${workspaceId}`);
    }

    const workspace: Workspace = {
      id: workspaceId,
      name,
      owner,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      quota: options.quota || this.defaultQuota,
      usedStorage: 0,
      members: new Map([
        [
          owner,
          {
            userId: owner,
            username: owner,
            role: "owner",
            joinedAt: Date.now(),
            permissions: ["*"],
          },
        ],
      ]),
      settings: options.settings || {},
    };

    // Create workspace directory
    const wsPath = path.join(this.baseStoragePath, workspaceId);
    try {
      fs.mkdirSync(wsPath, { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        path.join(wsPath, "workspace.json"),
        JSON.stringify(workspace, null, 2),
        { mode: 0o600 },
      );
    } catch (error) {
      throw new Error(`Failed to create workspace directory: ${error}`);
    }

    this.workspaces.set(workspaceId, workspace);
    this.auditLog.push({
      action: "CREATE_WORKSPACE",
      workspaceId,
      userId: owner,
      timestamp: Date.now(),
    });

    this.emit("workspace-created", { workspaceId, name, owner });
    return workspace;
  }

  /**
   * Delete workspace
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    if (workspace.owner !== userId) {
      throw new Error("Only workspace owner can delete");
    }

    // Delete workspace directory
    const wsPath = path.join(this.baseStoragePath, workspaceId);
    try {
      if (fs.existsSync(wsPath)) {
        fs.rmSync(wsPath, { recursive: true, force: true });
      }
    } catch (error) {
      throw new Error(`Failed to delete workspace directory: ${error}`);
    }

    this.workspaces.delete(workspaceId);
    this.auditLog.push({
      action: "DELETE_WORKSPACE",
      workspaceId,
      userId,
      timestamp: Date.now(),
    });

    this.emit("workspace-deleted", { workspaceId });
  }

  /**
   * Get workspace
   */
  getWorkspace(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  /**
   * List user workspaces
   */
  listUserWorkspaces(userId: string): Workspace[] {
    return Array.from(this.workspaces.values()).filter(
      (ws) => ws.owner === userId || ws.members.has(userId),
    );
  }

  /**
   * Grant workspace permission
   */
  grantPermissions(
    workspaceId: string,
    userId: string,
    targetUser: string,
    role: "owner" | "admin" | "editor" | "viewer",
  ): void {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const user = workspace.members.get(userId);
    if (!user || !["owner", "admin"].includes(user.role)) {
      throw new Error("Insufficient permissions");
    }

    const rolePermissions: Record<string, string[]> = {
      owner: ["*"],
      admin: ["read", "write", "delete", "manage-users"],
      editor: ["read", "write"],
      viewer: ["read"],
    };

    workspace.members.set(targetUser, {
      userId: targetUser,
      username: targetUser,
      role,
      joinedAt: Date.now(),
      permissions: rolePermissions[role] || [],
    });

    this.auditLog.push({
      action: "GRANT_PERMISSIONS",
      workspaceId,
      grantedBy: userId,
      grantedTo: targetUser,
      role,
      timestamp: Date.now(),
    });

    this.emit("permissions-granted", { workspaceId, user: targetUser, role });
  }

  /**
   * Revoke workspace permission
   */
  revokePermissions(
    workspaceId: string,
    userId: string,
    targetUser: string,
  ): void {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    if (workspace.owner === targetUser) {
      throw new Error("Cannot revoke owner permissions");
    }

    const user = workspace.members.get(userId);
    if (!user || !["owner", "admin"].includes(user.role)) {
      throw new Error("Insufficient permissions");
    }

    workspace.members.delete(targetUser);

    this.auditLog.push({
      action: "REVOKE_PERMISSIONS",
      workspaceId,
      revokedBy: userId,
      revokedFrom: targetUser,
      timestamp: Date.now(),
    });

    this.emit("permissions-revoked", { workspaceId, user: targetUser });
  }

  /**
   * Get workspace members
   */
  getMembers(workspaceId: string): WorkspaceMember[] {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    return Array.from(workspace.members.values());
  }

  /**
   * Update storage usage
   */
  updateStorageUsage(workspaceId: string, bytes: number): void {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    workspace.usedStorage += bytes;

    if (workspace.usedStorage > workspace.quota) {
      throw new Error("Storage quota exceeded");
    }

    workspace.updatedAt = Date.now();
  }

  /**
   * Get workspace statistics
   */
  getWorkspaceStats(workspaceId: string): WorkspaceStats {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const utilization = (
      (workspace.usedStorage / workspace.quota) *
      100
    ).toFixed(2);

    return {
      id: workspace.id,
      name: workspace.name,
      owner: workspace.owner,
      members: workspace.members.size,
      usedStorage: workspace.usedStorage,
      quota: workspace.quota,
      utilization: `${utilization}%`,
      createdAt: new Date(workspace.createdAt),
    };
  }

  /**
   * Switch active workspace
   */
  switchWorkspace(workspaceId: string, userId: string): Workspace {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    if (!workspace.members.has(userId)) {
      throw new Error("User is not a member of this workspace");
    }

    this.emit("workspace-switched", { workspaceId, userId });
    return workspace;
  }

  /**
   * Get all workspaces (admin only)
   */
  getAllWorkspaces(): Map<string, Workspace> {
    return new Map(this.workspaces);
  }

  /**
   * Get audit log
   */
  getAuditLog(): Array<any> {
    return [...this.auditLog];
  }
}

export default MultiWorkspaceManager;
