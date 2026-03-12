"use strict";

/**
 * Regression tests for bugs fixed in the March 2026 review.
 *
 * 1. retryCount vs retries field name mismatch
 * 2. approve_always leak across swarm shutdown
 * 3. costEstimate vs costEstimateUSD key mismatch
 * 4. Agent pool cap raised to 50
 * 5. API versioning (/v1 prefix support)
 * 6. WorkingMemory.clearPermissionGrants()
 * 7. Permission persistence to disk
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  createTaskNode,
  createSwarmConfig,
  createPermissionRequest,
  PERMISSION_TYPE,
  validateSwarmConfig,
} = require("../src/mas/types");

const { WorkingMemory, MemoryManager } = require("../src/mas/memory");
const { MicroRouter } = require("../src/routes/micro-router");

// ─── Bug 1: retryCount field name consistency ─────────────────

test("createTaskNode uses retryCount (not retries)", () => {
  const node = createTaskNode({ goal: "Fix the bug" });
  assert.equal(node.retryCount, 0, "retryCount should be 0");
  assert.equal(node.maxRetries, 2, "maxRetries should be 2");
  assert.equal(node.retries, undefined, "retries should not exist");
});

// ─── Bug 2: approve_always leak across swarm shutdown ─────────

test("WorkingMemory.clearPermissionGrants removes cached grants", () => {
  const wm = new WorkingMemory();
  wm.setPermissionGrant("file_write", "approve_always");
  wm.setPermissionGrant("network", "approve_always");

  assert.equal(wm.getPermissionGrant("file_write"), "approve_always");
  assert.equal(wm.getPermissionGrant("network"), "approve_always");

  wm.clearPermissionGrants();

  assert.equal(wm.getPermissionGrant("file_write"), null);
  assert.equal(wm.getPermissionGrant("network"), null);
});

test("MemoryManager.destroy clears permission grants", () => {
  const mm = new MemoryManager({
    workspaceHash: "test_hash",
    longTermEnabled: false,
  });

  mm.working.setPermissionGrant("file_write", "approve_always");
  assert.equal(mm.working.getPermissionGrant("file_write"), "approve_always");

  mm.destroy();
  // After destroy, working memory is cleared
  assert.equal(mm.working.getPermissionGrant("file_write"), null);
});

// ─── Bug 3: costEstimate → costEstimateUSD ─────────────────────

test("createPermissionRequest uses costEstimateUSD field", () => {
  const req = createPermissionRequest({
    nodeId: "node_abc",
    agentId: "agent_abc",
    permissionType: PERMISSION_TYPE.REMOTE_GPU_SPEND,
    action: "Create GPU pod",
    costEstimateUSD: 2.5,
  });

  assert.equal(req.costEstimateUSD, 2.5);
  assert.equal(req.permissionType, "remote_gpu_spend");
});

// ─── Bug 4: Agent pool cap raised to 50 ─────────────────────────

test("createSwarmConfig allows up to 50 agents", () => {
  const config = createSwarmConfig({ maxAgents: 50 });
  assert.equal(config.maxAgents, 50);
});

test("createSwarmConfig clamps above 50", () => {
  const config = createSwarmConfig({ maxAgents: 100 });
  assert.equal(config.maxAgents, 50);
});

test("validateSwarmConfig accepts 50 agents", () => {
  const config = createSwarmConfig({ maxAgents: 50 });
  const result = validateSwarmConfig(config);
  assert.equal(result.valid, true);
});

// ─── Bug 5: API versioning (/v1 prefix) ─────────────────────────

test("MicroRouter matches /v1 versioned routes", () => {
  const router = new MicroRouter();
  let called = false;
  router.get("/swarm/status", (req, res) => {
    called = true;
  });

  const match = router.match("GET", "/v1/swarm/status");
  assert.ok(match, "Should match /v1/swarm/status");
  assert.equal(match.apiVersion, "v1");

  // Execute to verify handler works
  match.handler({}, {});
  assert.ok(called, "Handler should be called");
});

test("MicroRouter matches unversioned routes (backward compat)", () => {
  const router = new MicroRouter();
  router.get("/health", () => {});

  const match = router.match("GET", "/health");
  assert.ok(match, "Should match /health without version");
  assert.equal(match.apiVersion, null);
});

test("MicroRouter matches /v1 parameterized routes", () => {
  const router = new MicroRouter();
  router.get("/swarm/tasks/:taskId", () => {});

  const match = router.match("GET", "/v1/swarm/tasks/task_abc123");
  assert.ok(match, "Should match versioned parameterized route");
  assert.equal(match.params.taskId, "task_abc123");
  assert.equal(match.apiVersion, "v1");
});

test("MicroRouter does not match /v1 when route doesn't exist", () => {
  const router = new MicroRouter();
  router.get("/health", () => {});

  const match = router.match("GET", "/v1/nonexistent");
  assert.equal(match, null, "Should not match nonexistent route");
});

// ─── Bug 6: Permission persistence ─────────────────────────────

test("PermissionGate persists approve_always to disk", () => {
  const tmpDir = path.join(os.tmpdir(), `codin-test-${Date.now()}`);
  const persistPath = path.join(tmpDir, "permissions.json");

  const { PermissionGate } = require("../src/mas/permissions");

  const mm = new MemoryManager({
    workspaceHash: "test_persist",
    longTermEnabled: false,
  });

  const gate = new PermissionGate({
    memory: mm,
    persistPath,
  });

  // Simulate an approve_always response
  gate._persistPermission("file_write");

  // Verify file was written
  assert.ok(fs.existsSync(persistPath), "Permissions file should exist");
  const data = JSON.parse(fs.readFileSync(persistPath, "utf8"));
  assert.equal(data.file_write.grant, "approve_always");
  assert.ok(data.file_write.expiresAt > Date.now(), "Should have future expiry");

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  mm.destroy();
});

test("PermissionGate loads persisted permissions on init", () => {
  const tmpDir = path.join(os.tmpdir(), `codin-test-load-${Date.now()}`);
  const persistPath = path.join(tmpDir, "permissions.json");

  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    persistPath,
    JSON.stringify({
      file_write: {
        grant: "approve_always",
        expiresAt: Date.now() + 3600000, // 1 hour from now
      },
      network: {
        grant: "approve_always",
        expiresAt: Date.now() - 1000, // Expired
      },
    }),
    "utf8",
  );

  const { PermissionGate } = require("../src/mas/permissions");
  const mm = new MemoryManager({
    workspaceHash: "test_load",
    longTermEnabled: false,
  });

  const gate = new PermissionGate({
    memory: mm,
    persistPath,
  });

  // file_write should be loaded (not expired)
  assert.equal(
    mm.working.getPermissionGrant("file_write"),
    "approve_always",
    "Non-expired permission should be restored",
  );

  // network should NOT be loaded (expired)
  assert.equal(
    mm.working.getPermissionGrant("network"),
    null,
    "Expired permission should not be restored",
  );

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  mm.destroy();
});
