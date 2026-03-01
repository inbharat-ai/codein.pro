/**
 * CodeIn Media Toolkit — Preset Profiles
 *
 * Single source of truth for image / video / diagram quality presets.
 * Each preset defines model, resolution, steps, estimated times, and hardware requirements.
 */

"use strict";

const { VramTier } = require("./hardware");

/** @enum {string} */
const MediaMode = {
  AUTO: "auto",
  CPU_ONLY: "cpu",
  GPU_ONLY: "gpu",
};

/** @enum {string} */
const PresetId = {
  // Images
  IMG_CPU_FAST: "img_cpu_fast",
  IMG_CPU_BALANCED: "img_cpu_balanced",
  IMG_GPU_HIGH: "img_gpu_high",
  // Videos
  VID_GPU_SHORT: "vid_gpu_short",
  VID_GPU_STANDARD: "vid_gpu_standard",
  // Diagrams (always CPU-OK)
  DIAGRAM_DEFAULT: "diagram_default",
};

/**
 * @typedef {Object} ImagePreset
 * @property {string}  id
 * @property {string}  label
 * @property {string}  description
 * @property {string}  model             - HuggingFace model id
 * @property {number}  width
 * @property {number}  height
 * @property {number}  steps
 * @property {number}  guidanceScale
 * @property {number}  batchSize
 * @property {boolean} requiresGpu
 * @property {string}  minVramTier       - minimum VramTier to use this preset on GPU
 * @property {string}  estimatedTime     - human-readable estimate
 * @property {string}  bestFor           - usage guidance
 * @property {number}  modelSizeMB       - approximate download size
 */

/** @type {Record<string, ImagePreset>} */
const IMAGE_PRESETS = {
  [PresetId.IMG_CPU_FAST]: {
    id: PresetId.IMG_CPU_FAST,
    label: "Fast (CPU)",
    description:
      "Quick generation for icons, simple illustrations, concept art. Works on any machine.",
    model: "stabilityai/sd-turbo",
    width: 512,
    height: 512,
    steps: 4,
    guidanceScale: 0.0,
    batchSize: 1,
    requiresGpu: false,
    minVramTier: VramTier.NONE,
    estimatedTime: "~30s–3 min (CPU) / ~5–15s (GPU)",
    bestFor: "Icons, simple diagrams, basic illustrations, concept sketches",
    modelSizeMB: 2500,
  },
  [PresetId.IMG_CPU_BALANCED]: {
    id: PresetId.IMG_CPU_BALANCED,
    label: "Balanced",
    description:
      "Better quality at moderate speed. Best with GPU but works on CPU (slower).",
    model: "runwayml/stable-diffusion-v1-5",
    width: 512,
    height: 512,
    steps: 20,
    guidanceScale: 7.5,
    batchSize: 1,
    requiresGpu: false,
    minVramTier: VramTier.NONE,
    estimatedTime: "~3–10 min (CPU) / ~10–30s (GPU)",
    bestFor: "Blog images, social media art, UI mockups",
    modelSizeMB: 4200,
  },
  [PresetId.IMG_GPU_HIGH]: {
    id: PresetId.IMG_GPU_HIGH,
    label: "High Quality (GPU)",
    description: "Best quality with SDXL. Requires GPU with 6+ GB VRAM.",
    model: "stabilityai/stable-diffusion-xl-base-1.0",
    width: 1024,
    height: 1024,
    steps: 30,
    guidanceScale: 7.0,
    batchSize: 1,
    requiresGpu: true,
    minVramTier: VramTier.MEDIUM,
    estimatedTime: "~15–60s (GPU 8 GB+) / Not recommended on CPU",
    bestFor: "Marketing material, detailed artwork, photorealistic images",
    modelSizeMB: 6800,
  },
};

/**
 * @typedef {Object} VideoPreset
 * @property {string}  id
 * @property {string}  label
 * @property {string}  description
 * @property {string}  model
 * @property {number}  durationSeconds
 * @property {number}  fps
 * @property {number}  width
 * @property {number}  height
 * @property {boolean} requiresGpu        - always true for video
 * @property {string}  minVramTier
 * @property {string}  estimatedTime
 * @property {number}  modelSizeMB
 */

