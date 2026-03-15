/**
 * Integration Test — Permission Lifecycle
 *
 * Tests auto-approve for file_read, deny flows, approve_once vs
 * approve_always, GPU budget tracking, audit log, and concurrent requests.
 */
"use strict";

const {
  PermissionGate,
  GPU_BUDGET_DEFAULT,
  GPU_BUDGET_HARD_CAP,
  AUTO_APPROVE_TYPES,
} = require("../src/mas/permissions");
const { MemoryManager } = require("../src/mas/memory");
const {
  PERMISSION_TYPE,
  PERMISSION_DECISION,
  PERMISSION_RESPONSE,
} = require("../src/mas/types");

// ─── Helpers ─────────────────────────────────────────────────

function createGate(opts = {}) {
  const memory = new MemoryManager({
    workspaceHash: "perm_test_" + Date.now(),
    longTermEnabled: false,
  });
  const events = [];
  const gate = new PermissionGate({
    memory,
    emitEvent: (e) => events.push(e),
    gpuConfig: opts.gpuConfig || {},
  });
  return { gate, memory, events };
}

// ─── Auto-Approve Tests ──────────────────────────────────────

describe("Permission — Auto-approve for safe reads", () => {
  it("auto-approves FILE_READ without user input", async () => {
    const { gate, memory, events } = createGate();

    const result = await gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_READ,
      action: "Read config.json",
    });

    expect(result.decision).toBe(PERMISSION_DECISION.APPROVED);
    expect(result.reason).toContain("Auto-approved");

    // Should not be in pending
    expect(gate.getPendingCount()).toBe(0);

    // Should emit PERMISSION_GRANTED event
    const grantedEvents = events.filter(
      (e) => e.type === "permission_granted"
    );
    expect(grantedEvents.length).toBe(1);
    expect(grantedEvents[0].data.auto).toBe(true);

    // Audit log should record it
    const log = gate.getAuditLog();
    expect(log.length).toBe(1);
    expect(log[0].decision).toBe("approved");

    gate.destroy();
    memory.destroy();
  });
});

// ─── Deny Flow ───────────────────────────────────────────────

describe("Permission — Deny flow", () => {
  it("command_run blocks and is denied gracefully", async () => {
    const { gate, memory, events } = createGate();

    const permPromise = gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.COMMAND_RUN,
      action: "Run: rm -rf /",
    });

    // Should be pending
    expect(gate.getPendingCount()).toBe(1);

    // User denies
    const pending = gate.getPendingRequests();
    const resp = gate.respondToRequest(pending[0].id, PERMISSION_RESPONSE.DENY);
    expect(resp.success).toBe(true);

    const result = await permPromise;
    expect(result.decision).toBe(PERMISSION_DECISION.DENIED);
    expect(result.reason).toContain("User denied");

    // No longer pending
    expect(gate.getPendingCount()).toBe(0);

    // Denial event emitted
    const deniedEvents = events.filter((e) => e.type === "permission_denied");
    expect(deniedEvents.length).toBe(1);

    gate.destroy();
    memory.destroy();
  });

  it("denies unknown permission types immediately", async () => {
    const { gate, memory } = createGate();

    const result = await gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: "nonexistent_permission_type",
      action: "Do something unknown",
    });

    expect(result.decision).toBe(PERMISSION_DECISION.DENIED);
    expect(result.reason).toContain("Unknown permission type");

    gate.destroy();
    memory.destroy();
  });
});

// ─── Approve Once ────────────────────────────────────────────

