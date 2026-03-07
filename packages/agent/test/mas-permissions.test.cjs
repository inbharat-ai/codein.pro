/**
 * MAS — Permission Gate Tests
 *
 * Covers fail-closed model, auto-approval, GPU guardrails.
 */
const assert = require("node:assert/strict");
const test = require("node:test");

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

function makeDeps() {
  const events = [];
  const mm = new MemoryManager({
    workspaceHash: "perm-test",
    emitEvent: (ev) => events.push(ev),
  });
  return { mm, events };
}

test("GPU budget defaults match spec", () => {
  assert.equal(GPU_BUDGET_DEFAULT, 2);
  assert.equal(GPU_BUDGET_HARD_CAP, 100);
});

test("AUTO_APPROVE_TYPES includes FILE_READ only", () => {
  assert.ok(AUTO_APPROVE_TYPES.has(PERMISSION_TYPE.FILE_READ));
  assert.ok(!AUTO_APPROVE_TYPES.has(PERMISSION_TYPE.FILE_WRITE));
  assert.ok(!AUTO_APPROVE_TYPES.has(PERMISSION_TYPE.COMMAND_RUN));
});

test("PermissionGate auto-approves FILE_READ", async () => {
  const { mm } = makeDeps();
  const gate = new PermissionGate({ memory: mm });

  const result = await gate.requestPermission({
    permissionType: PERMISSION_TYPE.FILE_READ,
    agentId: "agent_001",
    nodeId: "node_001",
    action: "read config.json",
  });

  assert.equal(result.decision, PERMISSION_DECISION.APPROVED);
  mm.destroy();
});

test("PermissionGate blocks FILE_WRITE (requires user response)", async () => {
  const { mm } = makeDeps();
  const gate = new PermissionGate({ memory: mm });

  // FILE_WRITE should not auto-approve, creates a pending request
  const promise = gate.requestPermission({
    permissionType: PERMISSION_TYPE.FILE_WRITE,
    agentId: "agent_002",
    nodeId: "node_002",
    action: "write app.js",
  });

  // Check pending state
  const pending = gate.getPendingRequests();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].permissionType, PERMISSION_TYPE.FILE_WRITE);

  // Approve it
  gate.respondToRequest(pending[0].id, PERMISSION_RESPONSE.APPROVE_ONCE);
  const result = await promise;
  assert.equal(result.decision, PERMISSION_DECISION.APPROVED);
  mm.destroy();
});

test("PermissionGate approve_always caches for same type", async () => {
  const { mm } = makeDeps();
  const gate = new PermissionGate({ memory: mm });

  // First request: approve always
  const promise1 = gate.requestPermission({
    permissionType: PERMISSION_TYPE.COMMAND_RUN,
    agentId: "agent_003",
    nodeId: "node_003",
    action: "run npm test",
  });
  const pending = gate.getPendingRequests();
  gate.respondToRequest(pending[0].id, PERMISSION_RESPONSE.APPROVE_ALWAYS);
  await promise1;

  // Second request: same type should auto-approve via working memory
  const result2 = await gate.requestPermission({
    permissionType: PERMISSION_TYPE.COMMAND_RUN,
    agentId: "agent_003",
    nodeId: "node_004",
    action: "run npm build",
  });
  assert.equal(result2.decision, PERMISSION_DECISION.APPROVED);

  // No new pending requests
  assert.equal(gate.getPendingRequests().length, 0);
  mm.destroy();
});

test("PermissionGate deny blocks action", async () => {
  const { mm } = makeDeps();
  const gate = new PermissionGate({ memory: mm });

  const promise = gate.requestPermission({
    permissionType: PERMISSION_TYPE.GIT_OP,
    agentId: "agent_004",
    nodeId: "node_005",
    action: "git push --force",
  });
  const pending = gate.getPendingRequests();
  gate.respondToRequest(pending[0].id, PERMISSION_RESPONSE.DENY);
  const result = await promise;
  assert.equal(result.decision, PERMISSION_DECISION.DENIED);
  mm.destroy();
});

test("PermissionGate cancelAllPending denies all", async () => {
  const { mm } = makeDeps();
  const gate = new PermissionGate({ memory: mm });

  const p1 = gate.requestPermission({
    permissionType: PERMISSION_TYPE.FILE_WRITE,
    agentId: "agent_005",
    nodeId: "node_006",
    action: "write a.js",
  });
  const p2 = gate.requestPermission({
    permissionType: PERMISSION_TYPE.COMMAND_RUN,
    agentId: "agent_006",
    nodeId: "node_007",
    action: "rm -rf /",
  });

  assert.equal(gate.getPendingRequests().length, 2);
  gate.cancelAllPending();

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.decision, PERMISSION_DECISION.DENIED);
  assert.equal(r2.decision, PERMISSION_DECISION.DENIED);
  mm.destroy();
});

test("PermissionGate GPU status tracking", () => {
  const { mm } = makeDeps();
  const gate = new PermissionGate({ memory: mm, gpuConfig: { budget: 5 } });
  const status = gate.getGpuStatus();
  assert.equal(status.budget, 5);
  assert.equal(status.spent, 0);
  assert.equal(status.remaining, 5);
  mm.destroy();
});
