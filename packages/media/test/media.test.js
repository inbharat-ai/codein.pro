/**
 * CodeIn Media Toolkit — Unit Tests
 *
 * Tests cover:
 * - Hardware detection (mocked)
 * - Presets & auto-routing
 * - Quality advisor
 * - Permissions (fail-closed)
 * - Path traversal prevention
 * - Tool adapter validation
 */

"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const os = require("os");
const fs = require("fs");

// ── Hardware Tests ──────────────────────────────────────
const {
  GpuVendor,
  VramTier,
  detectHardware,
  summarizeHardware,
} = require("../src/hardware");

describe("Hardware Detection", () => {
  it("detectHardware returns a valid profile", async () => {
    const hw = await detectHardware();
    assert.ok(hw, "should return a hardware profile");
    assert.ok(typeof hw.gpuAvailable === "boolean");
    assert.ok(typeof hw.cpuCores === "number");
    assert.ok(hw.cpuCores > 0);
    assert.ok(typeof hw.ramMB === "number");
    assert.ok(hw.ramMB > 0);
    assert.ok(Object.values(GpuVendor).includes(hw.gpuVendor));
    assert.ok(Object.values(VramTier).includes(hw.vramTier));
  });

  it("summarizeHardware returns a string", async () => {
    const hw = await detectHardware();
    const summary = summarizeHardware(hw);
    assert.ok(typeof summary === "string");
    assert.ok(summary.length > 0);
  });
});

// ── Presets Tests ────────────────────────────────────────
const {
  MediaMode,
  PresetId,
  IMAGE_PRESETS,
  VIDEO_PRESETS,
  autoSelectImagePreset,
  autoSelectVideoPreset,
} = require("../src/presets");

describe("Presets & Auto-Routing", () => {
  it("has all expected image presets", () => {
    assert.ok(IMAGE_PRESETS[PresetId.IMG_CPU_FAST]);
    assert.ok(IMAGE_PRESETS[PresetId.IMG_CPU_BALANCED]);
    assert.ok(IMAGE_PRESETS[PresetId.IMG_GPU_HIGH]);
  });

  it("has all expected video presets", () => {
    assert.ok(VIDEO_PRESETS[PresetId.VID_GPU_SHORT]);
    assert.ok(VIDEO_PRESETS[PresetId.VID_GPU_STANDARD]);
  });

  it("CPU_FAST preset is 512×512 with minimal steps", () => {
    const p = IMAGE_PRESETS[PresetId.IMG_CPU_FAST];
    assert.equal(p.width, 512);
    assert.equal(p.height, 512);
    assert.ok(p.steps <= 8, "CPU_FAST should have ≤8 steps");
  });

  it("autoSelectImagePreset returns CPU_FAST on CPU_ONLY mode", () => {
    const hw = { gpuAvailable: false, vramTier: VramTier.NONE };
    const preset = autoSelectImagePreset(MediaMode.CPU_ONLY, hw);
    assert.equal(preset.id, PresetId.IMG_CPU_FAST);
  });

  it("autoSelectImagePreset returns GPU_HIGH with high VRAM GPU", () => {
    const hw = {
      gpuAvailable: true,
      vramTier: VramTier.HIGH,
      cudaAvailable: true,
    };
    const preset = autoSelectImagePreset(MediaMode.AUTO, hw);
    assert.equal(preset.id, PresetId.IMG_GPU_HIGH);
  });

  it("autoSelectVideoPreset blocks on CPU_ONLY", () => {
    const hw = { gpuAvailable: false, vramTier: VramTier.NONE };
    const result = autoSelectVideoPreset(MediaMode.CPU_ONLY, hw);
    assert.ok(result.blocked, "video should be blocked on CPU");
  });

  it("autoSelectVideoPreset allows with GPU", () => {
    const hw = {
      gpuAvailable: true,
      vramTier: VramTier.HIGH,
      cudaAvailable: true,
    };
    const result = autoSelectVideoPreset(MediaMode.AUTO, hw);
    assert.ok(!result.blocked, "video should not be blocked with GPU");
    assert.ok(result.preset, "should return a preset");
  });
});

// ── Quality Advisor Tests ───────────────────────────────
const {
  evaluateRequest,
  AdviceLevel,
  oomRecoveryAdvice,
} = require("../src/qualityAdvisor");

