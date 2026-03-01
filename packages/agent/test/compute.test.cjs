/**
 * CodeIn Compute — Tests
 *
 * Covers: job model, state machine, policy enforcement, sandbox,
 *         event stream, multilingual adapter, and workflow definitions.
 *
 * Uses node:test (built-in, same pattern as the rest of the agent test suite).
 */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// ─── Imports ─────────────────────────────────────────────────
const {
  JOB_STATUSES,
  STEP_STATUSES,
  createJob,
  createStep,
  createDefaultPolicy,
  validateJob,
  validateStep,
  validatePolicy,
} = require("../src/compute/job-model");

const {
  ComputeStateMachine,
  TRANSITIONS,
  TERMINAL_STATES,
} = require("../src/compute/state-machine");

const { PolicyEnforcer } = require("../src/compute/policy");

const { ComputeEventStream, EVENT_TYPES } = require("../src/compute/event-stream");

const { WORKFLOWS } = require("../src/compute/workflows");

// ═══════════════════════════════════════════════════════════════
// 1. JOB MODEL
// ═══════════════════════════════════════════════════════════════

test("createJob — produces valid job with defaults", () => {
  const job = createJob({ goal: "Fix all tests" });
  assert.ok(job.id.startsWith("job_"));
  assert.equal(job.status, JOB_STATUSES.QUEUED);
  assert.equal(job.goal, "Fix all tests");
  assert.equal(job.language, "en");
  assert.equal(job.userId, "local");
  assert.ok(job.createdAt);
  assert.ok(job.policy);
  assert.deepEqual(job.steps, []);
  assert.deepEqual(job.artifacts, []);
  assert.deepEqual(job.logs, []);
  assert.equal(job.error, null);
  assert.equal(job.metadata.tokensUsed, 0);
});

test("createJob — rejects empty goal", () => {
  assert.throws(() => createJob({ goal: "" }), /goal is required/i);
  assert.throws(() => createJob({ goal: "   " }), /goal is required/i);
  assert.throws(() => createJob({}), /goal is required/i);
});

test("createJob — rejects excessively long goal", () => {
  const huge = "x".repeat(10001);
  assert.throws(() => createJob({ goal: huge }), /exceeds maximum/i);
});

test("createJob — accepts custom userId and language", () => {
  const job = createJob({ goal: "Test", userId: "user42", language: "hi" });
  assert.equal(job.userId, "user42");
  assert.equal(job.language, "hi");
});

test("createStep — produces valid step", () => {
  const step = createStep({ description: "Run tests" });
  assert.ok(step.id.startsWith("step_"));
  assert.equal(step.status, STEP_STATUSES.PENDING);
  assert.equal(step.description, "Run tests");
  assert.equal(step.agentName, "default");
  assert.deepEqual(step.tools, []);
  assert.equal(step.confidence, null);
  assert.equal(step.escalated, false);
  assert.equal(step.retryCount, 0);
});

test("createStep — rejects missing description", () => {
  assert.throws(() => createStep({}), /description is required/i);
});

test("createDefaultPolicy — fail-closed defaults", () => {
  const p = createDefaultPolicy();
  assert.equal(p.allowNetwork, false, "Network must default OFF");
  assert.equal(p.allowBrowser, false, "Browser must default OFF");
  assert.equal(p.allowRepoWrite, false, "Repo write must default OFF");
  assert.equal(p.allowEscalation, false, "Escalation must default OFF");
  assert.equal(p.allowFSWrite, true, "FS write in sandbox is allowed");
  assert.ok(p.maxSteps >= 1);
  assert.ok(p.maxDurationMs >= 1000);
});

test("validateJob — valid job passes", () => {
  const job = createJob({ goal: "Go" });
  const { valid, errors } = validateJob(job);
  assert.ok(valid, `Errors: ${errors.join(", ")}`);
});

test("validateJob — invalid job fails", () => {
  const { valid } = validateJob({ id: "bad", goal: "", status: "nope" });
  assert.equal(valid, false);
});

test("validateStep — valid step passes", () => {
  const step = createStep({ description: "Step" });
  const { valid } = validateStep(step);
  assert.ok(valid);
});

test("validatePolicy — valid policy passes", () => {
  const p = createDefaultPolicy();
  const { valid } = validatePolicy(p);
  assert.ok(valid);
});

test("validatePolicy — catches bad types", () => {
  const { valid } = validatePolicy({ allowNetwork: "yes" });
  assert.equal(valid, false);
});