describe("Permission — approve_once", () => {
  it("approve_once works for one request, next request blocks again", async () => {
    const { gate, memory } = createGate();

    // First request: approve_once
    const p1 = gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_WRITE,
      action: "Write to file.txt",
    });
    let pending = gate.getPendingRequests();
    gate.respondToRequest(pending[0].id, PERMISSION_RESPONSE.APPROVE_ONCE);
    const r1 = await p1;
    expect(r1.decision).toBe(PERMISSION_DECISION.APPROVED);
    expect(r1.reason).toContain("once");

    // Second request: should block again (approve_once does not persist)
    const p2 = gate.requestPermission({
      nodeId: "n2",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_WRITE,
      action: "Write to another.txt",
    });
    pending = gate.getPendingRequests();
    expect(pending).toHaveLength(1);

    // Approve again
    gate.respondToRequest(pending[0].id, PERMISSION_RESPONSE.APPROVE_ONCE);
    const r2 = await p2;
    expect(r2.decision).toBe(PERMISSION_DECISION.APPROVED);

    gate.destroy();
    memory.destroy();
  });
});

// ─── Approve Always ──────────────────────────────────────────

describe("Permission — approve_always", () => {
  it("approve_always persists for session — subsequent requests auto-approved", async () => {
    const { gate, memory } = createGate();

    // First request: approve_always
    const p1 = gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.GIT_OP,
      action: "git commit",
    });
    const pending = gate.getPendingRequests();
    gate.respondToRequest(pending[0].id, PERMISSION_RESPONSE.APPROVE_ALWAYS);
    const r1 = await p1;
    expect(r1.decision).toBe(PERMISSION_DECISION.APPROVED);
    expect(r1.reason).toContain("always");

    // Second request: should be auto-approved from working memory cache
    const r2 = await gate.requestPermission({
      nodeId: "n2",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.GIT_OP,
      action: "git push",
    });
    expect(r2.decision).toBe(PERMISSION_DECISION.APPROVED);
    expect(r2.reason).toContain("session grant");

    // No pending requests (was auto-approved)
    expect(gate.getPendingCount()).toBe(0);

    gate.destroy();
    memory.destroy();
  });

  it("approve_always for one type does not affect other types", async () => {
    const { gate, memory } = createGate();

    // Approve git operations always
    const p1 = gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.GIT_OP,
      action: "git commit",
    });
    gate.respondToRequest(
      gate.getPendingRequests()[0].id,
      PERMISSION_RESPONSE.APPROVE_ALWAYS
    );
    await p1;

    // command_run should still block
    const p2 = gate.requestPermission({
      nodeId: "n2",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.COMMAND_RUN,
      action: "run tests",
    });
    expect(gate.getPendingCount()).toBe(1);
    gate.respondToRequest(
      gate.getPendingRequests()[0].id,
      PERMISSION_RESPONSE.DENY
    );
    const r2 = await p2;
    expect(r2.decision).toBe(PERMISSION_DECISION.DENIED);

    gate.destroy();
    memory.destroy();
  });
});

// ─── GPU Budget ──────────────────────────────────────────────

describe("Permission — GPU Budget Tracking", () => {
  it("denies GPU spend when over budget", async () => {
    const { gate, memory } = createGate({
      gpuConfig: { budget: 1.0 },
    });

    const result = await gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.REMOTE_GPU_SPEND,
      action: "Run training job",
      costEstimate: 5.0, // Way over $1 budget
    });

    expect(result.decision).toBe(PERMISSION_DECISION.DENIED);
    expect(result.reason).toContain("budget exceeded");

    gate.destroy();
    memory.destroy();
  });

  it("GPU budget hard cap is enforced", () => {
    const { gate, memory } = createGate({
      gpuConfig: { budget: 999 }, // Over hard cap
    });

    const status = gate.getGpuStatus();
    // Budget should be capped at GPU_BUDGET_HARD_CAP
    expect(status.budget).toBeLessThanOrEqual(GPU_BUDGET_HARD_CAP);

    gate.destroy();
    memory.destroy();
  });

  it("getGpuStatus returns current state", () => {
    const { gate, memory } = createGate({
      gpuConfig: { budget: 5.0 },
    });

    const status = gate.getGpuStatus();
    expect(status.budget).toBe(5.0);
    expect(status.spent).toBe(0);
    expect(status.remaining).toBe(5.0);
    expect(status.sessionExpired).toBe(false);

    gate.destroy();
    memory.destroy();
  });
});

// ─── Audit Log ───────────────────────────────────────────────

