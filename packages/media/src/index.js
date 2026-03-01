/**
 * CodeIn Media Toolkit — Main entry point
 *
 * Exports all sub-modules and provides the `createMediaToolkit()` factory
 * that wires hardware detection, permissions, client, and tool adapters.
 */

"use strict";

const {
  detectHardware,
  summarizeHardware,
  GpuVendor,
  VramTier,
} = require("./hardware");
const {
  MediaMode,
  PresetId,
  IMAGE_PRESETS,
  VIDEO_PRESETS,
  DIAGRAM_PRESET,
  autoSelectImagePreset,
  autoSelectVideoPreset,
} = require("./presets");
const {
  evaluateRequest,
  postGenerationAdvice,
  oomRecoveryAdvice,
  AdviceLevel,
} = require("./qualityAdvisor");
const { MediaPermission, createMediaPermissions } = require("./permissions");
const { MediaServiceClient } = require("./client");
const { createMediaTools, ensureArtifactDir } = require("./tools");

/**
 * Create the full media toolkit.
 *
 * @param {Object} opts
 * @param {string} [opts.mode='auto'] - MediaMode: auto | cpu_only | gpu_only
 * @param {string} [opts.dataDir] - data dir for audit logs etc. (default: os.tmpdir())
 * @param {number} [opts.port=43130] - Python service port
 * @param {function(string, Object): Promise<boolean>} [opts.permissionCallback] -
 *   called when user approval is needed: (message, context) → boolean
 * @param {function(string): void} [opts.onProgress] - progress callback
 * @returns {Promise<MediaToolkit>}
 */
async function createMediaToolkit(opts = {}) {
  const {
    mode = MediaMode.AUTO,
    dataDir,
    port = 43130,
    permissionCallback,
    onProgress = () => {},
  } = opts;

  // 1. Detect hardware
  const hardware = await detectHardware();
  const hwSummary = summarizeHardware(hardware);

  // 2. Create permissions
  const permissions = createMediaPermissions({
    dataDir,
    requestApproval: permissionCallback || (async () => true),
  });

  // 3. Create client
  const client = new MediaServiceClient({ port });

  // 4. Create tool adapters
  const tools = createMediaTools({
    client,
    permissions,
    hardware,
    mode,
    onProgress,
  });

  /** @type {MediaToolkit} */
  const toolkit = {
    hardware,
    hwSummary,
    client,
    permissions,
    tools,
    mode,

    /** Health check */
    async isReady() {
      return client.isAlive();
    },

    /** Get all tools as a flat map */
    getTools() {
      return {
        "media.render_diagram": tools["media.render_diagram"],
        "media.generate_image": tools["media.generate_image"],
        "media.generate_video": tools["media.generate_video"],
        "media.image_to_video": tools["media.image_to_video"],
      };
    },

    /** Get tool definitions for registration */
    getToolDefinitions() {
      return [
        {
          name: "media.render_diagram",
          description:
            "Render a diagram from source code (Mermaid, PlantUML, or D2) to SVG/PNG. Runs on CPU, no GPU needed.",
          parameters: {
            type: "object",
            required: ["source"],
            properties: {
              source: {
                type: "string",
                description:
                  "Diagram source code (Mermaid, PlantUML, or D2 syntax)",
              },
              engine: {
                type: "string",
                enum: ["mermaid", "plantuml", "d2"],
                description: "Diagram engine (default: mermaid)",
              },
              format: {
                type: "string",
                enum: ["svg", "png"],
                description: "Output format (default: svg)",
              },
            },
          },
        },
        {
          name: "media.generate_image",
          description: `Generate an image from a text prompt using Stable Diffusion. ${hwSummary}. Outputs to artifacts/media/images/.`,
          parameters: {
            type: "object",
            required: ["prompt"],
            properties: {
              prompt: {
                type: "string",
                description: "Text description of the image to generate",
              },
              negative_prompt: {
                type: "string",
                description: "Things to avoid in the image",
              },
              preset: {
                type: "string",
                enum: Object.keys(IMAGE_PRESETS),
                description: "Quality preset (auto-selected if omitted)",
              },
              width: {
                type: "integer",
                description: "Image width in pixels (overrides preset)",
              },
              height: {
                type: "integer",
                description: "Image height in pixels (overrides preset)",
              },
              steps: {
                type: "integer",
                description: "Inference steps (overrides preset)",
              },
              seed: {
                type: "integer",
                description: "Random seed for reproducibility",
              },
            },
          },
        },
        {
          name: "media.generate_video",
          description: `Generate a short video from a text prompt. Requires GPU with ≥8GB VRAM. ${hwSummary}. Outputs to artifacts/media/videos/.`,
          parameters: {
            type: "object",
            required: ["prompt"],
            properties: {
              prompt: {
                type: "string",
                description: "Text description of the video to generate",
              },
              preset: {
                type: "string",
                enum: Object.keys(VIDEO_PRESETS),
                description: "Quality preset",
              },
              seed: {
                type: "integer",
                description: "Random seed for reproducibility",
              },
            },
          },
        },
        {
          name: "media.image_to_video",
          description: `Animate a still image into a short video. Requires GPU with ≥8GB VRAM. ${hwSummary}. Outputs to artifacts/media/videos/.`,
          parameters: {
            type: "object",
            required: ["image_path"],
            properties: {
              image_path: {
                type: "string",
                description:
                  "Path to the input image (must be inside workspace)",
              },
              prompt: {
                type: "string",
                description: "Optional motion/style prompt",
              },
              preset: {
                type: "string",
                enum: Object.keys(VIDEO_PRESETS),
                description: "Quality preset",
              },
              seed: {
                type: "integer",
                description: "Random seed for reproducibility",
              },
            },
          },
        },
      ];
    },

    /** Cancel running generation */
    cancelGeneration(jobId) {
      return tools.cancelGeneration(jobId);
    },

    /** Model management */
    modelsStatus() {
      return client.modelsStatus();
    },
    downloadModel(modelId) {
      return client.downloadModel(modelId);
    },
    deleteModel(modelId) {
      return client.deleteModel(modelId);
    },
  };

  return toolkit;
}

module.exports = {
  // Factory
  createMediaToolkit,

  // Sub-modules (re-exported for direct use)
  detectHardware,
  summarizeHardware,
  GpuVendor,
  VramTier,
  MediaMode,
  PresetId,
  IMAGE_PRESETS,
  VIDEO_PRESETS,
  DIAGRAM_PRESET,
  autoSelectImagePreset,
  autoSelectVideoPreset,
  evaluateRequest,
  postGenerationAdvice,
  oomRecoveryAdvice,
  AdviceLevel,
  MediaPermission,
  createMediaPermissions,
  MediaServiceClient,
  createMediaTools,
  ensureArtifactDir,
};
