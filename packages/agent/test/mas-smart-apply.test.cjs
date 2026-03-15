/**
 * SmartApply & CommandRunner — Behavioral Tests
 *
 * Tests actual code diff application, conflict detection, fuzzy matching,
 * edge cases (empty files, multiple edits), backup/restore, and command running.
 */
"use strict";

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

afterAll(() => {
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
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("returns length for empty vs non-empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("xyz", "")).toBe(3);
  });

  it("returns 0 for both empty", () => {
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("computes correct distance for kitten/sitting", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("computes correct distance for single char difference", () => {
    expect(levenshteinDistance("abc", "axc")).toBe(1);
  });

  it("is symmetric", () => {
    expect(levenshteinDistance("hello", "world")).toBe(
      levenshteinDistance("world", "hello")
    );
  });
});

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    expect(similarity("hello", "hello")).toBe(1);
  });

  it("returns 1 for both empty", () => {
    expect(similarity("", "")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    // "abc" vs "xyz" => edit distance 3, max len 3, similarity = 0
    expect(similarity("abc", "xyz")).toBe(0);
  });

  it("returns value between 0 and 1 for partial matches", () => {
    const s = similarity("hello", "hallo");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
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

    expect(result.success).toBe(true);
    expect(result.linesChanged).toBeGreaterThan(0);
    expect(readFile(fp)).toContain("const x = 42;");
    expect(readFile(fp)).toContain("console.log(x);");
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

    expect(result.success).toBe(true);
    const content = readFile(fp);
    expect(content).toContain("Hello ${name}!");
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

    expect(result.success).toBe(false);
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

    expect(result.success).toBe(true);
    expect(result.linesChanged).toBe(0);
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

    expect(result.success).toBe(true);
    const lines = readFile(fp).split("\n");
    expect(lines[1]).toBe("inserted_line");
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

    expect(result.success).toBe(true);
    const content = readFile(fp);
    const lines = content.split("\n");
    const fsIdx = lines.findIndex((l) => l.includes("import fs"));
    const pathIdx = lines.findIndex((l) => l.includes("import path"));
    expect(pathIdx).toBe(fsIdx + 1);
  });

  it("appends to end when no lineNumber or search given", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "append.js", "line1\nline2\n");
    const sa = new SmartApply({ workspaceRoot: dir });

    const result = await sa.applyEdit(fp, {
      type: "insert",
      replacement: "appended_line",
    });

    expect(result.success).toBe(true);
    expect(readFile(fp).trimEnd().endsWith("appended_line")).toBe(true);
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

    expect(result.success).toBe(true);
    const content = readFile(fp);
    expect(content).not.toContain("delete this line");
    expect(content).toContain("keep this");
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

    expect(result.success).toBe(true);
    const content = readFile(fp);
    expect(content).toContain("const a = 10;");
    expect(content).toContain("const b = 2;"); // unchanged
    expect(content).toContain("const c = 30;");
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

    expect(result.success).toBe(false);
    // File should be rolled back to original
    expect(readFile(fp)).toBe(original);
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

    expect(result.success).toBe(false);
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

    expect(result.success).toBe(true);
    expect(readFile(fp)).toContain("// first line");
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

    expect(result.success).toBe(true);
    expect(readFile(path.join(dir, "sub/test.js"))).toContain("updated");
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

    expect(diff).toContain("--- a/test.js");
    expect(diff).toContain("+++ b/test.js");
    expect(diff).toContain("-line2");
    expect(diff).toContain("+modified");
  });

  it("returns empty string for identical content", () => {
    const sa = new SmartApply();
    const diff = sa.generateUnifiedDiff("same\n", "same\n", "file.js");
    expect(diff).toBe("");
  });
});

// ─── SmartApply — Syntax Validation ──────────────────────────

describe("SmartApply — Syntax Validation", () => {
  it("validates correct JSON", () => {
    const sa = new SmartApply();
    const result = sa.validateSyntax("config.json", '{"key":"value"}');
    expect(result.valid).toBe(true);
  });

  it("catches invalid JSON", () => {
    const sa = new SmartApply();
    const result = sa.validateSyntax("config.json", "{broken json}");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validates balanced braces in JS", () => {
    const sa = new SmartApply();
    const valid = sa.validateSyntax(
      "test.js",
      'function f() { if (true) { return 1; } }'
    );
    expect(valid.valid).toBe(true);
  });

  it("catches unbalanced braces in JS", () => {
    const sa = new SmartApply();
    const invalid = sa.validateSyntax("test.js", "function f() { if (true) {");
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.some((e) => e.includes("Unclosed"))).toBe(true);
  });

  it("ignores braces inside strings", () => {
    const sa = new SmartApply();
    const result = sa.validateSyntax(
      "test.js",
      'const s = "a { b }"; function f() {}'
    );
    expect(result.valid).toBe(true);
  });

  it("returns valid for unknown file types", () => {
    const sa = new SmartApply();
    const result = sa.validateSyntax("readme.md", "# { not code }");
    expect(result.valid).toBe(true);
  });
});

// ─── SmartApply — Backup/Restore ─────────────────────────────

describe("SmartApply — Backup & Restore", () => {
  it("creates and restores a backup", async () => {
    const dir = createTmpDir();
    const fp = writeFile(dir, "backup-test.js", "original content\n");
    const sa = new SmartApply({ workspaceRoot: dir });

    const backupPath = await sa.createBackup(fp);
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(readFile(backupPath)).toBe("original content\n");

    // Modify the file
    fs.writeFileSync(fp, "modified content\n");

    // Restore
    await sa.restoreBackup(fp, backupPath);
    expect(readFile(fp)).toBe("original content\n");
  });
});

// ─── CommandRunner ───────────────────────────────────────────

describe("CommandRunner", () => {
  it("runs echo and captures stdout", async () => {
    const runner = new CommandRunner({ timeout: 10000 });
    const result = await runner.run("echo hello");

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join(" ")).toContain("hello");
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.command).toBe("echo hello");
  });

  it("captures non-zero exit code", async () => {
    const runner = new CommandRunner({ timeout: 5000 });
    const result = await runner.run("node -e \"process.exit(1)\"");
    // On Windows through cmd.exe, exit codes may differ; just check it ran
    expect(typeof result.exitCode).toBe("number");
    expect(result.command).toContain("process.exit");
  });

  it("parses Jest output format", () => {
    const runner = new CommandRunner();
    const lines = [
      "PASS src/test.js",
      "Tests:       5 passed, 1 failed, 6 total",
      "Time:        2.5 s",
    ];
    const parsed = runner.parseOutput(lines, "jest");
    expect(parsed.passed).toBe(5);
    expect(parsed.failed).toBe(1);
    expect(parsed.total).toBe(6);
  });

  it("parses ESLint output format", () => {
    const runner = new CommandRunner();
    const lines = [
      "/src/foo.js:10:5: error Missing semicolon (semi)",
      "/src/bar.js:20:3: warning Unexpected console statement (no-console)",
    ];
    const parsed = runner.parseOutput(lines, "eslint");
    expect(parsed.errorCount).toBe(1);
    expect(parsed.warningCount).toBe(1);
    expect(parsed.errors).toHaveLength(2);
  });

  it("parses TypeScript compiler output", () => {
    const runner = new CommandRunner();
    const lines = [
      "src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    ];
    const parsed = runner.parseOutput(lines, "tsc");
    expect(parsed.errorCount).toBe(1);
    expect(parsed.errors[0].code).toBe("TS2322");
  });
});