/** @type {Record<string, VideoPreset>} */
const VIDEO_PRESETS = {
  [PresetId.VID_GPU_SHORT]: {
    id: PresetId.VID_GPU_SHORT,
    label: "Short Clip (GPU)",
    description: "4-second clip. Requires GPU with 8+ GB VRAM.",
    model: "stabilityai/stable-video-diffusion-img2vid",
    durationSeconds: 4,
    fps: 7,
    width: 576,
    height: 320,
    requiresGpu: true,
    minVramTier: VramTier.MEDIUM,
    estimatedTime: "~1–5 min (GPU 8 GB+)",
    modelSizeMB: 5000,
  },
  [PresetId.VID_GPU_STANDARD]: {
    id: PresetId.VID_GPU_STANDARD,
    label: "Standard Clip (GPU)",
    description: "6–8 second clip at higher quality. Requires 12+ GB VRAM.",
    model: "stabilityai/stable-video-diffusion-img2vid-xt",
    durationSeconds: 8,
    fps: 7,
    width: 576,
    height: 320,
    requiresGpu: true,
    minVramTier: VramTier.HIGH,
    estimatedTime: "~3–10 min (GPU 12 GB+)",
    modelSizeMB: 5000,
  },
};

/** Diagram preset (always CPU-OK) */
const DIAGRAM_PRESET = {
  id: PresetId.DIAGRAM_DEFAULT,
  label: "Diagram",
  description: "Render Mermaid/PlantUML/D2 diagrams. CPU-only, instant.",
  requiresGpu: false,
  estimatedTime: "<1 second",
  supportedEngines: ["mermaid", "plantuml", "d2"],
  outputFormats: ["svg", "png"],
};

// ── Auto-routing logic ──────────────────────────────────────

/**
 * Pick the best image preset for the given mode + hardware profile.
 * @param {string} mode - MediaMode
 * @param {import('./hardware').HardwareProfile} hw
 * @returns {ImagePreset}
 */
function autoSelectImagePreset(mode, hw) {
  if (mode === MediaMode.GPU_ONLY) {
    if (!hw.gpuAvailable) {
      throw new Error(
        "GPU mode selected but no GPU detected. Switch to AUTO or CPU mode.",
      );
    }
    return IMAGE_PRESETS[PresetId.IMG_GPU_HIGH];
  }
  if (mode === MediaMode.CPU_ONLY) {
    return IMAGE_PRESETS[PresetId.IMG_CPU_FAST];
  }
  // AUTO
  if (
    hw.gpuAvailable &&
    hw.vramTier !== VramTier.LOW &&
    hw.vramTier !== VramTier.UNKNOWN
  ) {
    return IMAGE_PRESETS[PresetId.IMG_GPU_HIGH];
  }
  if (hw.gpuAvailable) {
    // GPU exists but low/unknown VRAM → balanced (will run on GPU with smaller model)
    return IMAGE_PRESETS[PresetId.IMG_CPU_BALANCED];
  }
  return IMAGE_PRESETS[PresetId.IMG_CPU_FAST];
}

/**
 * Pick the best video preset, or return null (blocked) with a reason.
 * @param {string} mode
 * @param {import('./hardware').HardwareProfile} hw
 * @returns {{ preset: VideoPreset|null, blocked: boolean, reason: string }}
 */
function autoSelectVideoPreset(mode, hw) {
  if (mode === MediaMode.CPU_ONLY) {
    return {
      preset: null,
      blocked: true,
      reason:
        "Video generation requires a GPU for acceptable quality and speed. Switch to AUTO or GPU mode if you have a compatible GPU.",
    };
  }

  if (!hw.gpuAvailable) {
    return {
      preset: null,
      blocked: true,
      reason:
        "Video generation requires a GPU (NVIDIA with CUDA or Apple Silicon). No compatible GPU was detected on this machine.",
    };
  }

  // Check VRAM tier
  if (hw.vramTier === VramTier.HIGH || hw.vramTier === VramTier.ULTRA) {
    return {
      preset: VIDEO_PRESETS[PresetId.VID_GPU_STANDARD],
      blocked: false,
      reason: "",
    };
  }
  if (hw.vramTier === VramTier.MEDIUM) {
    return {
      preset: VIDEO_PRESETS[PresetId.VID_GPU_SHORT],
      blocked: false,
      reason: "",
    };
  }

  // Low or unknown VRAM — allow short with warning
  return {
    preset: VIDEO_PRESETS[PresetId.VID_GPU_SHORT],
    blocked: false,
    reason:
      "Your GPU has limited or unknown VRAM. Generation may be slow or fail with out-of-memory errors. Consider reducing resolution.",
  };
}

module.exports = {
  MediaMode,
  PresetId,
  IMAGE_PRESETS,
  VIDEO_PRESETS,
  DIAGRAM_PRESET,
  autoSelectImagePreset,
  autoSelectVideoPreset,
};
