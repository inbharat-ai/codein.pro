/**
 * CodeIn Media Toolkit — Tool Adapters
 *
 * Tool implementations for: media.render_diagram, media.generate_image,
 * media.generate_video, media.image_to_video.
 *
 * Each tool follows the ToolImpl signature: (parameters, extras) => Promise<ContextItem[]>
 * and integrates with permissions, presets, quality advisor, and the media service client.
 */

"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { MediaPermission } = require("./permissions");
const {
  IMAGE_PRESETS,
  VIDEO_PRESETS,
  PresetId,
  MediaMode,
  autoSelectImagePreset,
  autoSelectVideoPreset,
} = require("./presets");
const {
  evaluateRequest,
  postGenerationAdvice,
  oomRecoveryAdvice,
  AdviceLevel,
} = require("./qualityAdvisor");

/**
 * Ensure output directory exists inside workspace artifacts.
 * Returns the full directory path. Prevents path traversal.
 *
 * @param {string} workspaceDir
 * @param {'images'|'videos'|'diagrams'} subDir
 * @returns {string}
 */
function ensureArtifactDir(workspaceDir, subDir) {
  if (!workspaceDir || typeof workspaceDir !== "string") {
    throw new Error("Workspace directory is required");
  }
  const dir = path.join(workspaceDir, "artifacts", "media", subDir);
  const resolved = path.resolve(dir);
  const resolvedWorkspace = path.resolve(workspaceDir);
  if (!resolved.startsWith(resolvedWorkspace)) {
    throw new Error("Path traversal detected: output must be inside workspace");
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Generate a unique filename */
function uniqueName(ext) {
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString("hex");
  return `${ts}_${rand}.${ext}`;
}

/**
 * Create all media tool implementations.
 *
 * @param {Object} deps
 * @param {import('./client').MediaServiceClient} deps.client
 * @param {ReturnType<import('./permissions').createMediaPermissions>} deps.permissions
 * @param {import('./hardware').HardwareProfile} deps.hardware
 * @param {string} deps.mode - MediaMode
 * @param {function(string): void} deps.onProgress - progress callback
 * @returns {Object} - map of toolName → toolImpl
 */
function createMediaTools({
  client,
  permissions,
  hardware,
  mode = MediaMode.AUTO,
  onProgress = () => {},
}) {
  // ── media.render_diagram ────────────────────────────────
  async function renderDiagram(parameters, extras) {
    const { engine = "mermaid", source, format = "svg" } = parameters;
    const workspaceDir = extras?.workspaceDir;

    if (!source || typeof source !== "string") {
      return [
        {
          name: "Error",
          description: "Diagram source is required.",
          content: "",
        },
      ];
    }

    // Permission check
    const perm = await permissions.gate(MediaPermission.RENDER_DIAGRAM, {
      prompt: source,
      outputDir: workspaceDir
        ? path.join(workspaceDir, "artifacts", "media", "diagrams")
        : "workspace",
    });
    if (!perm.allowed) {
      return [
        { name: "Permission Denied", description: perm.reason, content: "" },
      ];
    }

    const dir = ensureArtifactDir(workspaceDir, "diagrams");
    const outFile = uniqueName(format);
    const outPath = path.join(dir, outFile);

    try {
      const result = await client.renderDiagram({
        engine,
        source,
        format,
        out_path: outPath,
      });
      if (result.success) {
        return [
          {
            name: "Diagram",
            description: `${engine} diagram rendered to ${format.toUpperCase()}`,
            content: outPath,
            uri: { type: "file", value: outPath },
          },
        ];
      }
      return [
        {
          name: "Error",
          description: result.error || "Diagram rendering failed",
          content: "",
        },
      ];
    } catch (err) {
      return [
        {
          name: "Error",
          description: `Diagram rendering failed: ${err.message}`,
          content: "",
        },
      ];
    }
  }

  // ── media.generate_image ────────────────────────────────
  async function generateImage(parameters, extras) {
    const {
      prompt,
      negative_prompt = "",
      preset: presetId,
      width: customWidth,
      height: customHeight,
      steps: customSteps,
      seed = Math.floor(Math.random() * 2147483647),
    } = parameters;
    const workspaceDir = extras?.workspaceDir;

    if (!prompt || typeof prompt !== "string") {
      return [
        {
          name: "Error",
          description: "A text prompt is required for image generation.",
          content: "",
        },
      ];
    }

    // Select preset
    let preset;
    if (presetId && IMAGE_PRESETS[presetId]) {
      preset = IMAGE_PRESETS[presetId];
    } else {
      preset = autoSelectImagePreset(mode, hardware);
    }

    const width = customWidth || preset.width;
    const height = customHeight || preset.height;
    const steps = customSteps || preset.steps;

    // Quality advice
    const advice = evaluateRequest({
      type: "image",
      mode,
      width,
      height,
      steps,
      promptHint: prompt,
      hw: hardware,
    });
    const blocked = advice.find((a) => a.level === AdviceLevel.BLOCKED);
    if (blocked) {
      return [
        {
          name: "Blocked",
          description: blocked.message,
          content: blocked.action ? `Suggestion: ${blocked.action}` : "",
        },
      ];
    }

    // Permission check
    const dir = ensureArtifactDir(workspaceDir, "images");
    const perm = await permissions.gate(MediaPermission.GENERATE_IMAGE, {
      prompt,
      seed,
      modelId: preset.model,
      presetId: preset.id,
      outputPath: dir,
      modelSizeMB: preset.modelSizeMB,
      requiresDownload: true,
      outputDir: dir,
    });
    if (!perm.allowed) {
      return [
        { name: "Permission Denied", description: perm.reason, content: "" },
      ];
    }

    // Send warnings as progress
    for (const a of advice) {
      onProgress(`⚠️ ${a.message}`);
    }
    onProgress(
      `🎨 Generating image with ${preset.label} preset (${width}×${height}, ${steps} steps)…`,
    );
    onProgress(`⏱️ Estimated time: ${preset.estimatedTime}`);

    const outFile = uniqueName("png");
    const outPath = path.join(dir, outFile);

    // Determine device
    let device = "auto";
    if (mode === MediaMode.CPU_ONLY) device = "cpu";
    else if (mode === MediaMode.GPU_ONLY)
      device = hardware.cudaAvailable
        ? "cuda"
        : hardware.mpsAvailable
          ? "mps"
          : "cpu";

    const jobId = crypto.randomBytes(8).toString("hex");

    try {
      const result = await client.generateImage({
        prompt,
        negative_prompt,
        model_id: preset.model,
        width,
        height,
        steps,
        guidance_scale: preset.guidanceScale,
        seed,
        out_path: outPath,
        device,
        job_id: jobId,
      });

      if (result.success) {
        onProgress(
          `✅ Image saved: ${outFile} (${result.time_seconds?.toFixed(1)}s, seed=${result.seed})`,
        );

        // Post-generation advice
        const postAdvice = postGenerationAdvice({
          width,
          height,
          steps,
          presetId: preset.id,
          promptHint: prompt,
          hw: hardware,
        });
        for (const a of postAdvice) onProgress(`💡 ${a.message}`);

        return [
          {
            name: "Generated Image",
            description: `${preset.label} — ${width}×${height}, ${steps} steps, seed=${result.seed}`,
            content: outPath,
            uri: { type: "file", value: outPath },
          },
        ];
      }

      // Handle OOM
      if (
        result.error?.includes("out of memory") ||
        result.error?.includes("OOM")
      ) {
        const recovery = oomRecoveryAdvice(hardware);
        onProgress(`⚠️ ${recovery.message}`);
        return [{ name: "Error", description: recovery.message, content: "" }];
      }

      return [
        {
          name: "Error",
          description: result.error || "Image generation failed",
          content: "",
        },
      ];
    } catch (err) {
      if (err.message === "Request aborted") {
        return [
          {
            name: "Cancelled",
            description: "Image generation was cancelled.",
            content: "",
          },
        ];
      }
      return [
        {
          name: "Error",
          description: `Image generation failed: ${err.message}`,
          content: "",
        },
      ];
    }
  }

  // ── media.generate_video ────────────────────────────────
  async function generateVideo(parameters, extras) {
    const {
      prompt,
      preset: presetId,
      seed = Math.floor(Math.random() * 2147483647),
    } = parameters;
    const workspaceDir = extras?.workspaceDir;

    if (!prompt || typeof prompt !== "string") {
      return [
        {
          name: "Error",
          description: "A text prompt is required for video generation.",
          content: "",
        },
      ];
    }

    // Select preset
    const selection = autoSelectVideoPreset(mode, hardware);
    if (selection.blocked) {
      return [
        {
          name: "Blocked",
          description: selection.reason,
          content: hardware.gpuAvailable
            ? "Suggestion: Switch to AUTO or GPU mode."
            : "",
        },
      ];
    }
    const preset =
      presetId && VIDEO_PRESETS[presetId]
        ? VIDEO_PRESETS[presetId]
        : selection.preset;

    // Warnings
    if (selection.reason) onProgress(`⚠️ ${selection.reason}`);

    // Advice
    const advice = evaluateRequest({
      type: "video",
      mode,
      width: preset.width,
      height: preset.height,
      steps: 0,
      promptHint: prompt,
      hw: hardware,
    });
    const blocked = advice.find((a) => a.level === AdviceLevel.BLOCKED);
    if (blocked) {
      return [
        {
          name: "Blocked",
          description: blocked.message,
          content: blocked.action ? `Suggestion: ${blocked.action}` : "",
        },
      ];
    }

    // Permission
    const dir = ensureArtifactDir(workspaceDir, "videos");
    const perm = await permissions.gate(MediaPermission.GENERATE_VIDEO, {
      prompt,
      seed,
      modelId: preset.model,
      presetId: preset.id,
      outputPath: dir,
      modelSizeMB: preset.modelSizeMB,
      requiresDownload: true,
      outputDir: dir,
    });
    if (!perm.allowed) {
      return [
        { name: "Permission Denied", description: perm.reason, content: "" },
      ];
    }

    onProgress(
      `🎬 Generating ${preset.durationSeconds}s video with ${preset.label} preset…`,
    );
    onProgress(`⏱️ Estimated time: ${preset.estimatedTime}`);

    const outFile = uniqueName("mp4");
    const outPath = path.join(dir, outFile);
    const device = hardware.cudaAvailable
      ? "cuda"
      : hardware.mpsAvailable
        ? "mps"
        : "cpu";
    const jobId = crypto.randomBytes(8).toString("hex");

    try {
      const result = await client.generateVideo({
        prompt,
        model_id: preset.model,
        duration_seconds: preset.durationSeconds,
        fps: preset.fps,
        width: preset.width,
        height: preset.height,
        seed,
        out_path: outPath,
        device,
        job_id: jobId,
      });

      if (result.success) {
        onProgress(
          `✅ Video saved: ${outFile} (${result.time_seconds?.toFixed(1)}s)`,
        );
        return [
          {
            name: "Generated Video",
            description: `${preset.label} — ${preset.durationSeconds}s @ ${preset.fps}fps`,
            content: outPath,
            uri: { type: "file", value: outPath },
          },
        ];
      }

      if (
        result.error?.includes("out of memory") ||
        result.error?.includes("OOM")
      ) {
        const recovery = oomRecoveryAdvice(hardware);
        onProgress(`⚠️ ${recovery.message}`);
        return [{ name: "Error", description: recovery.message, content: "" }];
      }

      return [
        {
          name: "Error",
          description: result.error || "Video generation failed",
          content: "",
        },
      ];
    } catch (err) {
      if (err.message === "Request aborted") {
        return [
          {
            name: "Cancelled",
            description: "Video generation was cancelled.",
            content: "",
          },
        ];
      }
      return [
        {
          name: "Error",
          description: `Video generation failed: ${err.message}`,
          content: "",
        },
      ];
    }
  }

  // ── media.image_to_video ────────────────────────────────
  async function imageToVideo(parameters, extras) {
    const {
      image_path,
      prompt = "",
      preset: presetId,
      seed = Math.floor(Math.random() * 2147483647),
    } = parameters;
    const workspaceDir = extras?.workspaceDir;

    if (!image_path) {
      return [
        {
          name: "Error",
          description: "An input image path is required.",
          content: "",
        },
      ];
    }

    // Validate image_path is inside workspace
    const resolvedImage = path.resolve(image_path);
    const resolvedWorkspace = path.resolve(workspaceDir);
    if (!resolvedImage.startsWith(resolvedWorkspace)) {
      return [
        {
          name: "Error",
          description: "Input image must be inside the workspace.",
          content: "",
        },
      ];
    }
    if (!fs.existsSync(resolvedImage)) {
      return [
        {
          name: "Error",
          description: `Input image not found: ${image_path}`,
          content: "",
        },
      ];
    }

    const selection = autoSelectVideoPreset(mode, hardware);
    if (selection.blocked) {
      return [{ name: "Blocked", description: selection.reason, content: "" }];
    }
    const preset =
      presetId && VIDEO_PRESETS[presetId]
        ? VIDEO_PRESETS[presetId]
        : selection.preset;

    const dir = ensureArtifactDir(workspaceDir, "videos");
    const perm = await permissions.gate(MediaPermission.IMAGE_TO_VIDEO, {
      prompt,
      seed,
      modelId: preset.model,
      presetId: preset.id,
      outputPath: dir,
      modelSizeMB: preset.modelSizeMB,
      requiresDownload: true,
      outputDir: dir,
    });
    if (!perm.allowed) {
      return [
        { name: "Permission Denied", description: perm.reason, content: "" },
      ];
    }

    onProgress(`🎬 Converting image to ${preset.durationSeconds}s video…`);

    const outFile = uniqueName("mp4");
    const outPath = path.join(dir, outFile);
    const device = hardware.cudaAvailable
      ? "cuda"
      : hardware.mpsAvailable
        ? "mps"
        : "cpu";
    const jobId = crypto.randomBytes(8).toString("hex");

    try {
      const result = await client.generateVideo({
        prompt,
        model_id: preset.model,
        input_image_path: resolvedImage,
        duration_seconds: preset.durationSeconds,
        fps: preset.fps,
        width: preset.width,
        height: preset.height,
        seed,
        out_path: outPath,
        device,
        job_id: jobId,
      });

      if (result.success) {
        onProgress(`✅ Video saved: ${outFile}`);
        return [
          {
            name: "Image-to-Video",
            description: `${preset.label} — ${preset.durationSeconds}s from image`,
            content: outPath,
            uri: { type: "file", value: outPath },
          },
        ];
      }
      return [
        {
          name: "Error",
          description: result.error || "Image-to-video failed",
          content: "",
        },
      ];
    } catch (err) {
      if (err.message === "Request aborted") {
        return [
          {
            name: "Cancelled",
            description: "Generation was cancelled.",
            content: "",
          },
        ];
      }
      return [
        {
          name: "Error",
          description: `Image-to-video failed: ${err.message}`,
          content: "",
        },
      ];
    }
  }

  // ── Cancel helper ───────────────────────────────────────
  function cancelGeneration(jobId) {
    return client.cancelJob(jobId);
  }

  return {
    "media.render_diagram": renderDiagram,
    "media.generate_image": generateImage,
    "media.generate_video": generateVideo,
    "media.image_to_video": imageToVideo,
    cancelGeneration,
  };
}

module.exports = { createMediaTools, ensureArtifactDir };
