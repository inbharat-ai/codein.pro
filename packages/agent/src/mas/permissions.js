/**
 * CodIn Multi-Agent Swarm — Permission Gate
 *
 * Fail-closed permission system. Every agent action that touches the file system,
 * network, git, MCP tools, or GPU spend must pass through this gate.
 *
 * Permission lifecycle:
 *   1. Agent requests permission before a tool call
 *   2. Gate checks auto-approve rules + working memory for approve_always
 *   3. If not auto-approved → node goes to BLOCKED status
 *   4. User responds: approve_once | approve_always | deny
 *   5. Gate records decision, resumes or cancels node
 *
 * GPU guardrails: $2/session default, configurable to $100 hard cap.
 * TTL 30 min per session, idle timeout 10 min.
 */
"use strict";

const {
  PERMISSION_TYPE,
  PERMISSION_DECISION,
  PERMISSION_RESPONSE,
  NODE_STATUS,
  EVENT_TYPE,
  createSwarmEvent,
  createPermissionRequest,
} = require("./types");

// ─── Constants ───────────────────────────────────────────────
const GPU_BUDGET_DEFAULT = 2.0; // $2
const GPU_BUDGET_HARD_CAP = 100.0; // $100
const GPU_TTL_MS = 30 * 60 * 1000; // 30 min
const GPU_IDLE_MS = 10 * 60 * 1000; // 10 min

// Auto-approve rules: read operations are safe by default
const AUTO_APPROVE_TYPES = new Set([PERMISSION_TYPE.FILE_READ]);

// ═══════════════════════════════════════════════════════════════
// PERMISSION GATE
// ═══════════════════════════════════════════════════════════════

class PermissionGate {
  /**
   * @param {object} opts
   * @param {import("./memory").MemoryManager} opts.memory — MemoryManager instance
   * @param {function} [opts.emitEvent] — Callback to emit SwarmEvents
   * @param {object} [opts.gpuConfig] — GPU guardrails config
   */
  constructor({ memory, emitEvent = null, gpuConfig = {} }) {
    this._memory = memory;
    this._emitEvent = emitEvent;

    // Pending approvals: requestId → { request, resolve, reject }
    this._pending = new Map();

    // Audit log
    this._auditLog = [];
    this._maxAuditEntries = 5000;

    // GPU budget
    this._gpuBudget = Math.min(
      typeof gpuConfig.budget === "number"
        ? gpuConfig.budget
        : GPU_BUDGET_DEFAULT,
      GPU_BUDGET_HARD_CAP,
    );
    this._gpuSpent = 0;
    this._gpuSessionStart = null;
    this._gpuLastActivity = null;
  }

  _emit(type, data) {
    if (this._emitEvent) {
      this._emitEvent(createSwarmEvent({ type, data }));
    }
  }

  _audit(entry) {
    this._auditLog.push({ ...entry, timestamp: new Date().toISOString() });
    if (this._auditLog.length > this._maxAuditEntries) {
      this._auditLog = this._auditLog.slice(-this._maxAuditEntries);
    }
  }

  // ─── Core API ────────────────────────────────────────────

