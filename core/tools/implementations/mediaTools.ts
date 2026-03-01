/**
 * Media tool implementations for the core tool system.
 *
 * These are thin adapters that delegate to the @codein/media toolkit.
 * The actual heavy lifting happens in the Python media service.
 */

import { ContextItem, ToolExtras } from "../..";

/**
 * Render diagram implementation.
 * Delegates to media service via IPC or direct HTTP.
 */
export async function renderDiagramImpl(
  args: { source: string; engine?: string; format?: string },
  extras: ToolExtras,
): Promise<ContextItem[]> {
  const engine = args.engine ?? "mermaid";
  const format = args.format ?? "svg";
  const source = args.source;

  if (!source) {
    return [
      {
        name: "Error",
        description: "Diagram source is required",
        content: "",
      },
    ];
  }

  try {
    // Try IPC first (Electron), then direct HTTP (dev mode)
    const result = await callMediaService("/generate/diagram", {
      engine,
      source,
      format,
    });

    if (result?.success) {
      return [
        {
          name: "Diagram",
          description: `${engine} diagram rendered to ${format.toUpperCase()}`,
          content: result.path ?? "Diagram rendered successfully",
          uri: result.path ? { type: "file", value: result.path } : undefined,
        },
      ];
    }

    return [
      {
        name: "Error",
        description: result?.error ?? "Diagram rendering failed",
        content: "",
      },
    ];
  } catch (err: any) {
    return [
      {
        name: "Error",
        description: `Diagram rendering failed: ${err.message}`,
        content: "",
      },
    ];
  }
}

/**
 * Generate image implementation.
 */
export async function generateImageImpl(
  args: {
    prompt: string;
    negative_prompt?: string;
    preset?: string;
    width?: number;
    height?: number;
    steps?: number;
    seed?: number;
  },
  extras: ToolExtras,
): Promise<ContextItem[]> {
  if (!args.prompt) {
    return [
      {
        name: "Error",
        description: "A text prompt is required for image generation",
        content: "",
      },
    ];
  }

  try {
    const result = await callMediaService("/generate/image", {
      prompt: args.prompt,
      negative_prompt: args.negative_prompt ?? "",
      width: args.width ?? 512,
      height: args.height ?? 512,
      steps: args.steps ?? 4,
      seed: args.seed ?? Math.floor(Math.random() * 2147483647),
    });

    if (result?.success) {
      return [
        {
          name: "Generated Image",
          description: `Image generated (${result.width}×${result.height}, ${result.steps} steps, seed=${result.seed})`,
          content: result.path ?? "Image generated successfully",
          uri: result.path ? { type: "file", value: result.path } : undefined,
        },
      ];
    }

    return [
      {
        name: "Error",
        description: result?.error ?? "Image generation failed",
        content: "",
      },
    ];
  } catch (err: any) {
    return [
      {
        name: "Error",
        description: `Image generation failed: ${err.message}`,
        content: "",
      },
    ];
  }
}

/**
 * Generate video implementation.
 */
export async function generateVideoImpl(
  args: { prompt: string; preset?: string; seed?: number },
  extras: ToolExtras,
): Promise<ContextItem[]> {
  if (!args.prompt) {
    return [
      {
        name: "Error",
        description: "A text prompt is required for video generation",
        content: "",
      },
    ];
  }

  try {
    const result = await callMediaService("/generate/video", {
      prompt: args.prompt,
      seed: args.seed ?? Math.floor(Math.random() * 2147483647),
    });

    if (result?.success) {
      return [
        {
          name: "Generated Video",
          description: `Video generated (${result.duration_seconds}s, ${result.fps}fps)`,
          content: result.path ?? "Video generated successfully",
          uri: result.path ? { type: "file", value: result.path } : undefined,
        },
      ];
    }

    return [
      {
        name: "Error",
        description: result?.error ?? "Video generation failed",
        content: "",
      },
    ];
  } catch (err: any) {
    return [
      {
        name: "Error",
        description: `Video generation failed: ${err.message}`,
        content: "",
      },
    ];
  }
}

/**
 * Image to video implementation.
 */
export async function imageToVideoImpl(
  args: { image_path: string; prompt?: string; preset?: string; seed?: number },
  extras: ToolExtras,
): Promise<ContextItem[]> {
  if (!args.image_path) {
    return [
      {
        name: "Error",
        description: "An input image path is required",
        content: "",
      },
    ];
  }

  try {
    const result = await callMediaService("/generate/video", {
      prompt: args.prompt ?? "",
      input_image_path: args.image_path,
      seed: args.seed ?? Math.floor(Math.random() * 2147483647),
    });

    if (result?.success) {
      return [
        {
          name: "Image to Video",
          description: `Video created from image (${result.duration_seconds}s)`,
          content: result.path ?? "Video created successfully",
          uri: result.path ? { type: "file", value: result.path } : undefined,
        },
      ];
    }

    return [
      {
        name: "Error",
        description: result?.error ?? "Image-to-video conversion failed",
        content: "",
      },
    ];
  } catch (err: any) {
    return [
      {
        name: "Error",
        description: `Image-to-video failed: ${err.message}`,
        content: "",
      },
    ];
  }
}

/**
 * Helper: call the local media service via HTTP.
 * The service runs at 127.0.0.1:43130.
 */
async function callMediaService(
  endpoint: string,
  body: Record<string, any>,
): Promise<any> {
  const baseUrl = "http://127.0.0.1:43130";
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000), // 10-minute timeout
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Media service error ${response.status}: ${text}`);
  }

  return response.json();
}
