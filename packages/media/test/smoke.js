#!/usr/bin/env node
/**
 * CodeIn Media Toolkit — Smoke Test
 *
 * Quick validation that all modules load correctly and
 * basic operations work without the Python service running.
 *
 * Usage: node test/smoke.js
 */

"use strict";

const passed = [];
const failed = [];

function test(name, fn) {
  try {
    fn();
    passed.push(name);
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed.push(name);
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed.push(name);
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed.push(name);
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

console.log("");
console.log("╔══════════════════════════════════════════╗");
console.log("║   CodeIn Media Toolkit — Smoke Test      ║");
console.log("╚══════════════════════════════════════════╝");
console.log("");

// ── Module Loading ──────────────────────────────────────
console.log("Module Loading:");

test("hardware.js loads", () => {
  const hw = require("../src/hardware");
  if (!hw.detectHardware) throw new Error("missing detectHardware");
  if (!hw.GpuVendor) throw new Error("missing GpuVendor");
  if (!hw.VramTier) throw new Error("missing VramTier");
});

test("presets.js loads", () => {
  const p = require("../src/presets");
  if (!p.IMAGE_PRESETS) throw new Error("missing IMAGE_PRESETS");
  if (!p.VIDEO_PRESETS) throw new Error("missing VIDEO_PRESETS");
  if (!p.autoSelectImagePreset)
    throw new Error("missing autoSelectImagePreset");
});

test("qualityAdvisor.js loads", () => {
  const q = require("../src/qualityAdvisor");
  if (!q.evaluateRequest) throw new Error("missing evaluateRequest");
  if (!q.AdviceLevel) throw new Error("missing AdviceLevel");
});

test("permissions.js loads", () => {
  const p = require("../src/permissions");
  if (!p.MediaPermission) throw new Error("missing MediaPermission");
  if (!p.createMediaPermissions)
    throw new Error("missing createMediaPermissions");
});

test("client.js loads", () => {
  const c = require("../src/client");
  if (!c.MediaServiceClient) throw new Error("missing MediaServiceClient");
});

test("tools.js loads", () => {
  const t = require("../src/tools");
  if (!t.createMediaTools) throw new Error("missing createMediaTools");
  if (!t.ensureArtifactDir) throw new Error("missing ensureArtifactDir");
});

test("index.js loads (main entry)", () => {
  const m = require("../src/index");
  if (!m.createMediaToolkit) throw new Error("missing createMediaToolkit");
  if (!m.detectHardware) throw new Error("missing detectHardware (re-export)");
  if (!m.MediaServiceClient)
    throw new Error("missing MediaServiceClient (re-export)");
});

// ── Preset Validation ───────────────────────────────────
console.log("");
console.log("Preset Validation:");

test("CPU_FAST preset has correct defaults", () => {
  const { IMAGE_PRESETS, PresetId } = require("../src/presets");
  const p = IMAGE_PRESETS[PresetId.IMG_CPU_FAST];
  if (p.width !== 512) throw new Error(`width=${p.width}, expected 512`);
  if (p.height !== 512) throw new Error(`height=${p.height}, expected 512`);
  if (p.steps > 8) throw new Error(`steps=${p.steps}, expected ≤8`);
});

test("VIDEO presets require GPU", () => {
  const { VIDEO_PRESETS } = require("../src/presets");
  for (const [key, p] of Object.entries(VIDEO_PRESETS)) {
    if (!p.requiresGpu) throw new Error(`${key} should require GPU`);
  }
});

// ── Quality Advisor Logic ───────────────────────────────
console.log("");
console.log("Quality Advisor:");

test("blocks video on CPU", () => {
  const { evaluateRequest, AdviceLevel } = require("../src/qualityAdvisor");
  const { MediaMode } = require("../src/presets");
  const { VramTier } = require("../src/hardware");
  const advice = evaluateRequest({
    type: "video",
    mode: MediaMode.CPU_ONLY,
    width: 576,
    height: 320,
    steps: 0,
    promptHint: "",
    hw: { gpuAvailable: false, vramTier: VramTier.NONE },
  });
  if (!advice.find((a) => a.level === AdviceLevel.BLOCKED)) {
    throw new Error("video on CPU should be blocked");
  }
});

test("warns about photorealistic on CPU", () => {
  const { evaluateRequest, AdviceLevel } = require("../src/qualityAdvisor");
  const { MediaMode } = require("../src/presets");
  const { VramTier } = require("../src/hardware");
  const advice = evaluateRequest({
    type: "image",
    mode: MediaMode.CPU_ONLY,
    width: 512,
    height: 512,
    steps: 4,
    promptHint: "photorealistic portrait of a person",
    hw: { gpuAvailable: false, vramTier: VramTier.NONE },
  });
  if (
    !advice.find(
      (a) => a.level === AdviceLevel.INFO || a.level === AdviceLevel.WARNING,
    )
  ) {
    throw new Error("photorealistic on CPU should produce advice");
  }
});

// ── Hardware Detection ──────────────────────────────────
console.log("");
console.log("Hardware Detection:");

asyncTest("detectHardware runs without errors", async () => {
  const { detectHardware } = require("../src/hardware");
  const hw = await detectHardware();
  if (!hw) throw new Error("null result");
  if (typeof hw.cpuCores !== "number") throw new Error("missing cpuCores");
  if (typeof hw.ramMB !== "number") throw new Error("missing ramMB");
}).then(() => {
  // Summary
  console.log("");
  console.log("────────────────────────────────────────");
  console.log(`  Passed: ${passed.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log("────────────────────────────────────────");
  if (failed.length > 0) {
    console.log("");
    console.log("  Failed tests:");
    failed.forEach((f) => console.log(`    - ${f}`));
    process.exitCode = 1;
  }
});
