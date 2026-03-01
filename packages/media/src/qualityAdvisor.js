/**
 * CodeIn Media Toolkit — Quality Advisor
 *
 * Analyses user requests vs hardware capability and provides
 * actionable warnings, suggestions, and upgrade CTAs.
 */

"use strict";

const { VramTier } = require("./hardware");
const { MediaMode } = require("./presets");

/** @enum {string} */
const AdviceLevel = {
  INFO: "info",
  WARNING: "warning",
  BLOCKED: "blocked",
};

/**
 * @typedef {Object} QualityAdvice
 * @property {string}  level       - AdviceLevel
 * @property {string}  message     - user-facing message
 * @property {string|null} action  - actionable CTA label (e.g. "Switch to GPU")
 * @property {string|null} actionMode - suggested MediaMode if action clicked
 */

/**
 * Evaluate a generation request and return advice.
 *
 * @param {Object} params
 * @param {'image'|'video'|'diagram'} params.type
 * @param {string}  params.mode           - current MediaMode
 * @param {number}  params.width
 * @param {number}  params.height
 * @param {number}  params.steps
 * @param {string}  params.promptHint     - keywords like "photorealistic", "4k"
 * @param {import('./hardware').HardwareProfile} params.hw
 * @returns {QualityAdvice[]}
 */
function evaluateRequest({
  type,
  mode,
  width,
  height,
  steps,
  promptHint = "",
  hw,
}) {
  const advice = [];
  const prompt = promptHint.toLowerCase();

  // ── Diagrams: always fine ─────────────────────────────────
  if (type === "diagram") return advice;

  // ── Video checks ──────────────────────────────────────────
  if (type === "video") {
    if (!hw.gpuAvailable) {
      advice.push({
        level: AdviceLevel.BLOCKED,
        message:
          "Video generation requires a GPU (NVIDIA with CUDA or Apple Silicon with MPS). No compatible GPU was detected.",
        action: null,
        actionMode: null,
      });
      return advice;
    }
    if (mode === MediaMode.CPU_ONLY) {
      advice.push({
        level: AdviceLevel.BLOCKED,
        message:
          "Video generation requires GPU. You have a compatible GPU — switch to GPU or AUTO mode to enable video.",
        action: "Switch to AUTO",
        actionMode: MediaMode.AUTO,
      });
      return advice;
    }
    if (hw.vramTier === VramTier.LOW || hw.vramTier === VramTier.UNKNOWN) {
      advice.push({
        level: AdviceLevel.WARNING,
        message:
          "Your GPU has limited VRAM. Video generation may fail or produce poor results. Try the Short Clip preset at lower resolution.",
        action: null,
        actionMode: null,
      });
    }
    return advice;
  }

  // ── Image checks ──────────────────────────────────────────

  const isHighRes = width > 768 || height > 768;
  const isManySteps = steps > 30;
  const wantsDetail = /photorealistic|photo|4k|hd|hyper.?detail|ultra/i.test(
    prompt,
  );
  const isCpuMode =
    mode === MediaMode.CPU_ONLY ||
    (!hw.gpuAvailable && mode === MediaMode.AUTO);

  // High resolution on CPU
  if (isCpuMode && isHighRes) {
    advice.push({
      level: AdviceLevel.WARNING,
      message: `Generating at ${width}×${height} on CPU will be very slow (10–30+ minutes). Consider reducing to 512×512 or switching to GPU.`,
      action: hw.gpuAvailable ? "Switch to GPU" : "Reduce resolution",
      actionMode: hw.gpuAvailable ? MediaMode.GPU_ONLY : null,
    });
  }

  // Many steps on CPU
  if (isCpuMode && isManySteps) {
    advice.push({
      level: AdviceLevel.WARNING,
      message: `${steps} inference steps on CPU will be slow. Reduce to 10–20 steps for faster results, or switch to GPU.`,
      action: hw.gpuAvailable ? "Switch to GPU" : null,
      actionMode: hw.gpuAvailable ? MediaMode.GPU_ONLY : null,
    });
  }

  // User wants photorealistic but on CPU preset
  if (isCpuMode && wantsDetail && !isHighRes) {
    advice.push({
      level: AdviceLevel.INFO,
      message:
        "For photorealistic/high-detail images, the GPU High Quality (SDXL) preset at 1024×1024 produces significantly better results.",
      action: hw.gpuAvailable ? "Switch to GPU High Quality" : null,
      actionMode: hw.gpuAvailable ? MediaMode.GPU_ONLY : null,
    });
  }

  // GPU mode but no GPU
  if (mode === MediaMode.GPU_ONLY && !hw.gpuAvailable) {
    advice.push({
      level: AdviceLevel.BLOCKED,
      message:
        "GPU mode selected but no compatible GPU detected. Switch to AUTO or CPU mode.",
      action: "Switch to AUTO",
      actionMode: MediaMode.AUTO,
    });
  }

  return advice;
}

/**
 * Post-generation quality check.
 * Called after an image is generated to suggest improvements.
 *
 * @param {Object} params
 * @param {number} params.width
 * @param {number} params.height
 * @param {number} params.steps
 * @param {string} params.presetId
 * @param {string} params.promptHint
 * @param {import('./hardware').HardwareProfile} params.hw
 * @returns {QualityAdvice[]}
 */
function postGenerationAdvice({
  width,
  height,
  steps,
  presetId,
  promptHint = "",
  hw,
}) {
  const advice = [];
  const prompt = promptHint.toLowerCase();
  const wantsDetail = /photorealistic|photo|4k|hd|hyper.?detail|ultra/i.test(
    prompt,
  );

  // Low-res output + user wanted detail
  if (wantsDetail && width <= 512 && height <= 512) {
    if (hw.gpuAvailable) {
      advice.push({
        level: AdviceLevel.INFO,
        message:
          "Your image was generated at 512×512. For the detail level you requested, try GPU High Quality (1024×1024) for much sharper results.",
        action: "Regenerate with GPU High Quality",
        actionMode: MediaMode.GPU_ONLY,
      });
    } else {
      advice.push({
        level: AdviceLevel.INFO,
        message:
          "Your image was generated at 512×512 on CPU. Results may appear soft. A GPU with 6+ GB VRAM would enable much higher quality output.",
        action: null,
        actionMode: null,
      });
    }
  }

  return advice;
}

/**
 * Generate OOM recovery advice.
 * @param {import('./hardware').HardwareProfile} hw
 * @returns {QualityAdvice}
 */
function oomRecoveryAdvice(hw) {
  return {
    level: AdviceLevel.WARNING,
    message:
      "Out of memory during generation. Try: (1) Reduce resolution to 512×512, (2) Use fewer steps, (3) Close other GPU-heavy applications, (4) Use the CPU Fast preset instead.",
    action: "Use CPU Fast preset",
    actionMode: MediaMode.CPU_ONLY,
  };
}

module.exports = {
  AdviceLevel,
  evaluateRequest,
  postGenerationAdvice,
  oomRecoveryAdvice,
};