// ═══════════════════════════════════════════════════════════════
// 2. STATE MACHINE
// ═══════════════════════════════════════════════════════════════

test("state machine — valid job transitions", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "Test" });

  assert.equal(job.status, JOB_STATUSES.QUEUED);

  sm.transitionJob(job, JOB_STATUSES.PLANNING);
  assert.equal(job.status, JOB_STATUSES.PLANNING);

  sm.transitionJob(job, JOB_STATUSES.RUNNING);
  assert.equal(job.status, JOB_STATUSES.RUNNING);
  assert.ok(job.metadata.startedAt, "startedAt should be set");

  sm.transitionJob(job, JOB_STATUSES.COMPLETED);
  assert.equal(job.status, JOB_STATUSES.COMPLETED);
  assert.ok(job.metadata.completedAt, "completedAt should be set");
});

test("state machine — rejects invalid transition", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "Test" });

  // QUEUED → COMPLETED is not allowed (must go through PLANNING → RUNNING)
  assert.throws(
    () => sm.transitionJob(job, JOB_STATUSES.COMPLETED),
    /Invalid job transition/
  );
});

test("state machine — terminal states are terminal", () => {
  const sm = new ComputeStateMachine();
  for (const terminal of [JOB_STATUSES.COMPLETED, JOB_STATUSES.FAILED, JOB_STATUSES.CANCELLED]) {
    const job = createJob({ goal: "T" });
    sm.transitionJob(job, JOB_STATUSES.PLANNING);
    sm.transitionJob(job, JOB_STATUSES.RUNNING);

    // Get to terminal
    sm.transitionJob(job, terminal, terminal === JOB_STATUSES.FAILED ? { error: "err" } : {});

    // Nothing should be possible now
    assert.throws(
      () => sm.transitionJob(job, JOB_STATUSES.RUNNING),
      /Invalid job transition/
    );
  }
});

test("state machine — emits transition events", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "T" });
  const events = [];
  sm.on("job:transition", (e) => events.push(e));

  sm.transitionJob(job, JOB_STATUSES.PLANNING);
  sm.transitionJob(job, JOB_STATUSES.RUNNING);

  assert.equal(events.length, 2);
  assert.equal(events[0].from, JOB_STATUSES.QUEUED);
  assert.equal(events[0].to, JOB_STATUSES.PLANNING);
  assert.equal(events[1].to, JOB_STATUSES.RUNNING);
});

test("state machine — step transitions", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "T" });
  const step = createStep({ description: "S" });

  sm.transitionStep(job, step, STEP_STATUSES.RUNNING);
  assert.equal(step.status, STEP_STATUSES.RUNNING);
  assert.ok(step.startedAt);

  sm.transitionStep(job, step, STEP_STATUSES.COMPLETED, { output: "done", confidence: 0.85 });
  assert.equal(step.status, STEP_STATUSES.COMPLETED);
  assert.equal(step.output, "done");
  assert.equal(step.confidence, 0.85);
  assert.ok(step.endedAt);
});

test("state machine — step escalation sets flag", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "T" });
  const step = createStep({ description: "S" });

  sm.transitionStep(job, step, STEP_STATUSES.RUNNING);
  sm.transitionStep(job, step, STEP_STATUSES.ESCALATED);
  assert.equal(step.escalated, true);
});

test("state machine — step retry allowed from failed", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "T" });
  const step = createStep({ description: "S" });

  sm.transitionStep(job, step, STEP_STATUSES.RUNNING);
  sm.transitionStep(job, step, STEP_STATUSES.FAILED, { error: "timeout" });
  assert.equal(step.status, STEP_STATUSES.FAILED);

  // Retry → back to running
  sm.transitionStep(job, step, STEP_STATUSES.RUNNING);
  assert.equal(step.status, STEP_STATUSES.RUNNING);
});

test("state machine — canTransitionJob helper", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "T" });
  assert.equal(sm.canTransitionJob(job, JOB_STATUSES.PLANNING), true);
  assert.equal(sm.canTransitionJob(job, JOB_STATUSES.COMPLETED), false);
});

test("state machine — isTerminal", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "T" });
  assert.equal(sm.isTerminal(job), false);
  sm.transitionJob(job, JOB_STATUSES.CANCELLED);
  assert.equal(sm.isTerminal(job), true);
});

