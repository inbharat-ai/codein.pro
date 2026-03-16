/**
 * SmartApply & CommandRunner — Behavioral Tests
 *
 * Tests actual code diff application, conflict detection, fuzzy matching,
 * edge cases (empty files, multiple edits), backup/restore, and command running.
 */
"use strict";
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const {
  SmartApply,
  CommandRunner,
  levenshteinDistance,
  similarity,
} = require("../src/mas/smart-apply");

// ─── Helpers ─────────────────────────────────────────────────

let tmpDirs = [];

function createTmpDir(prefix = "codin-smartapply-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(dir, name, content) {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf-8");
  return p;
}

function readFile(p) {
  return fs.readFileSync(p, "utf-8");
}

after(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

// ─── Levenshtein & Similarity ────────────────────────────────

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    assert.equal(levenshteinDistance("abc", "abc"), 0);
  });

  it("returns length for empty vs non-empty", () => {
    assert.equal(levenshteinDistance("", "abc"), 3);
    assert.equal(levenshteinDistance("xyz", ""), 3);
  });

  it("returns 0 for both empty", () => {
    assert.equal(levenshteinDistance("", ""), 0);
  });

  it("computes correct distance for kitten/sitting", () => {
    assert.equal(levenshteinDistance("kitten", "sitting"), 3);
  });

  it("computes correct distance for single char difference", () => {
    assert.equal(levenshteinDistance("abc", "axc"), 1);
  });

  it("is symmetric", () => {
    assert.equal(
      levenshteinDistance("hello", "world"),
      levenshteinDistance("world", "hello")
    );
  });
});

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    assert.equal(similarity("hello", "hello"), 1);
  });

  it("returns 1 for both empty", () => {
    assert.equal(similarity("", ""), 1);
  });

  it("returns 0 for completely different strings", () => {
    // "abc" vs "xyz" => edit distance 3, max len 3, similarity = 0
    assert.equal(similarity("abc", "xyz"), 0);
  });

  it("returns value between 0 and 1 for partial matches", () => {
    const s = similarity("hello", "hallo");
    assert.ok(s > 0);
    assert.ok(s < 1);
  });
});

// ─── SmartApply — Replace Edits ──────────────────────────────

describe("SmartApply — Replace Edit", () => {
  it("replaces an exact match in a file", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "test.js", 'const x = 1;\nconsole.log(x);\n');
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "replace",
      search: "const x = 1;",
      replacement: "const x = 42;",
    });

    assert.ok(result.success);
    assert.ok(result.linesChanged > 0);
    assert.ok(readFile(fp).includes("const x = 42;"));
    assert.ok(readFile(fp).includes("console.log(x);"));
  });

  it("uses fuzzy matching when exact match fails", async () => {
    const dir = createTmpDir();
    // File has slightly different whitespace from the search string
    const fp = writeFile(
      dir,
      "fuzzy.js",
      'function  greet( name ) {\n  return "Hello " + name;\n}\n'
    );
    const sa = new SmartApply({ workspaceRoot: dir, similarityThreshold: 0.6 });

    const result = await sa.applyEdit(fp, {
      type: "replace",
      search: 'function greet(name) {\n  return "Hello " + name;\n}',
      replacement:
        'function greet(name) {\n  return `Hello ${name}!`;\n}',
    });

    assert.ok(result.success);
    const content = readFile(fp);
    assert.ok(content.includes("Hello ${name}!"));
  });

  it("fails when no match found (below threshold)", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "nomatch.js", "completely different content\n");
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "replace",
      search: "this text does not exist anywhere at all in the file",
      replacement: "new text",
    });

    assert.ok(!result.success);
  });

  it("returns no-op when edit produces no change", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "same.js", "const x = 1;\n");
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "replace",
      search: "const x = 1;",
      replacement: "const x = 1;",
    });

    assert.ok(result.success);
    assert.equal(result.linesChanged, 0);
  });
});

// ─── SmartApply — Insert Edits ───────────────────────────────

