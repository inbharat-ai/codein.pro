import assert from "node:assert/strict";
import test from "node:test";
import { validateEditContract } from "../src/index.ts";

test("validateEditContract accepts valid payload", () => {
  const payload = {
    plan: ["Step 1"],
    patches: [{ path: "src/app.ts", diff: "@@ -1,1 +1,1 @@\n-foo\n+bar" }],
    new_files: [{ path: "README.md", content: "Hello" }],
    run_instructions: "npm test",
    explanation_user_language: "Done",
  };

  const result = validateEditContract(JSON.stringify(payload));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, payload);
});

test("validateEditContract repairs JSON wrapped in text", () => {
  const raw = "Note: response follows {\"plan\":[\"x\"],\"patches\":[],\"new_files\":[],\"run_instructions\":\"\",\"explanation_user_language\":\"ok\"} end";
  const result = validateEditContract(raw);
  assert.equal(result.ok, true);
  assert.equal(result.repaired, true);
});
