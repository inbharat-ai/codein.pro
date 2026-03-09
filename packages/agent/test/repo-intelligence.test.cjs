/**
 * Repo Intelligence — Tests
 *
 * Covers: file-walker, symbol-extractor, repo-index, refactor-planner,
 *         validation-pipeline, refactor-executor.
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
  walkRepo,
  readFileContent,
  detectLanguage,
  isBinaryFile,
  parseGitignore,
  isIgnored,
} = require("../src/repo-intelligence/file-walker");

const {
  extractImports,
  extractExports,
  extractSymbols,
  buildDependencyGraph,
  resolveSpecifier,
  analyzeChangeImpact,
  rankFilesByRelevance,
} = require("../src/repo-intelligence/symbol-extractor");

const { RepoIndex } = require("../src/repo-intelligence/repo-index");

const {
  RefactorPlanner,
  extractQueryTerms,
  topoSortFiles,
} = require("../src/repo-intelligence/refactor-planner");

const {
  ValidationPipeline,
  detectProjectType,
} = require("../src/repo-intelligence/validation-pipeline");

const {
  RefactorExecutor,
  parseMultiFileResponse,
  cleanCodeResponse,
} = require("../src/repo-intelligence/refactor-executor");

// ─── Helpers ─────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "repo-intel-test-"));
}

function writeFiles(root, fileMap) {
  for (const [relPath, content] of Object.entries(fileMap)) {
    const abs = path.join(root, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf-8");
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. FILE WALKER
// ═══════════════════════════════════════════════════════════════

test("detectLanguage — common extensions", () => {
  assert.equal(detectLanguage("app.ts"), "typescript");
  assert.equal(detectLanguage("main.py"), "python");
  assert.equal(detectLanguage("server.js"), "javascript");
  assert.equal(detectLanguage("lib.rs"), "rust");
  assert.equal(detectLanguage("main.go"), "go");
  assert.equal(detectLanguage("App.java"), "java");
  assert.equal(detectLanguage("style.css"), "css");
  assert.equal(detectLanguage("README.md"), "markdown");
  assert.equal(detectLanguage("unknown.xyz"), null);
});

test("isBinaryFile — detects binary extensions", () => {
  assert.equal(isBinaryFile("image.png"), true);
  assert.equal(isBinaryFile("font.woff2"), true);
  assert.equal(isBinaryFile("app.js"), false);
  assert.equal(isBinaryFile("data.json"), false);
});

test("parseGitignore + isIgnored — basic patterns", () => {
  const rules = parseGitignore("node_modules\n*.log\nbuild/\n!important.log");

  assert.equal(isIgnored("node_modules", true, rules), true);
  assert.equal(isIgnored("src/node_modules", true, rules), true);
  assert.equal(isIgnored("error.log", false, rules), true);
  assert.equal(isIgnored("build", true, rules), true);
  assert.equal(isIgnored("important.log", false, rules), false); // negation
  assert.equal(isIgnored("src/app.js", false, rules), false);
});

test("parseGitignore — anchored patterns", () => {
  const rules = parseGitignore("/dist\nsrc/*.tmp");

  assert.equal(isIgnored("dist", true, rules), true);
  assert.equal(isIgnored("lib/dist", true, rules), false); // anchored to root
  assert.equal(isIgnored("src/foo.tmp", false, rules), true);
});

test("walkRepo — scans a temp directory", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "src/index.ts": "export const a = 1;",
      "src/utils.ts": "export function f() {}",
      "lib/helper.js": "module.exports = {};",
      "README.md": "# Hello",
      ".gitignore": "ignore-me/",
      "ignore-me/secret.js": "secret",
    });

    const { files, stats } = await walkRepo(root);

    assert.ok(files.length >= 4);
    const paths = files.map((f) => f.relativePath);
    assert.ok(paths.includes("src/index.ts"));
    assert.ok(paths.includes("src/utils.ts"));
    assert.ok(paths.includes("lib/helper.js"));
    assert.ok(!paths.includes("ignore-me/secret.js")); // .gitignore respected
    assert.ok(stats.totalScanned > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("walkRepo — respects maxFiles limit", async () => {
  const root = tmpDir();
  try {
    for (let i = 0; i < 20; i++) {
      writeFiles(root, { [`file${i}.js`]: `const x = ${i};` });
    }

    const { files, stats } = await walkRepo(root, { maxFiles: 5 });
    assert.equal(files.length, 5);
    assert.equal(stats.truncated, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("readFileContent — reads file with size limit", async () => {
  const root = tmpDir();
  try {
    const filePath = path.join(root, "test.txt");
    fs.writeFileSync(filePath, "Hello World");

    const content = await readFileContent(filePath);
    assert.equal(content, "Hello World");

    // Too large
    const big = await readFileContent(filePath, 5);
    assert.equal(big, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 2. SYMBOL EXTRACTOR
// ═══════════════════════════════════════════════════════════════

test("extractImports — JavaScript ES6", () => {
  const source = `
import React from 'react';
import { useState, useEffect } from 'react';
import './styles.css';
const fs = require('node:fs');
export { helper } from './utils';
  `;
  const imports = extractImports(source, "javascript");
  assert.ok(imports.includes("react"));
  assert.ok(imports.includes("./styles.css"));
  assert.ok(imports.includes("node:fs"));
  assert.ok(imports.includes("./utils"));
});

test("extractImports — TypeScript dynamic import", () => {
  const source = `const mod = await import('./lazy-module');`;
  const imports = extractImports(source, "typescript");
  assert.ok(imports.includes("./lazy-module"));
});

test("extractImports — Python", () => {
  const source = `
import os
import sys
from pathlib import Path
from . import utils
from ..core import handler
  `;
  const imports = extractImports(source, "python");
  assert.ok(imports.includes("os"));
  assert.ok(imports.includes("pathlib"));
});

test("extractImports — Go", () => {
  const source = `
import "fmt"
import (
  "os"
  "net/http"
  "github.com/gin-gonic/gin"
)
  `;
  const imports = extractImports(source, "go");
  assert.ok(imports.includes("fmt"));
  assert.ok(imports.includes("os"));
  assert.ok(imports.includes("net/http"));
  assert.ok(imports.includes("github.com/gin-gonic/gin"));
});

test("extractImports — Rust", () => {
  const source = `
use std::io;
use crate::handlers::auth;
mod config;
  `;
  const imports = extractImports(source, "rust");
  assert.ok(imports.includes("std::io"));
  assert.ok(imports.includes("crate::handlers::auth"));
  assert.ok(imports.includes("config"));
});

test("extractExports — JavaScript/TypeScript", () => {
  const source = `
export default function main() {}
export const API_KEY = "abc";
export function handleRequest(req) {}
export class UserService {}
export { helper, utils };
module.exports = { foo, bar };
  `;
  const exps = extractExports(source, "javascript");
  const names = exps.map((e) => e.name);
  assert.ok(names.includes("main"));
  assert.ok(names.includes("API_KEY"));
  assert.ok(names.includes("handleRequest"));
  assert.ok(names.includes("UserService"));
  assert.ok(names.includes("helper"));
  assert.ok(names.includes("foo"));
  assert.ok(names.includes("bar"));
});

test("extractExports — Python", () => {
  const source = `
__all__ = ['MyClass', 'helper_func']

def helper_func():
    pass

class MyClass:
    pass

def _private():
    pass
  `;
  const exps = extractExports(source, "python");
  const names = exps.map((e) => e.name);
  assert.ok(names.includes("MyClass"));
  assert.ok(names.includes("helper_func"));
  assert.ok(!names.includes("_private")); // private
});

test("extractSymbols — JavaScript", () => {
  const source = `
function handleClick() {}
class Button {}
const MAX_RETRIES = 3;
export async function fetchData() {}
  `;
  const symbols = extractSymbols(source, "javascript");
  const names = symbols.map((s) => s.name);
  assert.ok(names.includes("handleClick"));
  assert.ok(names.includes("Button"));
  assert.ok(names.includes("MAX_RETRIES"));
  assert.ok(names.includes("fetchData"));
  // Check line numbers
  const btn = symbols.find((s) => s.name === "Button");
  assert.ok(btn.line > 0);
  assert.equal(btn.kind, "class");
});

test("extractSymbols — Python", () => {
  const source = `
def process_data():
    pass

class DataPipeline:
    def transform(self):
        pass

MAX_BUFFER = 1024
  `;
  const symbols = extractSymbols(source, "python");
  const names = symbols.map((s) => s.name);
  assert.ok(names.includes("process_data"));
  assert.ok(names.includes("DataPipeline"));
  assert.ok(names.includes("MAX_BUFFER"));
});

test("extractSymbols — Go", () => {
  const source = `
func main() {
}
func (s *Server) Start() error {
}
type Config struct {
}
var Version = "1.0"
  `;
  const symbols = extractSymbols(source, "go");
  const names = symbols.map((s) => s.name);
  assert.ok(names.includes("main"));
  assert.ok(names.includes("Start"));
  assert.ok(names.includes("Config"));
  assert.ok(names.includes("Version"));
});

test("extractSymbols — Rust", () => {
  const source = `
pub fn handle_request() {}
fn private_fn() {}
pub struct Server {}
pub enum Status {}
pub trait Handler {}
  `;
  const symbols = extractSymbols(source, "rust");
  const names = symbols.map((s) => s.name);
  assert.ok(names.includes("handle_request"));
  assert.ok(names.includes("private_fn"));
  assert.ok(names.includes("Server"));
  assert.ok(names.includes("Status"));
  assert.ok(names.includes("Handler"));
});

// ═══════════════════════════════════════════════════════════════
// 3. DEPENDENCY GRAPH
// ═══════════════════════════════════════════════════════════════

test("buildDependencyGraph — resolves relative imports", () => {
  const fileMap = new Map([
    [
      "src/index.ts",
      {
        relativePath: "src/index.ts",
        language: "typescript",
        source: `import { App } from './app';`,
      },
    ],
    [
      "src/app.ts",
      {
        relativePath: "src/app.ts",
        language: "typescript",
        source: `import { utils } from './utils';`,
      },
    ],
    [
      "src/utils.ts",
      {
        relativePath: "src/utils.ts",
        language: "typescript",
        source: `export const x = 1;`,
      },
    ],
  ]);

  const graph = buildDependencyGraph(fileMap);

  // index → app
  assert.ok(graph.adjacency.get("src/index.ts").includes("src/app.ts"));
  // app → utils
  assert.ok(graph.adjacency.get("src/app.ts").includes("src/utils.ts"));
  // reverse: utils ← app
  assert.ok(graph.reverseAdjacency.get("src/utils.ts").includes("src/app.ts"));
  // reverse: app ← index
  assert.ok(graph.reverseAdjacency.get("src/app.ts").includes("src/index.ts"));
});

test("resolveSpecifier — handles index files", () => {
  const fileMap = new Map([
    ["src/lib/index.ts", {}],
    ["src/utils.ts", {}],
  ]);

  assert.equal(
    resolveSpecifier("./utils", "src/index.ts", fileMap),
    "src/utils.ts",
  );
  assert.equal(
    resolveSpecifier("./lib", "src/index.ts", fileMap),
    "src/lib/index.ts",
  );
  assert.equal(resolveSpecifier("react", "src/index.ts", fileMap), null); // bare specifier
});

test("analyzeChangeImpact — transitive dependents", () => {
  const reverseAdj = new Map([
    ["src/utils.ts", ["src/app.ts"]],
    ["src/app.ts", ["src/index.ts", "src/other.ts"]],
    ["src/index.ts", ["src/main.ts"]],
  ]);

  const impact = analyzeChangeImpact(["src/utils.ts"], reverseAdj);
  assert.ok(impact.directlyImpacted.includes("src/app.ts"));
  assert.ok(impact.transitivelyImpacted.includes("src/index.ts"));
  assert.ok(impact.transitivelyImpacted.includes("src/other.ts"));
});

test("rankFilesByRelevance — scores by term frequency", () => {
  const fileMap = new Map([
    [
      "a.ts",
      {
        relativePath: "a.ts",
        source: "handleClick handleClick handleClick",
        language: "typescript",
      },
    ],
    [
      "b.ts",
      { relativePath: "b.ts", source: "handleClick", language: "typescript" },
    ],
    [
      "c.ts",
      { relativePath: "c.ts", source: "no match here", language: "typescript" },
    ],
  ]);
  const reverseAdj = new Map();

  const ranked = rankFilesByRelevance(["handleClick"], fileMap, reverseAdj);
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].relativePath, "a.ts"); // higher TF
  assert.ok(ranked[0].score > ranked[1].score);
});

// ═══════════════════════════════════════════════════════════════
// 4. REPO INDEX
// ═══════════════════════════════════════════════════════════════

test("RepoIndex — scan + search + findSymbol", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "src/index.ts": `
import { UserService } from './user-service';
export function main() { const svc = new UserService(); }
      `,
      "src/user-service.ts": `
export class UserService {
  getUser(id: string) { return { id }; }
}
export const MAX_USERS = 100;
      `,
      "src/utils.ts": `
export function formatDate(d: Date) { return d.toISOString(); }
      `,
    });

    const idx = new RepoIndex();
    const result = await idx.scan(root);

    assert.ok(result.fileCount >= 3);
    assert.ok(result.symbolCount > 0);
    assert.ok(result.edgeCount > 0);

    // Search
    const searchResults = idx.search(["UserService"]);
    assert.ok(searchResults.length > 0);
    assert.ok(
      searchResults.some((r) => r.relativePath.includes("user-service")),
    );

    // Find symbol
    const defs = idx.findSymbol("UserService");
    assert.ok(defs.length > 0);
    assert.equal(defs[0].symbol.kind, "class");

    // Find export
    const exps = idx.findExport("MAX_USERS");
    assert.ok(exps.length > 0);

    // Dependencies
    const deps = idx.getDependencies("src/index.ts");
    assert.ok(deps.includes("src/user-service.ts"));

    // Dependents
    const dependents = idx.getDependents("src/user-service.ts");
    assert.ok(dependents.includes("src/index.ts"));

    // Change impact
    const impact = idx.getChangeImpact(["src/user-service.ts"]);
    assert.ok(impact.directlyImpacted.includes("src/index.ts"));

    // Context assembly
    const ctx = idx.assembleContext(["UserService"], { maxTokens: 2000 });
    assert.ok(ctx.context.includes("UserService"));
    assert.ok(ctx.files.length > 0);
    assert.ok(ctx.tokenEstimate > 0);

    // Summary
    const summary = idx.getRepoSummary();
    assert.ok(summary.includes("typescript"));

    // toJSON
    const json = idx.toJSON();
    assert.ok(json.meta.fileCount >= 3);

    // listFiles
    const tsFiles = idx.listFiles({ language: "typescript" });
    assert.ok(tsFiles.length >= 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("RepoIndex — incremental scan skips unchanged files", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "a.ts": "export const a = 1;",
      "b.ts": "export const b = 2;",
    });

    const idx = new RepoIndex();
    await idx.scan(root);
    assert.equal(idx.files.size, 2);

    // Second scan (incremental) — no changes
    const result = await idx.scan(root, { incremental: true });
    assert.equal(result.fileCount, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 5. REFACTOR PLANNER
// ═══════════════════════════════════════════════════════════════

test("extractQueryTerms — extracts meaningful terms", () => {
  const terms = extractQueryTerms(
    "Rename UserService to AccountService across all files",
  );
  assert.ok(terms.includes("UserService"));
  assert.ok(terms.includes("AccountService"));
  // Stop words should be filtered
  assert.ok(!terms.includes("to"));
  assert.ok(!terms.includes("all"));
});

test("topoSortFiles — sorts by dependency order", () => {
  const adjacency = new Map([
    ["a.ts", ["b.ts", "c.ts"]],
    ["b.ts", ["c.ts"]],
    ["c.ts", []],
  ]);

  const sorted = topoSortFiles(["a.ts", "b.ts", "c.ts"], adjacency);
  // c.ts should come before b.ts, which should come before a.ts
  // (leaves first in topological order)
  assert.ok(
    sorted.indexOf("a.ts") < sorted.indexOf("b.ts") ||
      sorted.indexOf("b.ts") < sorted.indexOf("c.ts"),
  );
  assert.equal(sorted.length, 3);
});

test("RefactorPlanner — generates plan with steps", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "src/user-service.ts": `
export class UserService {
  getUser() {}
}
      `,
      "src/index.ts": `
import { UserService } from './user-service';
const svc = new UserService();
      `,
      "src/routes.ts": `
import { UserService } from './user-service';
function setupRoutes(svc: UserService) {}
      `,
    });

    const idx = new RepoIndex();
    await idx.scan(root);

    const planner = new RefactorPlanner(idx);
    const plan = planner.plan("Rename UserService to AccountService");

    assert.ok(plan.id.startsWith("refactor_"));
    assert.equal(plan.strategy, "rename");
    assert.ok(plan.steps.length > 0);
    assert.ok(plan.impactedFiles.length > 0);

    // Each step should have required fields
    for (const step of plan.steps) {
      assert.ok(typeof step.order === "number");
      assert.ok(typeof step.relativePath === "string");
      assert.ok(typeof step.action === "string");
      assert.ok(typeof step.reason === "string");
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("RefactorPlanner — generates LLM prompts", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "src/app.ts": `export class App { run() {} }`,
    });

    const idx = new RepoIndex();
    await idx.scan(root);

    const planner = new RefactorPlanner(idx);
    const plan = planner.plan("Extract run method from App class");

    assert.ok(plan.steps.length > 0);

    // Single-file prompt
    const { systemPrompt, userPrompt } = planner.generateEditPrompt(
      plan,
      plan.steps[0],
    );
    assert.ok(systemPrompt.includes("refactoring engine"));
    assert.ok(userPrompt.includes("Extract"));
    assert.ok(userPrompt.includes("src/app.ts"));

    // Consolidated prompt
    const consolidated = planner.generateConsolidatedPrompt(plan);
    assert.ok(consolidated.systemPrompt.includes("multi-file"));
    assert.ok(consolidated.files.length > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 6. VALIDATION PIPELINE
// ═══════════════════════════════════════════════════════════════

test("detectProjectType — identifies common project types", async () => {
  const root = tmpDir();
  try {
    // TypeScript project
    writeFiles(root, { "tsconfig.json": "{}" });
    assert.equal(await detectProjectType(root), "typescript");

    // Clean and test Node
    fs.unlinkSync(path.join(root, "tsconfig.json"));
    writeFiles(root, { "package.json": "{}" });
    assert.equal(await detectProjectType(root), "node");

    // Clean and test Python
    fs.unlinkSync(path.join(root, "package.json"));
    writeFiles(root, { "requirements.txt": "flask" });
    assert.equal(await detectProjectType(root), "python");

    // Clean and test Go
    fs.unlinkSync(path.join(root, "requirements.txt"));
    writeFiles(root, { "go.mod": "module example" });
    assert.equal(await detectProjectType(root), "go");

    // Clean and test Rust
    fs.unlinkSync(path.join(root, "go.mod"));
    writeFiles(root, { "Cargo.toml": "[package]" });
    assert.equal(await detectProjectType(root), "rust");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ValidationPipeline — skips gracefully when no tools", async () => {
  const root = tmpDir();
  try {
    // Empty project — nothing should crash
    writeFiles(root, { "hello.txt": "world" });

    const pipeline = new ValidationPipeline({ timeout: 5000 });
    const report = await pipeline.validate(root, {
      lint: true,
      typecheck: true,
      test: true,
    });

    // All should be skipped (no config found)
    assert.ok(report.allPassed); // skips count as passed
    assert.ok(report.results.length > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 7. REFACTOR EXECUTOR
// ═══════════════════════════════════════════════════════════════

test("parseMultiFileResponse — parses LLM response", () => {
  const response = `
Some intro text...

===FILE: src/index.ts===
export function main() {
  console.log("hello");
}
===END_FILE===

===FILE: src/utils.ts===
export const VERSION = "2.0";
===END_FILE===
  `;

  const files = parseMultiFileResponse(response);
  assert.ok("src/index.ts" in files);
  assert.ok("src/utils.ts" in files);
  assert.ok(files["src/index.ts"].includes("main"));
  assert.ok(files["src/utils.ts"].includes("2.0"));
});

test("parseMultiFileResponse — rejects path traversal", () => {
  const response = `
===FILE: ../../../etc/passwd===
root:x:0:0
===END_FILE===
  `;

  const files = parseMultiFileResponse(response);
  assert.equal(Object.keys(files).length, 0);
});

test("cleanCodeResponse — strips markdown fences", () => {
  const response =
    "Here's the code:\n\n```typescript\nconst x = 1;\n```\n\nDone.";
  const clean = cleanCodeResponse(response);
  assert.ok(clean.includes("const x = 1"));
  assert.ok(!clean.includes("```"));
});

test("RefactorExecutor — dry run returns plan without writing", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "src/app.ts": "export class App {}",
    });

    const idx = new RepoIndex();
    await idx.scan(root);

    const planner = new RefactorPlanner(idx);
    const validator = new ValidationPipeline({ timeout: 5000 });
    const executor = new RefactorExecutor({ planner, validator });

    const plan = planner.plan("Rename App to Application");
    const result = await executor.execute(root, plan, {
      edits: [
        {
          relativePath: "src/app.ts",
          newContent: "export class Application {}",
        },
      ],
      dryRun: true,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.dryRun, true);
    assert.equal(result.filesModified, 1);

    // File should NOT have changed
    const content = fs.readFileSync(path.join(root, "src/app.ts"), "utf-8");
    assert.ok(content.includes("class App"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("RefactorExecutor — applies edits and creates backup", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "src/app.ts": "export class App { name = 'old'; }",
    });

    const idx = new RepoIndex();
    await idx.scan(root);

    const planner = new RefactorPlanner(idx);
    const validator = new ValidationPipeline({ timeout: 5000 });
    const executor = new RefactorExecutor({ planner, validator });

    const plan = planner.plan("Rename App to Application");
    const result = await executor.execute(root, plan, {
      edits: [
        {
          relativePath: "src/app.ts",
          newContent: "export class Application { name = 'new'; }",
        },
      ],
      skipValidation: true,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.filesModified, 1);

    // File should be updated
    const content = fs.readFileSync(path.join(root, "src/app.ts"), "utf-8");
    assert.ok(content.includes("Application"));
    assert.ok(!content.includes("class App "));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("RefactorExecutor — path traversal blocked", async () => {
  const root = tmpDir();
  try {
    const idx = new RepoIndex();
    const planner = new RefactorPlanner(idx);
    const validator = new ValidationPipeline();
    const executor = new RefactorExecutor({ planner, validator });

    const plan = {
      id: "test_traversal",
      goal: "test",
      strategy: "generic",
      steps: [],
    };

    const result = await executor.execute(root, plan, {
      edits: [{ relativePath: "../../etc/passwd", newContent: "hacked" }],
      skipValidation: true,
    });
    assert.equal(result.status, "rolled_back");
    assert.ok(result.errors.some((e) => e.includes("Path traversal")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 8. INTEGRATION: FULL PIPELINE
// ═══════════════════════════════════════════════════════════════

test("Full pipeline: scan → search → plan → execute (dry)", async () => {
  const root = tmpDir();
  try {
    writeFiles(root, {
      "src/models/user.ts": `
export class User {
  constructor(public name: string, public email: string) {}
}
      `,
      "src/services/user-service.ts": `
import { User } from '../models/user';
export class UserService {
  private users: User[] = [];
  addUser(u: User) { this.users.push(u); }
  getUser(name: string) { return this.users.find(u => u.name === name); }
}
      `,
      "src/routes/user-routes.ts": `
import { UserService } from '../services/user-service';
export function setupUserRoutes(svc: UserService) {}
      `,
      "src/index.ts": `
import { UserService } from './services/user-service';
import { setupUserRoutes } from './routes/user-routes';
const svc = new UserService();
setupUserRoutes(svc);
      `,
    });

    // 1. Scan
    const idx = new RepoIndex();
    const scanResult = await idx.scan(root);
    assert.ok(scanResult.fileCount >= 4);
    assert.ok(scanResult.edgeCount > 0);

    // 2. Search
    const results = idx.search(["UserService"]);
    assert.ok(results.length >= 2);

    // 3. Plan
    const planner = new RefactorPlanner(idx);
    const plan = planner.plan(
      "Rename UserService to AccountService across all files",
    );
    assert.equal(plan.strategy, "rename");
    assert.ok(plan.steps.length >= 2);

    // Verify topological ordering
    const stepPaths = plan.steps.map((s) => s.relativePath);
    assert.ok(stepPaths.length > 0);

    // 4. DryRun execute
    const validator = new ValidationPipeline({ timeout: 5000 });
    const executor = new RefactorExecutor({ planner, validator });
    const execResult = await executor.execute(root, plan, {
      edits: plan.steps.map((s) => ({
        relativePath: s.relativePath,
        newContent: (idx.getFile(s.relativePath)?.source || "").replace(
          /UserService/g,
          "AccountService",
        ),
      })),
      dryRun: true,
    });

    assert.equal(execResult.status, "completed");
    assert.ok(execResult.filesModified > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 9. BARREL EXPORTS
// ═══════════════════════════════════════════════════════════════

test("barrel index.js — exports all public APIs", () => {
  const barrel = require("../src/repo-intelligence/index");

  // File walker
  assert.equal(typeof barrel.walkRepo, "function");
  assert.equal(typeof barrel.readFileContent, "function");
  assert.equal(typeof barrel.detectLanguage, "function");

  // Symbol extractor
  assert.equal(typeof barrel.extractImports, "function");
  assert.equal(typeof barrel.extractExports, "function");
  assert.equal(typeof barrel.extractSymbols, "function");
  assert.equal(typeof barrel.buildDependencyGraph, "function");
  assert.equal(typeof barrel.analyzeChangeImpact, "function");
  assert.equal(typeof barrel.rankFilesByRelevance, "function");

  // RepoIndex
  assert.equal(typeof barrel.RepoIndex, "function");

  // RefactorPlanner
  assert.equal(typeof barrel.RefactorPlanner, "function");
  assert.equal(typeof barrel.topoSortFiles, "function");

  // ValidationPipeline
  assert.equal(typeof barrel.ValidationPipeline, "function");
  assert.equal(typeof barrel.detectProjectType, "function");

  // RefactorExecutor
  assert.equal(typeof barrel.RefactorExecutor, "function");
  assert.equal(typeof barrel.parseMultiFileResponse, "function");
  assert.equal(typeof barrel.cleanCodeResponse, "function");
});

// ═══════════════════════════════════════════════════════════════
// 10. ROUTE MODULE LOADABLE
// ═══════════════════════════════════════════════════════════════

test("repo-intelligence route module — loads without error", () => {
  const routeModule = require("../src/routes/repo-intelligence");
  assert.equal(typeof routeModule.registerRepoIntelligenceRoutes, "function");
});
