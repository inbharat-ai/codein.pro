const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { PolicyEnforcer } = require("../src/compute/policy");
const { createDefaultPolicy } = require("../src/compute/job-model");
const { ComputeSandbox } = require("../src/compute/sandbox");

test("policy denies network when allowNetwork is false", () => {
  const policy = createDefaultPolicy();
  policy.allowNetwork = false;
  policy.allowedDomains = ["example.com"];

  const enforcer = new PolicyEnforcer();
  const result = enforcer.checkNetworkAccess(policy, "example.com");

  assert.equal(result.allowed, false);
  assert.match(result.reason, /Network access is disabled/);
});

test("policy fails closed when no tools are allowed", () => {
  const policy = createDefaultPolicy();
  policy.allowedTools = [];

  const enforcer = new PolicyEnforcer();
  const result = enforcer.checkToolPermission(policy, "readFile");

  assert.equal(result.allowed, false);
  assert.match(result.reason, /No tools are allowed/);
});

test("sandbox blocks path traversal outside workspace", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "codin-sandbox-"));
  const policy = createDefaultPolicy();
  const sandbox = new ComputeSandbox({ workspaceDir, policy });

  assert.throws(() => {
    sandbox.readFile("../secrets.txt");
  }, /Path traversal/);

  fs.rmSync(workspaceDir, { recursive: true, force: true });
});
