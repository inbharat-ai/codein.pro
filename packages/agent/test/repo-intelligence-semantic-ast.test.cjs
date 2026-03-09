"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { RepoIndex } = require("../src/repo-intelligence/repo-index");
const { EmbeddingIndex } = require("../src/repo-intelligence/embedding-index");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "repo-intel-ast-sem-"));
}

function writeFiles(root, fileMap) {
  for (const [relPath, content] of Object.entries(fileMap)) {
    const abs = path.join(root, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
}

test("EmbeddingIndex returns semantically related entries", () => {
  const idx = new EmbeddingIndex({ dimensions: 128 });
  idx.upsert("auth.ts", "login authentication token refresh session");
  idx.upsert("ui.tsx", "button theme style spacing typography");

  const results = idx.search("implement login with session token", 5);
  assert.ok(results.length > 0);
  assert.equal(results[0].id, "auth.ts");
});

test("RepoIndex hybrid search includes semantic matches", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "src/security/auth.ts":
        "export function signIn(user, pass) { return createSession(user); }",
      "src/ui/button.ts": "export function Button() { return null; }",
    });

    const repoIndex = new RepoIndex();
    await repoIndex.scan(root);

    const results = repoIndex.hybridSearch(["login", "session", "token"], {
      topK: 5,
      lexicalWeight: 0.3,
      semanticWeight: 0.7,
    });

    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.relativePath.endsWith("auth.ts")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("RepoIndex builds AST graph and callers when TypeScript API is available", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "src/lib.ts": [
        "export function createSession(user) {",
        "  return { user };",
        "}",
      ].join("\n"),
      "src/auth.ts": [
        "import { createSession } from './lib';",
        "export function signIn(user) {",
        "  return createSession(user);",
        "}",
      ].join("\n"),
    });

    const repoIndex = new RepoIndex();
    await repoIndex.scan(root);

    // Always verify graceful shape.
    assert.equal(typeof repoIndex.astGraph.enabled, "boolean");
    assert.ok(Array.isArray(repoIndex.astGraph.symbolNodes));
    assert.ok(Array.isArray(repoIndex.astGraph.callEdges));

    if (repoIndex.astGraph.enabled) {
      const callers = repoIndex.getCallers("createSession");
      assert.ok(callers.length > 0);
      assert.ok(callers.some((c) => c.file.endsWith("auth.ts")));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
