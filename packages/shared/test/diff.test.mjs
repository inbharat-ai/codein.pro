import assert from "node:assert/strict";
import test from "node:test";
import { applyUnifiedDiff } from "../src/diff.ts";

test("applyUnifiedDiff applies a simple hunk", () => {
  const original = "line1\nline2\n";
  const diff = "@@ -1,2 +1,2 @@\n-line1\n+line1-updated\n line2";
  const updated = applyUnifiedDiff(original, diff);
  assert.equal(updated, "line1-updated\nline2\n\n");
});

test("applyUnifiedDiff preserves trailing newline", () => {
  const original = "alpha\n";
  const diff = "@@ -1,1 +1,1 @@\n-alpha\n+beta";
  const updated = applyUnifiedDiff(original, diff);
  assert.equal(updated.endsWith("\n"), true);
});
