/**
 * Tests for GitWorkflow — git automation
 */
"use strict";
const { describe, it } = require("node:test");

const assert = require("node:assert");

let GitWorkflow, gitExec;
try {
  ({ GitWorkflow, gitExec } = require("../src/mas/git-workflow"));
} catch (err) {
  console.log("git-workflow.js not found — skipping:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

describe("GitWorkflow", () => {
  it("gets repository status", () => {
    const gw = new GitWorkflow();
    const status = gw.status();
    assert.ok(typeof status.branch === "string");
    assert.ok(Array.isArray(status.files));
    assert.ok(typeof status.clean === "boolean");
    assert.ok(typeof status.ahead === "number");
    assert.ok(typeof status.behind === "number");
  });

  it("gets recent log entries", () => {
    const gw = new GitWorkflow();
    const log = gw.log(5);
    assert.ok(Array.isArray(log));
    if (log.length > 0) {
      assert.ok(typeof log[0].hash === "string");
      assert.ok(typeof log[0].message === "string");
    }
  });

  it("gets diff", () => {
    const gw = new GitWorkflow();
    const diff = gw.diff();
    assert.ok(typeof diff === "string");
  });

  it("generates fallback commit message", async () => {
    const gw = new GitWorkflow(); // no runLLM
    const diff = `diff --git a/test.js b/test.js
--- a/test.js
+++ b/test.js
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;`;
    const result = await gw.generateCommitMessage(diff);
    assert.ok(result.suggestion.length > 0);
    assert.ok(result.suggestion.includes("test.js"));
  });

  it("generates fallback PR description", async () => {
    const gw = new GitWorkflow();
    const result = await gw.generatePRDescription({
      gitDiff: "some diff",
      commitMessages: ["feat: add feature", "fix: bug fix"],
    });
    assert.ok(result.title.length > 0);
    assert.ok(result.body.includes("Summary"));
  });

  it("generates changelog from conventional commits", () => {
    const gw = new GitWorkflow();
    const result = gw.generateChangelog({
      commits: [
        "feat: add new feature",
        "fix: resolve bug",
        "refactor: clean up code",
        "docs: update readme",
        "random change without prefix",
      ],
    });
    assert.ok(result.changelog.includes("Features"));
    assert.ok(result.changelog.includes("Bug Fixes"));
    assert.ok(result.changelog.includes("Refactoring"));
    assert.ok(result.changelog.includes("Documentation"));
    assert.ok(result.changelog.includes("Other Changes"));
  });

  it("generates empty changelog for no commits", () => {
    const gw = new GitWorkflow();
    const result = gw.generateChangelog({ commits: [] });
    assert.strictEqual(result.changelog, "No changes.");
  });

  it("generates commit message with LLM", async () => {
    const mockLLM = async (prompt) => "feat: add awesome feature\n\nDetailed description.";
    const gw = new GitWorkflow({ runLLM: mockLLM });
    const result = await gw.generateCommitMessage("diff content");
    assert.ok(result.suggestion.includes("feat"));
  });

  it("falls back on LLM error", async () => {
    const failLLM = async () => { throw new Error("LLM down"); };
    const gw = new GitWorkflow({ runLLM: failLLM });
    const result = await gw.generateCommitMessage("diff --git a/x.js b/x.js\n+line");
    assert.ok(result.suggestion.length > 0);
  });
});

describe("gitExec", () => {
  it("executes git commands", () => {
    const result = gitExec("rev-parse --is-inside-work-tree");
    assert.strictEqual(result, "true");
  });

  it("throws on invalid command", () => {
    assert.throws(() => gitExec("invalid-command-xyz"));
  });
});
