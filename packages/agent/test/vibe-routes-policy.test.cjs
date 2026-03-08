"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { __test } = require("../src/routes/vibe");

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codin-vibe-"));
}

test("vibe patch apply allows safe replace op", async () => {
  const workspace = makeTempWorkspace();
  const filePath = path.join(workspace, "app.json");
  fs.writeFileSync(filePath, JSON.stringify({ title: "old" }, null, 2), "utf8");

  const result = await __test.applyPatchesToWorkspace(
    [
      {
        filePath: "app.json",
        ops: [{ op: "replace", path: "/title", value: "new" }],
      },
    ],
    workspace,
    null,
  );

  const updated = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(result.length, 1);
  assert.equal(updated.title, "new");
});

test("vibe patch apply rejects unsafe op and preserves file", async () => {
  const workspace = makeTempWorkspace();
  const filePath = path.join(workspace, "config.json");
  fs.writeFileSync(filePath, JSON.stringify({ a: 1 }, null, 2), "utf8");

  await assert.rejects(
    () =>
      __test.applyPatchesToWorkspace(
        [
          {
            filePath: "config.json",
            ops: [{ op: "move", from: "/a", path: "/b" }],
          },
        ],
        workspace,
        null,
      ),
    /not allowed/i,
  );

  const after = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(after.a, 1);
});