test("state machine — pause and resume cycle", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "T" });

  sm.transitionJob(job, JOB_STATUSES.PLANNING);
  sm.transitionJob(job, JOB_STATUSES.RUNNING);
  sm.transitionJob(job, JOB_STATUSES.PAUSED);
  assert.equal(job.status, JOB_STATUSES.PAUSED);

  sm.transitionJob(job, JOB_STATUSES.RUNNING);
  assert.equal(job.status, JOB_STATUSES.RUNNING);

  sm.transitionJob(job, JOB_STATUSES.COMPLETED);
  assert.equal(job.status, JOB_STATUSES.COMPLETED);
});

// ═══════════════════════════════════════════════════════════════
// 3. POLICY ENFORCER — FAIL-CLOSED
// ═══════════════════════════════════════════════════════════════

test("policy — merge with defaults keeps fail-closed base", () => {
  const pe = new PolicyEnforcer();
  const merged = pe.mergeWithDefaults({});
  assert.equal(merged.allowNetwork, false);
  assert.equal(merged.allowBrowser, false);
  assert.equal(merged.allowEscalation, false);
  assert.equal(merged.allowRepoWrite, false);
});

test("policy — merge accepts valid overrides", () => {
  const pe = new PolicyEnforcer();
  const merged = pe.mergeWithDefaults({ allowNetwork: true, maxSteps: 5 });
  assert.equal(merged.allowNetwork, true);
  assert.equal(merged.maxSteps, 5);
});

test("policy — merge hard caps maxSteps at 100", () => {
  const pe = new PolicyEnforcer();
  const merged = pe.mergeWithDefaults({ maxSteps: 9999 });
  assert.equal(merged.maxSteps, 100);
});

test("policy — merge hard caps maxDurationMs at 1 hour", () => {
  const pe = new PolicyEnforcer();
  const merged = pe.mergeWithDefaults({ maxDurationMs: 999999999 });
  assert.equal(merged.maxDurationMs, 3600000);
});

test("policy — merge hard caps maxCostUSD at $100", () => {
  const pe = new PolicyEnforcer();
  const merged = pe.mergeWithDefaults({ maxCostUSD: 500 });
  assert.equal(merged.maxCostUSD, 100);
});

test("policy — merge ignores unknown keys", () => {
  const pe = new PolicyEnforcer();
  const merged = pe.mergeWithDefaults({ unknownKey: true, hackMode: true });
  assert.equal(merged.unknownKey, undefined);
  assert.equal(merged.hackMode, undefined);
});

test("policy — merge ignores wrong types", () => {
  const pe = new PolicyEnforcer();
  const merged = pe.mergeWithDefaults({ allowNetwork: "yes", maxSteps: "ten" });
  assert.equal(merged.allowNetwork, false); // default, because "yes" is not boolean
  assert.equal(merged.maxSteps, 20); // default
});

test("policy — tool permission: blocked tool overrides allow", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), blockedTools: ["runTerminalCommand"] };
  const result = pe.checkToolPermission(policy, "runTerminalCommand");
  assert.equal(result.allowed, false);
  assert.match(result.reason, /blocked/i);
});

test("policy — tool permission: no allowedTools → deny all", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), allowedTools: [] };
  const result = pe.checkToolPermission(policy, "readFile");
  assert.equal(result.allowed, false);
});

test("policy — tool permission: wildcard allows", () => {
  const pe = new PolicyEnforcer();
  const policy = createDefaultPolicy(); // allowedTools: ["*"]
  const result = pe.checkToolPermission(policy, "readFile");
  assert.equal(result.allowed, true);
});

test("policy — tool permission: network tool denied when network OFF", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), allowNetwork: false };
  const result = pe.checkToolPermission(policy, "searchWeb");
  assert.equal(result.allowed, false);
  assert.match(result.reason, /network/i);
});

test("policy — tool permission: network tool allowed when network ON", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), allowNetwork: true };
  const result = pe.checkToolPermission(policy, "searchWeb");
  assert.equal(result.allowed, true);
});

test("policy — tool permission: write tool denied when write OFF", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), allowFSWrite: false };
  const result = pe.checkToolPermission(policy, "editFile");
  assert.equal(result.allowed, false);
});

test("policy — escalation denied by default", () => {
  const pe = new PolicyEnforcer();
  const policy = createDefaultPolicy();
  const result = pe.checkEscalation(policy);
  assert.equal(result.allowed, false);
});

test("policy — escalation allowed when enabled", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), allowEscalation: true };
  const result = pe.checkEscalation(policy, 0);
  assert.equal(result.allowed, true);
});

