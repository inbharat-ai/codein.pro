/**
 * Agent activity logging — append-only JSONL activity log.
 * Extracted from index.js.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getDataDir } = require("./store");

function ensureAgentLogDir() {
  const logDir = path.join(getDataDir(), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function appendAgentActivity(entry) {
  const logDir = ensureAgentLogDir();
  const logPath = path.join(logDir, "agent_activity.jsonl");
  const safeEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(logPath, JSON.stringify(safeEntry) + "\n", "utf8");
}

function readAgentActivity(limit = 100) {
  const logDir = ensureAgentLogDir();
  const logPath = path.join(logDir, "agent_activity.jsonl");
  if (!fs.existsSync(logPath)) {
    return [];
  }
  const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  const sliced = lines.slice(-limit);
  return sliced.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
}

module.exports = {
  ensureAgentLogDir,
  appendAgentActivity,
  readAgentActivity,
};
