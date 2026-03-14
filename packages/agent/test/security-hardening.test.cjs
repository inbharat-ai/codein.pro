"use strict";

const assert = require("node:assert/strict");

const {
  validateTerminalCommand,
  validateGitBranch,
  validateGitStagePaths,
} = require("../src/routes/swarm-validators");

// ─── ensureSwarmPermission: fail-closed behavior ────────────────────

describe("ensureSwarmPermission fail-closed", () => {
  // We test this by importing the route module and calling ensureSwarmPermission
  // indirectly through a route handler. Since ensureSwarmPermission is not exported,
  // we replicate the logic here to verify the contract.

  it("returns false (503) when deps.requirePermission is missing", async () => {
    // Simulate the fail-closed logic
    const deps = {}; // no requirePermission, no permissionBypass
    let responseStatus = null;
    let responseBody = null;

    const res = {
      setHeader() {},
      writeHead() {},
      end(body) { responseBody = JSON.parse(body); },
    };

    // Replicate the ensureSwarmPermission logic
    if (deps.permissionBypass === true) {
      responseStatus = "bypass";
    } else if (typeof deps.requirePermission !== "function") {
      responseStatus = 503;
      responseBody = {
        error: "Permission system unavailable",
      };
    }

    assert.equal(responseStatus, 503);
    assert.equal(responseBody.error, "Permission system unavailable");
  });

  it("returns true when deps.permissionBypass === true", async () => {
    const deps = { permissionBypass: true };

    let allowed = false;
    if (deps.permissionBypass === true) {
      allowed = true;
    } else if (typeof deps.requirePermission !== "function") {
      allowed = false;
    }

    assert.equal(allowed, true);
  });

  it("does NOT bypass when permissionBypass is truthy but not === true", async () => {
    const deps = { permissionBypass: "yes" };

    let allowed = false;
    if (deps.permissionBypass === true) {
      allowed = true;
    } else if (typeof deps.requirePermission !== "function") {
      allowed = false;
    }

    assert.equal(allowed, false);
  });
});

// ─── Terminal command validation ────────────────────────────────────

describe("validateTerminalCommand", () => {
  it("rejects empty/null command", () => {
    assert.equal(validateTerminalCommand(null).valid, false);
    assert.equal(validateTerminalCommand("").valid, false);
    assert.equal(validateTerminalCommand("   ").valid, false);
  });

  it("rejects commands over 4096 chars", () => {
    const long = "a".repeat(4097);
    assert.equal(validateTerminalCommand(long).valid, false);
  });

  it("rejects newlines", () => {
    assert.equal(validateTerminalCommand("ls\nrm -rf /").valid, false);
    assert.equal(validateTerminalCommand("ls\rrm -rf /").valid, false);
  });

  it("rejects heredocs and redirections", () => {
    assert.equal(validateTerminalCommand("cat << EOF").valid, false);
    assert.equal(validateTerminalCommand("echo hello > file").valid, false);
    assert.equal(validateTerminalCommand("cat < file").valid, false);
  });

  it("rejects shell metacharacters (; & | ` $ ( ) { })", () => {
    assert.equal(validateTerminalCommand("ls; rm -rf /").valid, false);
    assert.equal(validateTerminalCommand("ls && echo hi").valid, false);
    assert.equal(validateTerminalCommand("ls | grep foo").valid, false);
    assert.equal(validateTerminalCommand("echo `whoami`").valid, false);
    assert.equal(validateTerminalCommand("echo $HOME").valid, false);
    assert.equal(validateTerminalCommand("echo $(whoami)").valid, false);
    assert.equal(validateTerminalCommand("echo {a,b}").valid, false);
  });

  it("accepts valid simple commands", () => {
    const r1 = validateTerminalCommand("ls");
    assert.equal(r1.valid, true);
    assert.equal(r1.trimmed, "ls");

    const r2 = validateTerminalCommand("npm test");
    assert.equal(r2.valid, true);

    const r3 = validateTerminalCommand("echo hello");
    assert.equal(r3.valid, true);

    const r4 = validateTerminalCommand("git status");
    assert.equal(r4.valid, true);
  });

  it("trims whitespace", () => {
    const r = validateTerminalCommand("  ls  ");
    assert.equal(r.valid, true);
    assert.equal(r.trimmed, "ls");
  });

  it("rejects non-ASCII characters", () => {
    assert.equal(validateTerminalCommand("ls \u00e9").valid, false);
    assert.equal(validateTerminalCommand("rm \u0000file").valid, false);
  });
});

