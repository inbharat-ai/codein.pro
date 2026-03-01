const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function getDataDir() {
  return process.env.CODIN_AGENT_DATA_DIR || path.join(os.homedir(), ".codin");
}

function getModelsDir(dataDir) {
  return path.join(dataDir, "models");
}

function getStorePath(dataDir) {
  return path.join(dataDir, "model-store.json");
}

function ensureDirs(dataDir = getDataDir()) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(getModelsDir(dataDir), { recursive: true });
}

function loadStore(dataDir = getDataDir()) {
  ensureDirs(dataDir);
  const storePath = getStorePath(dataDir);
  if (!fs.existsSync(storePath)) {
    return {
      models: [],
      active: { coder: null, reasoner: null },
    };
  }
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return {
      models: [],
      active: { coder: null, reasoner: null },
    };
  }
}

function saveStore(store, dataDir = getDataDir()) {
  ensureDirs(dataDir);
  const storePath = getStorePath(dataDir);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

module.exports = {
  ensureDirs,
  getDataDir,
  getModelsDir,
  getStorePath,
  loadStore,
  saveStore,
};
