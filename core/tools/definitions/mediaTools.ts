import { Tool } from "../..";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

export const renderDiagramTool: Tool = {
  type: "function",
  displayTitle: "Render Diagram",
  wouldLikeTo: "render a {{{ engine }}} diagram",
  isCurrently: "rendering a {{{ engine }}} diagram",
  hasAlready: "rendered a {{{ engine }}} diagram",
  group: BUILT_IN_GROUP_NAME,
  readonly: false,
  isInstant: false,
  function: {
    name: BuiltInToolNames.RenderDiagram,
    description:
      "Render a diagram from source code (Mermaid, PlantUML, or D2) to SVG or PNG. " +
      "CPU-only, no GPU needed. Output saved to artifacts/media/diagrams/.",
    parameters: {
      type: "object",
      required: ["source"],
      properties: {
        source: {
          type: "string",
          description: "Diagram source code in Mermaid, PlantUML, or D2 syntax",
        },
        engine: {
          type: "string",
          enum: ["mermaid", "plantuml", "d2"],
          description: "Diagram engine to use (default: mermaid)",
        },
        format: {
          type: "string",
          enum: ["svg", "png"],
          description: "Output format (default: svg)",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithPermission",
};

export const generateImageTool: Tool = {
  type: "function",
  displayTitle: "Generate Image",
  wouldLikeTo: "generate an image: {{{ prompt }}}",
  isCurrently: "generating an image",
  hasAlready: "generated an image",
  group: BUILT_IN_GROUP_NAME,
  readonly: false,
  isInstant: false,
  function: {
    name: BuiltInToolNames.GenerateImage,
    description:
      "Generate an image from a text prompt using Stable Diffusion. " +
      "Auto-selects CPU or GPU preset based on hardware. " +
      "Output saved to artifacts/media/images/.",
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
          description: "Things to avoid in the generated image",
        },
        preset: {
          type: "string",
          enum: ["CPU_FAST", "CPU_BALANCED", "GPU_HIGH"],
          description:
            "Quality preset. CPU_FAST (512×512, 4 steps), CPU_BALANCED (512×512, 20 steps), GPU_HIGH (1024×1024, 30 steps). Auto-selected if omitted.",
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
          description: "Number of inference steps (overrides preset)",
        },
        seed: {
          type: "integer",
          description: "Random seed for reproducibility",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithPermission",
};

export const generateVideoTool: Tool = {
  type: "function",
  displayTitle: "Generate Video",
  wouldLikeTo: "generate a video: {{{ prompt }}}",
  isCurrently: "generating a video",
  hasAlready: "generated a video",
  group: BUILT_IN_GROUP_NAME,
  readonly: false,
  isInstant: false,
  function: {
    name: BuiltInToolNames.GenerateVideo,
    description:
      "Generate a short video from a text prompt. " +
      "Requires GPU with ≥8GB VRAM (NVIDIA CUDA or Apple MPS). " +
      "Output saved to artifacts/media/videos/.",
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
          enum: ["GPU_SHORT", "GPU_STANDARD"],
          description:
            "Quality preset. GPU_SHORT (4s), GPU_STANDARD (8s). Auto-selected if omitted.",
        },
        seed: {
          type: "integer",
          description: "Random seed for reproducibility",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithPermission",
};

export const imageToVideoTool: Tool = {
  type: "function",
  displayTitle: "Image to Video",
  wouldLikeTo: "animate image {{{ image_path }}} into a video",
  isCurrently: "animating an image into a video",
  hasAlready: "animated an image into a video",
  group: BUILT_IN_GROUP_NAME,
  readonly: false,
  isInstant: false,
  function: {
    name: BuiltInToolNames.ImageToVideo,
    description:
      "Animate a still image into a short video using Stable Video Diffusion. " +
      "Requires GPU with ≥8GB VRAM. Input image must be inside the workspace. " +
      "Output saved to artifacts/media/videos/.",
    parameters: {
      type: "object",
      required: ["image_path"],
      properties: {
        image_path: {
          type: "string",
          description: "Path to the input image (must be inside workspace)",
        },
        prompt: {
          type: "string",
          description: "Optional motion/style prompt to guide the animation",
        },
        preset: {
          type: "string",
          enum: ["GPU_SHORT", "GPU_STANDARD"],
          description: "Quality preset",
        },
        seed: {
          type: "integer",
          description: "Random seed for reproducibility",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithPermission",
};
