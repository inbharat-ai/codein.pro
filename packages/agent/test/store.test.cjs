const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ensureDirs,
  loadStore,
  saveStore,
  getStorePath,
} = require("../src/store");

test("model store persists models", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bharat-agent-"));
  t.after(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  ensureDirs(dataDir);
  const empty = loadStore(dataDir);
  assert.equal(empty.models.length, 0);

  const updated = {
    models: [{ id: "m1", name: "Local", path: "/tmp/model.bin", role: "coder" }],
    active: { coder: "m1", reasoner: null },
  };
  saveStore(updated, dataDir);

  const reloaded = loadStore(dataDir);
  assert.equal(reloaded.models.length, 1);
  assert.equal(reloaded.active.coder, "m1");
  assert.equal(fs.existsSync(getStorePath(dataDir)), true);
});