  /**
   * Request permission for an action.
   * Returns immediately if auto-approved or approve_always exists.
   * Otherwise blocks the calling node until user responds.
   *
   * @param {object} opts
   * @param {string} opts.nodeId
   * @param {string} opts.agentId
   * @param {string} opts.permissionType — One of PERMISSION_TYPE
   * @param {string} opts.action — Human-readable description
   * @param {number} [opts.costEstimate] — Estimated cost in USD
   * @returns {Promise<{ decision: string, reason: string }>}
   */
  async requestPermission({
    nodeId,
    agentId,
    permissionType,
    action,
    costEstimate = 0,
  }) {
    // 1. Validate permission type
    if (!Object.values(PERMISSION_TYPE).includes(permissionType)) {
      return {
        decision: PERMISSION_DECISION.DENIED,
        reason: `Unknown permission type: ${permissionType}`,
      };
    }

    // 2. GPU budget check — deny immediately if over budget
    if (permissionType === PERMISSION_TYPE.REMOTE_GPU_SPEND) {
      const budgetCheck = this._checkGpuBudget(costEstimate);
      if (!budgetCheck.allowed) {
        this._audit({
          nodeId,
          agentId,
          permissionType,
          action,
          decision: PERMISSION_DECISION.DENIED,
          reason: budgetCheck.reason,
        });
        this._emit(EVENT_TYPE.PERMISSION_DENIED, {
          nodeId,
          agentId,
          permissionType,
          reason: budgetCheck.reason,
        });
        return {
          decision: PERMISSION_DECISION.DENIED,
          reason: budgetCheck.reason,
        };
      }
    }

    // 3. Auto-approve for safe read operations
    if (AUTO_APPROVE_TYPES.has(permissionType)) {
      this._audit({
        nodeId,
        agentId,
        permissionType,
        action,
        decision: PERMISSION_DECISION.APPROVED,
        reason: "auto_approve_safe_read",
      });
      this._emit(EVENT_TYPE.PERMISSION_GRANTED, {
        nodeId,
        agentId,
        permissionType,
        auto: true,
      });
      return {
        decision: PERMISSION_DECISION.APPROVED,
        reason: "Auto-approved (safe read)",
      };
    }

    // 4. Check working memory for approve_always
    const alwaysGrant = this._memory.working.getPermissionGrant(permissionType);
    if (alwaysGrant === "approve_always") {
      this._audit({
        nodeId,
        agentId,
        permissionType,
        action,
        decision: PERMISSION_DECISION.APPROVED,
        reason: "approve_always_cached",
      });
      this._emit(EVENT_TYPE.PERMISSION_GRANTED, {
        nodeId,
        agentId,
        permissionType,
        auto: true,
        cached: true,
      });
      return {
        decision: PERMISSION_DECISION.APPROVED,
        reason: "Approved (session grant)",
      };
    }

    // 5. Must ask the user — create pending request
    const request = createPermissionRequest({
      nodeId,
      agentId,
      permissionType,
      action,
      costEstimate,
    });
    this._emit(EVENT_TYPE.PERMISSION_REQUESTED, { request });

    return new Promise((resolve) => {
      this._pending.set(request.id, {
        request,
        resolve,
        createdAt: Date.now(),
      });
    });
  }

  /**
   * Respond to a pending permission request.
   * Called by the HTTP route when user clicks approve/deny in the GUI.
   *
   * @param {string} requestId
   * @param {string} response — One of PERMISSION_RESPONSE values
   * @returns {{ success: boolean, error?: string }}
   */
  respondToRequest(requestId, response) {
    const entry = this._pending.get(requestId);
    if (!entry) {
      return {
        success: false,
        error: `No pending request with id: ${requestId}`,
      };
    }

    if (!Object.values(PERMISSION_RESPONSE).includes(response)) {
      return { success: false, error: `Invalid response: ${response}` };
    }

    this._pending.delete(requestId);
    const { request, resolve } = entry;

    let decision;
    let reason;

    switch (response) {
      case PERMISSION_RESPONSE.APPROVE_ONCE:
        decision = PERMISSION_DECISION.APPROVED;
        reason = "User approved (once)";
        break;
      case PERMISSION_RESPONSE.APPROVE_ALWAYS:
        decision = PERMISSION_DECISION.APPROVED;
        reason = "User approved (always for this session)";
        // Persist in working memory
        this._memory.working.setPermissionGrant(
          request.permissionType,
          "approve_always",
        );
        break;
      case PERMISSION_RESPONSE.DENY:
        decision = PERMISSION_DECISION.DENIED;
        reason = "User denied";
        break;
      default:
        decision = PERMISSION_DECISION.DENIED;
        reason = "Unknown response — denied";
    }

    this._audit({
      nodeId: request.nodeId,
      agentId: request.agentId,
      permissionType: request.permissionType,
      action: request.action,
      decision,
      reason,
      requestId,
    });

    // Notify memory
    this._memory.onPermissionDecision(
      request.nodeId,
      request.permissionType,
      response,
    );

    this._emit(
      decision === PERMISSION_DECISION.APPROVED
        ? EVENT_TYPE.PERMISSION_GRANTED
        : EVENT_TYPE.PERMISSION_DENIED,
      {
        requestId,
        nodeId: request.nodeId,
        agentId: request.agentId,
        permissionType: request.permissionType,
        decision,
        reason,
      },
    );

    // If GPU spend, track the cost
    if (
      decision === PERMISSION_DECISION.APPROVED &&
      request.permissionType === PERMISSION_TYPE.REMOTE_GPU_SPEND
    ) {
      this._recordGpuSpend(request.costEstimate);
    }

    resolve({ decision, reason });
    return { success: true };
  }