describe("Quality Advisor", () => {
  it("blocks video on CPU", () => {
    const hw = { gpuAvailable: false, vramTier: VramTier.NONE };
    const advice = evaluateRequest({
      type: "video",
      mode: MediaMode.CPU_ONLY,
      width: 576,
      height: 320,
      steps: 0,
      promptHint: "",
      hw,
    });
    const blocked = advice.find((a) => a.level === AdviceLevel.BLOCKED);
    assert.ok(blocked, "video on CPU should be blocked");
  });

  it("warns about high-res on CPU", () => {
    const hw = { gpuAvailable: false, vramTier: VramTier.NONE };
    const advice = evaluateRequest({
      type: "image",
      mode: MediaMode.CPU_ONLY,
      width: 1024,
      height: 1024,
      steps: 20,
      promptHint: "",
      hw,
    });
    const warns = advice.filter((a) => a.level === AdviceLevel.WARNING);
    assert.ok(warns.length > 0, "should warn about high-res on CPU");
  });

  it("blocks GPU mode with no GPU", () => {
    const hw = { gpuAvailable: false, vramTier: VramTier.NONE };
    const advice = evaluateRequest({
      type: "image",
      mode: MediaMode.GPU_ONLY,
      width: 512,
      height: 512,
      steps: 4,
      promptHint: "",
      hw,
    });
    const blocked = advice.find((a) => a.level === AdviceLevel.BLOCKED);
    assert.ok(blocked, "GPU mode with no GPU should be blocked");
  });

  it("oomRecoveryAdvice returns helpful advice", () => {
    const hw = { gpuAvailable: true, vramTier: VramTier.MEDIUM };
    const advice = oomRecoveryAdvice(hw);
    assert.ok(advice.message, "should return a message");
    assert.ok(advice.message.length > 0);
  });
});

// ── Permissions Tests ───────────────────────────────────
const {
  MediaPermission,
  createMediaPermissions,
} = require("../src/permissions");

describe("Permissions (Fail-Closed)", () => {
  it("fails closed when no gate provided", async () => {
    const perms = createMediaPermissions({
      auditLogDir: os.tmpdir(),
      permissionGate: null,
    });
    const result = await perms.gate(MediaPermission.GENERATE_IMAGE, {
      prompt: "test",
    });
    assert.ok(!result.allowed, "should deny when no permission gate");
  });

  it("allows when gate approves", async () => {
    const perms = createMediaPermissions({
      auditLogDir: os.tmpdir(),
      permissionGate: {
        checkPermission: async () => true,
        requestApproval: async () => true,
      },
    });
    const result = await perms.gate(MediaPermission.RENDER_DIAGRAM, {
      prompt: "test",
    });
    assert.ok(result.allowed, "should allow when gate approves");
  });

  it("denies when gate rejects", async () => {
    const perms = createMediaPermissions({
      auditLogDir: os.tmpdir(),
      permissionGate: {
        checkPermission: async () => false,
        requestApproval: async () => false,
      },
    });
    const result = await perms.gate(MediaPermission.GENERATE_IMAGE, {
      prompt: "test",
    });
    assert.ok(!result.allowed, "should deny when gate rejects");
  });

  it("denies on unknown permission with no gate", async () => {
    const perms = createMediaPermissions({
      auditLogDir: os.tmpdir(),
      permissionGate: null,
    });
    const result = await perms.gate("unknown_permission", { prompt: "test" });
    assert.ok(!result.allowed, "should deny unknown permissions when no gate");
  });

  it("creates audit log entries", async () => {
    const tmpDir = path.join(os.tmpdir(), `media-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const perms = createMediaPermissions({
      auditLogDir: tmpDir,
      permissionGate: {
        checkPermission: async () => true,
        requestApproval: async () => true,
      },
    });
    await perms.gate(MediaPermission.RENDER_DIAGRAM, {
      prompt: "test diagram",
    });

    const auditFile = path.join(tmpDir, "media-audit.jsonl");
    assert.ok(fs.existsSync(auditFile), "audit file should be created");
    const content = fs.readFileSync(auditFile, "utf-8");
    assert.ok(content.length > 0, "audit file should have content");
    const entry = JSON.parse(content.trim().split("\n")[0]);
    assert.equal(entry.permission, MediaPermission.RENDER_DIAGRAM);
    assert.ok(entry.promptHash, "should hash the prompt, not store raw");
    assert.ok(!entry.rawPrompt, "should NOT store raw prompt");

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ── Path Traversal Tests ────────────────────────────────
const { ensureArtifactDir } = require("../src/tools");

describe("Path Traversal Prevention", () => {
  it("allows normal subdirectory", () => {
    const ws = os.tmpdir();
    const dir = ensureArtifactDir(ws, "images");
    assert.ok(dir.includes("artifacts"));
    assert.ok(dir.includes("media"));
    assert.ok(dir.includes("images"));
  });

  it("throws on path traversal attempt", () => {
    assert.throws(() => {
      ensureArtifactDir("/workspace", "../../../../etc/passwd");
    }, /Path traversal detected/);
  });

  it("throws when workspace is empty", () => {
    assert.throws(() => {
      ensureArtifactDir("", "images");
    }, /Workspace directory is required/);
  });
});

// ── Client Tests (offline) ──────────────────────────────
const { MediaServiceClient } = require("../src/client");

describe("MediaServiceClient", () => {
  it("creates client with default port", () => {
    const client = new MediaServiceClient();
    assert.ok(client, "should create client");
  });

  it("creates client with custom port", () => {
    const client = new MediaServiceClient({ port: 9999 });
    assert.ok(client, "should create client with custom port");
  });

  it("isAlive returns false when service not running", async () => {
    const client = new MediaServiceClient({ port: 19999 });
    const alive = await client.isAlive();
    assert.equal(alive, false, "should return false when service is down");
  });
});
