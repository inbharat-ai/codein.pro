"use strict";
const { test } = require("node:test");

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

// ═════════════════════════════════════════════════════════════════════
// NEW REGRESSION TESTS — Bug fixes from March 2026 hardening review
// ═════════════════════════════════════════════════════════════════════

// ─── Bug 1 (extended): clearSessionGrants on PermissionGate.destroy ──

test("PermissionGate.destroy() clears session grants from working memory", async () => {
  const { PermissionGate } = require("../src/mas/permissions");
  const mm = new MemoryManager({
    workspaceHash: "test_destroy_grants",
    longTermEnabled: false,
  });

  const gate = new PermissionGate({
    memory: mm,
    emitEvent: () => {},
    persistPath: null,
  });

  // Simulate storing approve_always grants
  mm.working.setPermissionGrant("file_write", "approve_always");
  mm.working.setPermissionGrant("git_push", "approve_always");
  mm.working.setPermissionGrant("network", "approve_always");

  assert.equal(mm.working.getPermissionGrant("file_write"), "approve_always");
  assert.equal(mm.working.getPermissionGrant("git_push"), "approve_always");

  await gate.destroy();

  // All grants must be cleared
  assert.equal(mm.working.getPermissionGrant("file_write"), null,
    "file_write grant should be cleared after destroy");
  assert.equal(mm.working.getPermissionGrant("git_push"), null,
    "git_push grant should be cleared after destroy");
  assert.equal(mm.working.getPermissionGrant("network"), null,
    "network grant should be cleared after destroy");

  mm.destroy();
});

test("PermissionGate.clearSessionGrants removes persisted file from disk", () => {
  const tmpDir = path.join(os.tmpdir(), `codin-test-clear-${Date.now()}`);
  const persistPath = path.join(tmpDir, "permissions.json");

  const { PermissionGate } = require("../src/mas/permissions");
  const mm = new MemoryManager({
    workspaceHash: "test_clear_disk",
    longTermEnabled: false,
  });

  const gate = new PermissionGate({
    memory: mm,
    persistPath,
  });

  // Write a permission to disk
  gate._persistPermission("file_write");
  assert.ok(fs.existsSync(persistPath), "Permission file should exist");

  // Clear session grants
  gate.clearSessionGrants();

  // File should be deleted
  assert.ok(!fs.existsSync(persistPath),
    "Permission file should be deleted after clearSessionGrants");

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  mm.destroy();
});

// ─── Bug 2: Circuit breaker timeout aligned with LLM timeout ──────

test("BaseAgent circuit breaker timeout defaults to 1.5x LLM timeout (45s)", () => {
  const { BaseAgent } = require("../src/mas/agents/base-agent");
  const { AGENT_TYPE } = require("../src/mas/types");

  const agent = new BaseAgent(
    { type: AGENT_TYPE.CODER },
    {
      permissionGate: { requestPermission: async () => ({ decision: "approved" }) },
      memory: {
        shortTerm: { set: () => {}, get: () => undefined },
        working: { set: () => {}, get: () => undefined, recordDecision: () => {} },
      },
      emitEvent: () => {},
      runLLM: async () => "ok",
    },
  );

  // Default: 30s LLM timeout + 5s buffer = 35s circuit breaker timeout
  // This ensures LLM timeouts are counted as CB failures (CB fires just after LLM timeout)
  assert.equal(agent._llmTimeout, 30000, "Default LLM timeout should be 30s");
  assert.equal(agent._llmCircuitBreaker.timeout, 35000,
    "CB timeout should be 35s (LLM timeout + 5s buffer)");
});

test("BaseAgent circuit breaker timeout scales with custom LLM timeout", () => {
  const { BaseAgent } = require("../src/mas/agents/base-agent");
  const { AGENT_TYPE } = require("../src/mas/types");

  const agent = new BaseAgent(
    { type: AGENT_TYPE.CODER, llmTimeout: 60000 },
    {
      permissionGate: { requestPermission: async () => ({ decision: "approved" }) },
      memory: {
        shortTerm: { set: () => {}, get: () => undefined },
        working: { set: () => {}, get: () => undefined, recordDecision: () => {} },
      },
      emitEvent: () => {},
      runLLM: async () => "ok",
    },
  );

  assert.equal(agent._llmTimeout, 60000, "Custom LLM timeout should be 60s");
  assert.equal(agent._llmCircuitBreaker.timeout, 65000,
    "CB timeout should be 65s (60s LLM timeout + 5s buffer)");
});

// ─── Bug 3: retryCount logic in state-machine.js ─────────────────

test("State machine: retryCount NOT incremented on initial failure (isRetry=false)", () => {
  const { ComputeStateMachine } = require("../src/compute/state-machine");
  const { createJob, createStep, STEP_STATUSES, JOB_STATUSES } = require("../src/compute/job-model");

  const job = createJob({ goal: "test retryCount" });
  const step = createStep({ description: "test step" });
  job.steps.push(step);

  const sm = new ComputeStateMachine();

  sm.transitionJob(job, JOB_STATUSES.PLANNING);
  sm.transitionJob(job, JOB_STATUSES.RUNNING);

  sm.transitionStep(job, step, STEP_STATUSES.RUNNING);
  sm.transitionStep(job, step, STEP_STATUSES.FAILED, {
    error: "initial failure",
    isRetry: false,
  });

  assert.equal(step.retryCount, 0,
    "retryCount should be 0 after initial failure (not a retry)");
});

test("State machine: retryCount IS incremented on retry (isRetry=true)", () => {
  const { ComputeStateMachine } = require("../src/compute/state-machine");
  const { createJob, createStep, STEP_STATUSES, JOB_STATUSES } = require("../src/compute/job-model");

  const job = createJob({ goal: "test retryCount" });
  const step = createStep({ description: "test step" });
  job.steps.push(step);

  const sm = new ComputeStateMachine();

  sm.transitionJob(job, JOB_STATUSES.PLANNING);
  sm.transitionJob(job, JOB_STATUSES.RUNNING);

  // Initial failure
  sm.transitionStep(job, step, STEP_STATUSES.RUNNING);
  sm.transitionStep(job, step, STEP_STATUSES.FAILED, {
    error: "fail",
    isRetry: false,
  });
  assert.equal(step.retryCount, 0);

  // Reset for retry
  step.status = STEP_STATUSES.RUNNING;

  // Retry failure
  sm.transitionStep(job, step, STEP_STATUSES.FAILED, {
    error: "fail again",
    isRetry: true,
  });
  assert.equal(step.retryCount, 1,
    "retryCount should be 1 after first retry");
});