  // ─── GPU Guardrails ──────────────────────────────────────

  _checkGpuBudget(costEstimate) {
    const now = Date.now();

    // Check session TTL
    if (this._gpuSessionStart && now - this._gpuSessionStart > GPU_TTL_MS) {
      return {
        allowed: false,
        reason: `GPU session expired (TTL ${GPU_TTL_MS / 60000}min)`,
      };
    }

    // Check idle timeout
    if (this._gpuLastActivity && now - this._gpuLastActivity > GPU_IDLE_MS) {
      return {
        allowed: false,
        reason: `GPU session idle timeout (${GPU_IDLE_MS / 60000}min)`,
      };
    }

    // Check budget
    if (this._gpuSpent + costEstimate > this._gpuBudget) {
      return {
        allowed: false,
        reason: `GPU budget exceeded: spent $${this._gpuSpent.toFixed(2)} + requested $${costEstimate.toFixed(2)} > budget $${this._gpuBudget.toFixed(2)}`,
      };
    }

    return { allowed: true };
  }

  _recordGpuSpend(cost) {
    const now = Date.now();
    if (!this._gpuSessionStart) {
      this._gpuSessionStart = now;
    }
    this._gpuLastActivity = now;
    this._gpuSpent += cost;
    this._memory.working.trackCost(cost);
  }

  // ─── Query API ───────────────────────────────────────────

  getPendingRequests() {
    const result = [];
    for (const [, entry] of this._pending) {
      result.push(entry.request);
    }
    return result;
  }

  getPendingCount() {
    return this._pending.size;
  }

  getAuditLog(limit = 100) {
    return this._auditLog.slice(-limit);
  }

  getGpuStatus() {
    return {
      budget: this._gpuBudget,
      spent: this._gpuSpent,
      remaining: this._gpuBudget - this._gpuSpent,
      sessionStart: this._gpuSessionStart,
      lastActivity: this._gpuLastActivity,
      sessionExpired: this._gpuSessionStart
        ? Date.now() - this._gpuSessionStart > GPU_TTL_MS
        : false,
      idleExpired: this._gpuLastActivity
        ? Date.now() - this._gpuLastActivity > GPU_IDLE_MS
        : false,
    };
  }

  /** Cancel all pending permissions (e.g., on swarm shutdown). */
  cancelAllPending() {
    for (const [, entry] of this._pending) {
      entry.resolve({
        decision: PERMISSION_DECISION.DENIED,
        reason: "Swarm shutdown — all pending permissions cancelled",
      });
    }
    this._pending.clear();
  }

  destroy() {
    this.cancelAllPending();
    this._auditLog = [];
  }
}

module.exports = {
  PermissionGate,
  GPU_BUDGET_DEFAULT,
  GPU_BUDGET_HARD_CAP,
  GPU_TTL_MS,
  GPU_IDLE_MS,
  AUTO_APPROVE_TYPES,
};