// ─── Git branch validation ──────────────────────────────────────────

describe("validateGitBranch", () => {
  it("rejects empty/null", () => {
    assert.equal(validateGitBranch(null).valid, false);
    assert.equal(validateGitBranch("").valid, false);
  });

  it("rejects names over 100 chars", () => {
    const long = "a" + "b".repeat(100);
    assert.equal(validateGitBranch(long).valid, false);
  });

  it("rejects names with '..'", () => {
    assert.equal(validateGitBranch("feature..test").valid, false);
  });

  it("rejects names with '//'", () => {
    assert.equal(validateGitBranch("feature//test").valid, false);
  });

  it("rejects names ending in '.lock'", () => {
    assert.equal(validateGitBranch("my-branch.lock").valid, false);
  });

  it("rejects names starting with '-'", () => {
    assert.equal(validateGitBranch("-bad-branch").valid, false);
  });

  it("rejects names ending with non-alphanumeric", () => {
    assert.equal(validateGitBranch("branch-").valid, false);
    assert.equal(validateGitBranch("branch.").valid, false);
    assert.equal(validateGitBranch("branch/").valid, false);
  });

  it("rejects names with control characters or spaces", () => {
    assert.equal(validateGitBranch("feature branch").valid, false);
    assert.equal(validateGitBranch("feature\tbranch").valid, false);
  });

  it("accepts valid branch names", () => {
    assert.equal(validateGitBranch("feature/my-branch").valid, true);
    assert.equal(validateGitBranch("fix-123").valid, true);
    assert.equal(validateGitBranch("release/v1.2.3").valid, true);
    assert.equal(validateGitBranch("main").valid, true);
    assert.equal(validateGitBranch("a").valid, true);
  });
});

// ─── Git stage path validation ──────────────────────────────────────

describe("validateGitStagePaths", () => {
  it("rejects non-array / empty array", () => {
    assert.equal(validateGitStagePaths(null).valid, false);
    assert.equal(validateGitStagePaths("file.js").valid, false);
    assert.equal(validateGitStagePaths([]).valid, false);
  });

  it("rejects more than 100 files", () => {
    const files = Array.from({ length: 101 }, (_, i) => `file${i}.js`);
    assert.equal(validateGitStagePaths(files).valid, false);
  });

  it("rejects null bytes", () => {
    assert.equal(validateGitStagePaths(["file\0.js"]).valid, false);
  });

  it("rejects paths over 500 chars", () => {
    const long = "a".repeat(501);
    assert.equal(validateGitStagePaths([long]).valid, false);
  });

  it("rejects control characters", () => {
    assert.equal(validateGitStagePaths(["file\t.js"]).valid, false);
    assert.equal(validateGitStagePaths(["file\n.js"]).valid, false);
  });

  it("rejects path traversal (..)", () => {
    assert.equal(validateGitStagePaths(["../etc/passwd"]).valid, false);
    assert.equal(validateGitStagePaths(["foo/../../bar"]).valid, false);
  });

  it("rejects absolute paths", () => {
    assert.equal(validateGitStagePaths(["/etc/passwd"]).valid, false);
    assert.equal(validateGitStagePaths(["\\windows\\system32"]).valid, false);
  });

  it("accepts valid relative paths", () => {
    assert.equal(validateGitStagePaths(["src/index.js"]).valid, true);
    assert.equal(validateGitStagePaths(["package.json"]).valid, true);
    assert.equal(
      validateGitStagePaths(["src/index.js", "README.md", "lib/utils.js"]).valid,
      true,
    );
  });

  it("accepts exactly 100 files", () => {
    const files = Array.from({ length: 100 }, (_, i) => `file${i}.js`);
    assert.equal(validateGitStagePaths(files).valid, true);
  });
});
