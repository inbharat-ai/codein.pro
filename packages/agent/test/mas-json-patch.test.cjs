/**
 * MAS — JSON Patch Tests
 *
 * Covers RFC 6902 operations, validation, auto-repair, pointer parsing.
 */
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  validatePatchOp,
  validatePatch,
  parsePointer,
  getAtPath,
  setAtPath,
  removeAtPath,
  applyOp,
  applyPatch,
  repairPatch,
  VALID_OPS,
} = require("../src/mas/json-patch");

// ── VALID_OPS ──

test("VALID_OPS contains all RFC 6902 operations", () => {
  assert.ok(VALID_OPS.has("add"));
  assert.ok(VALID_OPS.has("remove"));
  assert.ok(VALID_OPS.has("replace"));
  assert.ok(VALID_OPS.has("move"));
  assert.ok(VALID_OPS.has("copy"));
  assert.ok(VALID_OPS.has("test"));
});

// ── Pointer Parsing ──

test("parsePointer handles root", () => {
  assert.deepEqual(parsePointer(""), []);
});

test("parsePointer handles simple path", () => {
  assert.deepEqual(parsePointer("/foo/bar"), ["foo", "bar"]);
});

test("parsePointer handles escaped chars", () => {
  const segments = parsePointer("/a~1b/c~0d");
  assert.deepEqual(segments, ["a/b", "c~d"]);
});

test("parsePointer handles numeric indices", () => {
  assert.deepEqual(parsePointer("/items/0"), ["items", "0"]);
});

// ── getAtPath / setAtPath / removeAtPath ──

test("getAtPath traverses objects", () => {
  const doc = { a: { b: { c: 42 } } };
  assert.equal(getAtPath(doc, ["a", "b", "c"]), 42);
});

test("getAtPath traverses arrays", () => {
  const doc = { items: [10, 20, 30] };
  assert.equal(getAtPath(doc, ["items", "1"]), 20);
});

test("getAtPath returns undefined for missing path", () => {
  assert.equal(getAtPath({ a: 1 }, ["b"]), undefined);
});

test("setAtPath sets nested value", () => {
  const doc = { a: { b: 1 } };
  setAtPath(doc, ["a", "b"], 2);
  assert.equal(doc.a.b, 2);
});

test("removeAtPath removes key", () => {
  const doc = { a: 1, b: 2 };
  removeAtPath(doc, ["b"]);
  assert.equal(doc.b, undefined);
  assert.equal(doc.a, 1);
});

// ── validatePatchOp ──

test("validatePatchOp accepts valid add", () => {
  const result = validatePatchOp({ op: "add", path: "/foo", value: 42 });
  assert.equal(result.valid, true);
});

test("validatePatchOp rejects missing op", () => {
  const result = validatePatchOp({ path: "/foo", value: 1 });
  assert.equal(result.valid, false);
});

test("validatePatchOp rejects invalid op", () => {
  const result = validatePatchOp({ op: "destroy", path: "/foo" });
  assert.equal(result.valid, false);
});

test("validatePatchOp rejects add without value", () => {
  const result = validatePatchOp({ op: "add", path: "/foo" });
  assert.equal(result.valid, false);
});

test("validatePatchOp rejects move without from", () => {
  const result = validatePatchOp({ op: "move", path: "/foo" });
  assert.equal(result.valid, false);
});

// ── validatePatch ──

test("validatePatch rejects non-array", () => {
  const result = validatePatch("not-an-array");
  assert.equal(result.valid, false);
});

test("validatePatch accepts valid patch array", () => {
  const result = validatePatch([
    { op: "add", path: "/x", value: 1 },
    { op: "remove", path: "/y" },
  ]);
  assert.equal(result.valid, true);
});

// ── applyPatch ──

test("applyPatch add to object", () => {
  const doc = { a: 1 };
  const result = applyPatch(doc, [{ op: "add", path: "/b", value: 2 }]);
  assert.equal(result.success, true);
  assert.equal(result.result.b, 2);
  assert.equal(result.result.a, 1);
});

test("applyPatch remove from object", () => {
  const doc = { a: 1, b: 2 };
  const result = applyPatch(doc, [{ op: "remove", path: "/b" }]);
  assert.equal(result.success, true);
  assert.equal(result.result.b, undefined);
});

test("applyPatch replace value", () => {
  const doc = { a: 1 };
  const result = applyPatch(doc, [{ op: "replace", path: "/a", value: 99 }]);
  assert.equal(result.success, true);
  assert.equal(result.result.a, 99);
});

test("applyPatch copy value", () => {
  const doc = { a: 1 };
  const result = applyPatch(doc, [{ op: "copy", from: "/a", path: "/b" }]);
  assert.equal(result.success, true);
  assert.equal(result.result.b, 1);
});

test("applyPatch move value", () => {
  const doc = { a: 1 };
  const result = applyPatch(doc, [{ op: "move", from: "/a", path: "/b" }]);
  assert.equal(result.success, true);
  assert.equal(result.result.b, 1);
  assert.equal(result.result.a, undefined);
});

test("applyPatch test succeeds on match", () => {
  const doc = { a: 42 };
  const result = applyPatch(doc, [{ op: "test", path: "/a", value: 42 }]);
  assert.equal(result.success, true);
});

test("applyPatch test fails on mismatch", () => {
  const doc = { a: 42 };
  const result = applyPatch(doc, [{ op: "test", path: "/a", value: 99 }]);
  assert.equal(result.success, false);
});

test("applyPatch does not mutate original document", () => {
  const doc = { a: 1, b: 2 };
  applyPatch(doc, [{ op: "replace", path: "/a", value: 99 }]);
  assert.equal(doc.a, 1); // original untouched
});

test("applyPatch nested operations", () => {
  const doc = { config: { debug: false, port: 3000 } };
  const result = applyPatch(doc, [
    { op: "replace", path: "/config/debug", value: true },
    { op: "add", path: "/config/host", value: "localhost" },
  ]);
  assert.equal(result.success, true);
  assert.equal(result.result.config.debug, true);
  assert.equal(result.result.config.host, "localhost");
  assert.equal(result.result.config.port, 3000);
});

// ── repairPatch ──

test("repairPatch adds missing leading slash", () => {
  const patch = [{ op: "add", path: "foo", value: 1 }];
  const result = repairPatch(patch);
  assert.equal(result.repaired, true);
  assert.equal(result.patches[0].path, "/foo");
});

test("repairPatch fixes 'set' to 'replace'", () => {
  const patch = [{ op: "set", path: "/foo", value: 1 }];
  const result = repairPatch(patch);
  assert.equal(result.repaired, true);
  assert.equal(result.patches[0].op, "replace");
});

test("repairPatch fixes 'del' to 'remove'", () => {
  const patch = [{ op: "del", path: "/foo" }];
  const result = repairPatch(patch);
  assert.equal(result.repaired, true);
  assert.equal(result.patches[0].op, "remove");
});

test("repairPatch fixes 'insert' to 'add'", () => {
  const patch = [{ op: "insert", path: "/foo", value: 1 }];
  const result = repairPatch(patch);
  assert.equal(result.repaired, true);
  assert.equal(result.patches[0].op, "add");
});