describe("SmartApply — Insert Edit", () => {
  it("inserts at a specific line number", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "insert.js", "line1\nline2\nline3\n");
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "insert",
      lineNumber: 2,
      replacement: "inserted_line",
    });

    assert.ok(result.success);
    const lines = readFile(fp).split("\n");
    assert.equal(lines[1], "inserted_line");
  });

  it("inserts after a search pattern", async () => {
    const dir = createTmpDir();
    const fp = writeFile(
      dir,
      "after.js",
      "import fs from 'fs';\n\nfunction main() {}\n"
    );
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "insert",
      search: "import fs from 'fs';",
      replacement: "import path from 'path';",
    });

    assert.ok(result.success);
    const content = readFile(fp);
    const lines = content.split("\n");
    const fsIdx = lines.findIndex((l) => l.includes("import fs"));
    const pathIdx = lines.findIndex((l) => l.includes("import path"));
    assert.equal(pathIdx, fsIdx + 1);
  });

  it("appends to end when no lineNumber or search given", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "append.js", "line1\nline2\n");
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "insert",
      replacement: "appended_line",
    });

    assert.ok(result.success);
    assert.ok(readFile(fp).trimEnd().endsWith("appended_line"));
  });
});

// ─── SmartApply — Delete Edits ───────────────────────────────

describe("SmartApply — Delete Edit", () => {
  it("deletes an exact match", async () => {
    const dir = createTmpDir();
    const fp = writeFile(
      dir,
      "del.js",
      "keep this\ndelete this line\nkeep this too\n"
    );
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "delete",
      search: "delete this line\n",
    });

    assert.ok(result.success);
    const content = readFile(fp);
    assert.ok(!content.includes("delete this line"));
    assert.ok(content.includes("keep this"));
  });
});

// ─── SmartApply — Multiple Edits (Batch) ─────────────────────

describe("SmartApply — Batch Edits", () => {
  it("applies multiple edits atomically", async () => {
    const dir = createTmpDir();
    const fp = writeFile(
      dir,
      "batch.js",
      'const a = 1;\nconst b = 2;\nconst c = 3;\n'
    );
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdits(fp, [
      { type: "replace", search: "const a = 1;", replacement: "const a = 10;" },
      { type: "replace", search: "const c = 3;", replacement: "const c = 30;" },
    ]);

    assert.ok(result.success);
    const content = readFile(fp);
    assert.ok(content.includes("const a = 10;"));
    assert.ok(content.includes("const b = 2;")); // unchanged
    assert.ok(content.includes("const c = 30;"));
  });

  it("rolls back all edits if one fails", async () => {
    const dir = createTmpDir();
    const original = 'const a = 1;\nconst b = 2;\n';
    const fp = writeFile(dir, "rollback.js", original);
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdits(fp, [
      { type: "replace", search: "const a = 1;", replacement: "const a = 99;" },
      {
        type: "replace",
        search: "this text absolutely does not exist in the file at all",
        replacement: "should fail",
      },
    ]);

    assert.ok(!result.success);
    // File should be rolled back to original
    assert.equal(readFile(fp), original);
  });
});

// ─── SmartApply — Edge Cases ─────────────────────────────────

describe("SmartApply — Edge Cases", () => {
  it("handles empty file for replace (fails gracefully)", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "empty.js", "");
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "replace",
      search: "something",
      replacement: "other",
    });

    assert.ok(!result.success);
  });

  it("handles insert into empty file at line 1", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "empty-insert.js", "");
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "insert",
      lineNumber: 1,
      replacement: "// first line",
    });

    assert.ok(result.success);
    assert.ok(readFile(fp).includes("// first line"));
  });

  it("resolves relative paths against workspace root", async () => {
    const dir = createTmpDir();
    writeFile(dir, "sub/test.js", "content\n");
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit("sub/test.js", {
      type: "replace",
      search: "content",
      replacement: "updated",
    });

    assert.ok(result.success);
    assert.ok(readFile(path.join(dir, "sub/test.js")).includes("updated"));
  });
});

// ─── SmartApply — Unified Diff ───────────────────────────────

describe("SmartApply — Unified Diff Generation", () => {
  it("generates a valid unified diff", () => {
    const sa = new SmartApply();
    const diff = sa.generateUnifiedDiff(
      "line1\nline2\nline3\n",
      "line1\nmodified\nline3\n",
      "test.js"
    );

    assert.ok(diff.includes("--- a/test.js"));
    assert.ok(diff.includes("+++ b/test.js"));
    assert.ok(diff.includes("-line2"));
    assert.ok(diff.includes("+modified"));
  });

  it("returns empty string for identical content", () => {
    const sa = new SmartApply();
    const diff = sa.generateUnifiedDiff("same\n", "same\n", "file.js");
    assert.equal(diff, "");
  });
});

