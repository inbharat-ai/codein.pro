const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readSource(relativePath) {
  const absolutePath = path.resolve(__dirname, "..", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

test("Runtime source includes LLAMA_PATH fail-closed override checks", () => {
  const source = readSource("src/model-runtime/index.js");

  assert.match(source, /const configuredRuntimePath = process\.env\.LLAMA_PATH/);
  assert.match(source, /LLAMA_PATH is set but executable was not found/);
  assert.match(source, /Using configured runtime/);
});

test("Runtime source includes auto-provision guard and localhost-only bind", () => {
  const source = readSource("src/model-runtime/index.js");

  assert.match(source, /DISABLE_LLAMA_AUTO_PROVISION/);
  assert.match(source, /llama\.cpp runtime not found locally and DISABLE_LLAMA_AUTO_PROVISION is enabled/);
  assert.match(source, /"--host"\s*,\s*"127\.0\.0\.1"/);
});

test("Electron agent service includes bundled llama detection and LLAMA_PATH handoff", () => {
  const source = readSource("../../electron-app/src/main/services/AgentService.ts");

  assert.match(source, /getBundledLlamaPath\(\): string \| null/);
  assert.match(source, /path\.join\(process\.resourcesPath, 'llama', platform, executableName\)/);
  assert.match(source, /env\.LLAMA_PATH = bundledLlamaPath/);
});