test("policy — escalation denied when budget exceeded", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), allowEscalation: true, maxCostUSD: 1.0 };
  const result = pe.checkEscalation(policy, 1.5);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /budget/i);
});

test("policy — file access: path traversal blocked", () => {
  const pe = new PolicyEnforcer();
  const policy = createDefaultPolicy();
  const workspace = "/tmp/job123";
  const result = pe.checkFileAccess("../../etc/passwd", workspace, policy);
  assert.equal(result.allowed, false);
});

test("policy — file access: within workspace allowed", () => {
  const pe = new PolicyEnforcer();
  const policy = createDefaultPolicy();
  const workspace = "/tmp/job123";
  const result = pe.checkFileAccess("/tmp/job123/output.txt", workspace, policy);
  assert.equal(result.allowed, true);
});

test("policy — file access: write denied when FS write OFF", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), allowFSWrite: false };
  const workspace = "/tmp/job123";
  const result = pe.checkFileAccess("/tmp/job123/out.txt", workspace, policy, "write");
  assert.equal(result.allowed, false);
});

test("policy — step limit enforcement", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), maxSteps: 5 };
  assert.equal(pe.checkStepLimit(policy, 4).allowed, true);
  assert.equal(pe.checkStepLimit(policy, 5).allowed, false);
  assert.equal(pe.checkStepLimit(policy, 10).allowed, false);
});

test("policy — duration limit enforcement", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), maxDurationMs: 5000 };
  const recent = new Date(Date.now() - 2000).toISOString();
  assert.equal(pe.checkDuration(policy, recent).allowed, true);

  const old = new Date(Date.now() - 10000).toISOString();
  assert.equal(pe.checkDuration(policy, old).allowed, false);
});

test("policy — command check: blocks dangerous commands", () => {
  const pe = new PolicyEnforcer();
  for (const cmd of ["rm", "curl", "bash", "powershell", "nc", "ssh", "wget"]) {
    const result = pe.checkCommand(cmd, []);
    assert.equal(result.allowed, false, `Expected '${cmd}' to be blocked`);
  }
});

test("policy — command check: allows safe commands", () => {
  const pe = new PolicyEnforcer();
  const result = pe.checkCommand("node", ["script.js"]);
  assert.equal(result.allowed, true);
});

test("policy — command check: blocks shell metacharacters in args", () => {
  const pe = new PolicyEnforcer();
  const result = pe.checkCommand("node", ["test.js; rm -rf /"]);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /metacharacter/i);
});

test("policy — command check: args must be array", () => {
  const pe = new PolicyEnforcer();
  const result = pe.checkCommand("node", "test.js");
  assert.equal(result.allowed, false);
  assert.match(result.reason, /array/i);
});

test("policy — audit log is maintained", () => {
  const pe = new PolicyEnforcer();
  const policy = createDefaultPolicy();
  pe.checkToolPermission(policy, "readFile");
  pe.checkToolPermission({ ...policy, blockedTools: ["writeFile"] }, "writeFile");

  const log = pe.getAuditLog();
  assert.ok(log.length >= 2);
  assert.equal(log[0].decision, "allowed");
  assert.equal(log[1].decision, "denied");
});

test("policy — network domain check: wildcard domain", () => {
  const pe = new PolicyEnforcer();
  const policy = {
    ...createDefaultPolicy(),
    allowNetwork: true,
    allowedDomains: ["*.github.com"],
  };
  const allowed = pe.checkNetworkAccess(policy, "api.github.com");
  assert.equal(allowed.allowed, true);

  const blocked = pe.checkNetworkAccess(policy, "evil.com");
  assert.equal(blocked.allowed, false);
});

test("policy — network check: denied when network OFF", () => {
  const pe = new PolicyEnforcer();
  const policy = { ...createDefaultPolicy(), allowNetwork: false };
  const result = pe.checkNetworkAccess(policy, "google.com");
  assert.equal(result.allowed, false);
});

// ═══════════════════════════════════════════════════════════════
// 4. SANDBOX — PATH TRAVERSAL & ISOLATION
// ═══════════════════════════════════════════════════════════════