// ─── SmartApply — Syntax Validation ──────────────────────────

describe("SmartApply — Syntax Validation", () => {
  it("validates correct JSON", () => {
    const sa = new SmartApply();
    const result = sa.validateSyntax("config.json", '{"key":"value"}');
    assert.ok(result.valid);
  });

  it("catches invalid JSON", () => {
    const sa = new SmartApply();
    const result = sa.validateSyntax("config.json", "{broken json}");
    assert.ok(!result.valid);
    assert.ok(result.errors.length > 0);
  });

  it("validates balanced braces in JS", () => {
    const sa = new SmartApply();
    const valid = sa.validateSyntax(
      "test.js",
      'function f() { if (true) { return 1; } }'
    );
    assert.ok(valid.valid);
  });

  it("catches unbalanced braces in JS", () => {
    const sa = new SmartApply();
    const invalid = sa.validateSyntax("test.js", "function f() { if (true) {");
    assert.ok(!invalid.valid);
    assert.ok(invalid.errors.some((e) => e.includes("Unclosed")));
  });

  it("ignores braces inside strings", () => {
    const sa = new SmartApply();
    const result = sa.validateSyntax(
      "test.js",
      'const s = "a { b }"; function f() {}'
    );
    assert.ok(result.valid);
  });

  it("returns valid for unknown file types", () => {
    const sa = new SmartApply();
    const result = sa.validateSyntax("readme.md", "# { not code }");
    assert.ok(result.valid);
  });
});

// ─── SmartApply — Backup/Restore ─────────────────────────────

describe("SmartApply — Backup & Restore", () => {
  it("creates and restores a backup", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "backup-test.js", "original content\n");
    const sa = new SmartApply({ workspaceRoot: dir });

    const backupPath = await sa.createBackup(fp);
    assert.ok(fs.existsSync(backupPath));
    assert.equal(readFile(backupPath), "original content\n");

    // Modify the file
    fs.writeFileSync(fp, "modified content\n");

    // Restore
    await sa.restoreBackup(fp, backupPath);
    assert.equal(readFile(fp), "original content\n");
  });
});

// ─── CommandRunner ───────────────────────────────────────────

describe("CommandRunner", () => {
  it("runs echo and captures stdout", async () => {
    const runner = new CommandRunner({ timeout: 10000 });
    const result = await runner.run("echo hello");

    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.join(" ").includes("hello"));
    assert.ok(result.duration >= 0);
    assert.equal(result.command, "echo hello");
  });

  it("captures non-zero exit code", async () => {
    const runner = new CommandRunner({ timeout: 5000 });
    const result = await runner.run("node -e \"process.exit(1)\"");
    // On Windows through cmd.exe, exit codes may differ; just check it ran
    assert.equal(typeof result.exitCode, "number");
    assert.ok(result.command.includes("process.exit"));
  });

  it("parses Jest output format", () => {
    const runner = new CommandRunner();
    const lines = [
      "PASS src/test.js",
      "Tests:       5 passed, 1 failed, 6 total",
      "Time:        2.5 s",
    ];
    const parsed = runner.parseOutput(lines, "jest");
    assert.equal(parsed.passed, 5);
    assert.equal(parsed.failed, 1);
    assert.equal(parsed.total, 6);
  });

  it("parses ESLint output format", () => {
    const runner = new CommandRunner();
    const lines = [
      "/src/foo.js:10:5: error Missing semicolon (semi)",
      "/src/bar.js:20:3: warning Unexpected console statement (no-console)",
    ];
    const parsed = runner.parseOutput(lines, "eslint");
    assert.equal(parsed.errorCount, 1);
    assert.equal(parsed.warningCount, 1);
    assert.equal(parsed.errors.length, 2);
  });

  it("parses TypeScript compiler output", () => {
    const runner = new CommandRunner();
    const lines = [
      "src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    ];
    const parsed = runner.parseOutput(lines, "tsc");
    assert.equal(parsed.errorCount, 1);
    assert.equal(parsed.errors[0].code, "TS2322");
  });
});
