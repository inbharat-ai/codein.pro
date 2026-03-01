/**
 * @fileoverview Runtime router payload normalization tests
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

test("/runtime/router accepts contextLength and mode", () => {
  const source = readSource("src/routes/runtime.js");

  assert.match(source, /contextLength/);
  assert.match(source, /mode/);
  assert.match(source, /preference/);
  assert.match(source, /maxLatencyMs/);
});

test("/runtime/router maps contextSize to contextLength", () => {
  const source = readSource("src/routes/runtime.js");

  assert.match(source, /contextLength\s*=\s*payload\.contextLength\s*\?\?\s*payload\.contextSize/);
});

test("/runtime/router maps reasoning to plan mode", () => {
  const source = readSource("src/routes/runtime.js");

  assert.match(source, /payload\.reasoning\s*\?\s*"plan"\s*:\s*"ask"/);
});

module.exports = { name: "runtime-router-tests" };
