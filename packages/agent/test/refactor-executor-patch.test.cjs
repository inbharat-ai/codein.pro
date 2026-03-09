"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyUnifiedPatchToText,
  applyUnifiedPatchWithFallback,
} = require("../src/repo-intelligence/refactor-executor");

test("applyUnifiedPatchToText applies a basic hunk", () => {
  const original = ["export function sum(a, b) {", "  return a + b;", "}"].join(
    "\n",
  );

  const patch = [
    "@@ -1,3 +1,3 @@",
    " export function sum(a, b) {",
    "-  return a + b;",
    "+  return Number(a) + Number(b);",
    " }",
  ].join("\n");

  const next = applyUnifiedPatchToText(original, patch);
  assert.ok(next.includes("Number(a) + Number(b)"));
  assert.ok(!next.includes("return a + b;"));
});

test("applyUnifiedPatchToText throws on conflict", () => {
  const original = ["line1", "line2", "line3"].join("\n");
  const patch = ["@@ -2,1 +2,1 @@", "-lineX", "+line2-updated"].join("\n");

  assert.throws(
    () => applyUnifiedPatchToText(original, patch),
    /Patch conflict/,
  );
});

test("applyUnifiedPatchWithFallback applies semantic replacement on whitespace drift", () => {
  const original = ["export function sum(a, b) {", "\treturn a + b;", "}"].join(
    "\n",
  );

  const patch = [
    "@@ -1,3 +1,3 @@",
    " export function sum(a, b) {",
    "-  return a+b;",
    "+  return Number(a) + Number(b);",
    " }",
  ].join("\n");

  const next = applyUnifiedPatchWithFallback(original, patch);
  assert.match(next, /Number\(a\) \+ Number\(b\)/);
});