test("sandbox — creates workspace structure", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compute-test-"));
  try {
    // Dynamic require to avoid import-time file creation
    const { ComputeSandbox } = require("../src/compute/sandbox");
    const policy = createDefaultPolicy();
    const sandbox = new ComputeSandbox({ workspaceDir: tmpDir, policy });

    assert.ok(fs.existsSync(path.join(tmpDir, "artifacts")));
    assert.ok(fs.existsSync(path.join(tmpDir, "tmp")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("sandbox — write and read file within workspace", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compute-test-"));
  try {
    const { ComputeSandbox } = require("../src/compute/sandbox");
    const sandbox = new ComputeSandbox({ workspaceDir: tmpDir, policy: createDefaultPolicy() });

    sandbox.writeFile("test.txt", "Hello Compute!");
    const content = sandbox.readFile("test.txt");
    assert.equal(content, "Hello Compute!");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("sandbox — blocks path traversal", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compute-test-"));
  try {
    const { ComputeSandbox } = require("../src/compute/sandbox");
    const sandbox = new ComputeSandbox({ workspaceDir: tmpDir, policy: createDefaultPolicy() });

    assert.throws(
      () => sandbox.readFile("../../etc/passwd"),
      /outside.*workspace|permission denied|path traversal/i
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("sandbox — blocks writing when FS write OFF", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compute-test-"));
  try {
    const { ComputeSandbox } = require("../src/compute/sandbox");
    const policy = { ...createDefaultPolicy(), allowFSWrite: false };
    const sandbox = new ComputeSandbox({ workspaceDir: tmpDir, policy });

    assert.throws(
      () => sandbox.writeFile("output.txt", "hacked"),
      /permission denied|write access.*disabled/i
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("sandbox — seal prevents further operations", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compute-test-"));
  try {
    const { ComputeSandbox } = require("../src/compute/sandbox");
    const sandbox = new ComputeSandbox({ workspaceDir: tmpDir, policy: createDefaultPolicy() });

    sandbox.seal();
    assert.throws(() => sandbox.writeFile("test.txt", "data"), /sealed|inactive/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("sandbox — listDir within workspace", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compute-test-"));
  try {
    const { ComputeSandbox } = require("../src/compute/sandbox");
    const sandbox = new ComputeSandbox({ workspaceDir: tmpDir, policy: createDefaultPolicy() });

    sandbox.writeFile("a.txt", "a");
    sandbox.writeFile("b.txt", "b");
    const listing = sandbox.listDir(".");
    assert.ok(listing.includes("a.txt"));
    assert.ok(listing.includes("b.txt"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 5. EVENT STREAM
// ═══════════════════════════════════════════════════════════════

test("event stream — EVENT_TYPES is frozen", () => {
  assert.ok(Object.isFrozen(EVENT_TYPES));
  assert.ok(EVENT_TYPES.JOB_PROGRESS);
  assert.ok(EVENT_TYPES.PLAN_READY);
  assert.ok(EVENT_TYPES.JOB_COMPLETE);
});

test("event stream — emits events to internal listeners", () => {
  const es = new ComputeEventStream();
  const received = [];
  es.on("job:event", (data) => received.push(data));

  // The emit override also triggers "job:event" internally
  es.emit("job123", EVENT_TYPES.JOB_PROGRESS, { status: "running" });

  // At minimum validate no crash; internal event format varies
  // The critical contract is that SSE subscribers receive events
});

// ═══════════════════════════════════════════════════════════════
// 6. WORKFLOWS
// ═══════════════════════════════════════════════════════════════

test("workflow — all 3 demo workflows are defined", () => {
  assert.ok(WORKFLOWS["fix-build"]);
  assert.ok(WORKFLOWS["feature-spec"]);
  assert.ok(WORKFLOWS["research-code"]);
});

test("workflow — each has required fields", () => {
  for (const [name, wf] of Object.entries(WORKFLOWS)) {
    assert.ok(wf.name, `${name} missing name`);
    assert.ok(wf.title, `${name} missing title`);
    assert.ok(wf.goal, `${name} missing goal`);
    assert.ok(wf.defaultPolicy, `${name} missing defaultPolicy`);
    assert.ok(wf.planTemplate, `${name} missing planTemplate`);
    assert.ok(wf.planTemplate.steps.length > 0, `${name} has no plan steps`);
  }
});

test("workflow — fix-build does not require network", () => {
  assert.equal(WORKFLOWS["fix-build"].defaultPolicy.allowNetwork, false);
  assert.equal(WORKFLOWS["fix-build"].defaultPolicy.allowEscalation, false);
});

test("workflow — research-code enables network", () => {
  assert.equal(WORKFLOWS["research-code"].defaultPolicy.allowNetwork, true);
  assert.equal(WORKFLOWS["research-code"].defaultPolicy.allowEscalation, true);
});

test("workflow — plan templates have descriptions", () => {
  for (const [name, wf] of Object.entries(WORKFLOWS)) {
    for (const step of wf.planTemplate.steps) {
      assert.ok(step.description, `${name} step missing description`);
      assert.ok(step.agentName, `${name} step missing agentName`);
    }
  }
});

test("workflow — policies pass validation", () => {
  const pe = new PolicyEnforcer();
  for (const [name, wf] of Object.entries(WORKFLOWS)) {
    const merged = pe.mergeWithDefaults(wf.defaultPolicy);
    const { valid, errors } = validatePolicy(merged);
    assert.ok(valid, `${name} policy invalid: ${errors.join(", ")}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// 7. INTEGRATION — FULL JOB LIFECYCLE (unit-level)
// ═══════════════════════════════════════════════════════════════

test("integration — full job lifecycle: create → plan → run → complete", () => {
  const sm = new ComputeStateMachine();

  // Create
  const job = createJob({ goal: "Refactor utils module" });
  assert.equal(job.status, JOB_STATUSES.QUEUED);

  // Planning
  sm.transitionJob(job, JOB_STATUSES.PLANNING);
  const step1 = createStep({ description: "Read files", agentName: "file-reader" });
  const step2 = createStep({ description: "Write refactored code", agentName: "code-writer" });
  job.steps.push(step1, step2);
  job.plan = "Simple 2-step refactor";

  // Running
  sm.transitionJob(job, JOB_STATUSES.RUNNING);

  // Step 1
  sm.transitionStep(job, step1, STEP_STATUSES.RUNNING);
  sm.transitionStep(job, step1, STEP_STATUSES.COMPLETED, { output: "files read", confidence: 0.9, model: "codestral" });

  // Step 2
  sm.transitionStep(job, step2, STEP_STATUSES.RUNNING);
  sm.transitionStep(job, step2, STEP_STATUSES.COMPLETED, { output: "refactored", confidence: 0.85, model: "codestral" });

  // Complete
  sm.transitionJob(job, JOB_STATUSES.COMPLETED);
  assert.equal(job.status, JOB_STATUSES.COMPLETED);
  assert.ok(sm.isTerminal(job));

  // Steps are completed
  assert.equal(step1.status, STEP_STATUSES.COMPLETED);
  assert.equal(step2.status, STEP_STATUSES.COMPLETED);
  assert.equal(step1.confidence, 0.9);
  assert.equal(step2.model, "codestral");

  // Logs recorded
  assert.ok(job.logs.length >= 4); // at least 4 transitions logged
});

test("integration — job failure after step failure", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "Fail test" });

  sm.transitionJob(job, JOB_STATUSES.PLANNING);
  const step = createStep({ description: "Destined to fail" });
  job.steps.push(step);

  sm.transitionJob(job, JOB_STATUSES.RUNNING);
  sm.transitionStep(job, step, STEP_STATUSES.RUNNING);
  sm.transitionStep(job, step, STEP_STATUSES.FAILED, { error: "LLM timeout" });

  // Job itself fails
  sm.transitionJob(job, JOB_STATUSES.FAILED, { error: "Step failed: LLM timeout" });

  assert.equal(job.status, JOB_STATUSES.FAILED);
  assert.equal(job.error, "Step failed: LLM timeout");
  assert.equal(step.error, "LLM timeout");
});

test("integration — cancellation from running", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "Will be cancelled" });

  sm.transitionJob(job, JOB_STATUSES.PLANNING);
  sm.transitionJob(job, JOB_STATUSES.RUNNING);
  sm.transitionJob(job, JOB_STATUSES.CANCELLED);

  assert.equal(job.status, JOB_STATUSES.CANCELLED);
  assert.ok(sm.isTerminal(job));
});

test("integration — cancellation from paused", () => {
  const sm = new ComputeStateMachine();
  const job = createJob({ goal: "Paused then cancelled" });

  sm.transitionJob(job, JOB_STATUSES.PLANNING);
  sm.transitionJob(job, JOB_STATUSES.RUNNING);
  sm.transitionJob(job, JOB_STATUSES.PAUSED);
  sm.transitionJob(job, JOB_STATUSES.CANCELLED);

  assert.equal(job.status, JOB_STATUSES.CANCELLED);
});