describe("Permission — Audit Log", () => {
  it("records all permission decisions", async () => {
    const { gate, memory } = createGate();

    // Auto-approved
    await gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_READ,
      action: "read",
    });

    // User-approved
    const p2 = gate.requestPermission({
      nodeId: "n2",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_WRITE,
      action: "write",
    });
    gate.respondToRequest(
      gate.getPendingRequests()[0].id,
      PERMISSION_RESPONSE.APPROVE_ONCE
    );
    await p2;

    const log = gate.getAuditLog();
    expect(log.length).toBe(2);
    expect(log[0].decision).toBe("approved");
    expect(log[1].decision).toBe("approved");
    expect(log[0].timestamp).toBeDefined();

    gate.destroy();
    memory.destroy();
  });

  it("audit log respects limit parameter", async () => {
    const { gate, memory } = createGate();

    for (let i = 0; i < 5; i++) {
      await gate.requestPermission({
        nodeId: `n${i}`,
        agentId: "a1",
        permissionType: PERMISSION_TYPE.FILE_READ,
        action: `read file ${i}`,
      });
    }

    const limited = gate.getAuditLog(2);
    expect(limited.length).toBe(2);

    gate.destroy();
    memory.destroy();
  });
});

// ─── Concurrent Requests ─────────────────────────────────────

describe("Permission — Concurrent Requests", () => {
  it("handles multiple simultaneous pending requests", async () => {
    const { gate, memory } = createGate();

    // Fire multiple requests concurrently
    const p1 = gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_WRITE,
      action: "write file 1",
    });
    const p2 = gate.requestPermission({
      nodeId: "n2",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.COMMAND_RUN,
      action: "run tests",
    });
    const p3 = gate.requestPermission({
      nodeId: "n3",
      agentId: "a2",
      permissionType: PERMISSION_TYPE.NETWORK,
      action: "fetch API",
    });

    expect(gate.getPendingCount()).toBe(3);

    // Respond to each
    const pending = gate.getPendingRequests();
    gate.respondToRequest(pending[0].id, PERMISSION_RESPONSE.APPROVE_ONCE);
    gate.respondToRequest(pending[1].id, PERMISSION_RESPONSE.DENY);
    gate.respondToRequest(pending[2].id, PERMISSION_RESPONSE.APPROVE_ALWAYS);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.decision).toBe(PERMISSION_DECISION.APPROVED);
    expect(r2.decision).toBe(PERMISSION_DECISION.DENIED);
    expect(r3.decision).toBe(PERMISSION_DECISION.APPROVED);

    expect(gate.getPendingCount()).toBe(0);

    gate.destroy();
    memory.destroy();
  });

  it("respondToRequest returns error for invalid response value", () => {
    const { gate, memory } = createGate();

    // Create a pending request
    gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_WRITE,
      action: "write",
    });

    const pending = gate.getPendingRequests();
    const result = gate.respondToRequest(pending[0].id, "invalid_response");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid response");

    gate.cancelAllPending();
    gate.destroy();
    memory.destroy();
  });

  it("respondToRequest returns error for non-existent request ID", () => {
    const { gate, memory } = createGate();
    const result = gate.respondToRequest("ghost_id", "approve_once");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No pending request");

    gate.destroy();
    memory.destroy();
  });
});

// ─── Cancel All Pending ──────────────────────────────────────

describe("Permission — cancelAllPending", () => {
  it("cancels all pending requests on shutdown", async () => {
    const { gate, memory } = createGate();

    const p1 = gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_WRITE,
      action: "write",
    });
    const p2 = gate.requestPermission({
      nodeId: "n2",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.COMMAND_RUN,
      action: "run",
    });

    expect(gate.getPendingCount()).toBe(2);
    gate.cancelAllPending();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.decision).toBe(PERMISSION_DECISION.DENIED);
    expect(r1.reason).toContain("shutdown");
    expect(r2.decision).toBe(PERMISSION_DECISION.DENIED);
    expect(gate.getPendingCount()).toBe(0);

    gate.destroy();
    memory.destroy();
  });
});
