/** Images tab: prompt, neg prompt, preset, advanced options, generate. */
import { useState } from "react";

import { mediaInvoke } from "./media-api";
import type { HardwareInfo, MediaMode, MediaResult } from "./media-types";

interface MediaImagesTabProps {
  hardware: HardwareInfo | null;
  mode: MediaMode;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setProgress: (v: string) => void;
  setError: (v: string) => void;
  addToGallery: (item: MediaResult) => void;
}

export function MediaImagesTab({
  hardware,
  mode,
  loading,
  setLoading,
  setProgress,
  setError,
  addToGallery,
}: MediaImagesTabProps) {
  const [prompt, setPrompt] = useState("");
  const [negPrompt, setNegPrompt] = useState("");
  const [preset, setPreset] = useState("auto");
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [steps, setSteps] = useState(4);
  const [seed, setSeed] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const generateImage = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setProgress("Generating image...");
    setError("");
    try {
      const params: any = {
        prompt,
        negative_prompt: negPrompt,
        width,
        height,
        steps,
      };
      if (preset !== "auto") params.preset = preset;
      if (seed) params.seed = parseInt(seed, 10);

      const result = await mediaInvoke("media:generateImage", params);
      if (result?.success) {
        addToGallery({
          path: result.path,
          type: "image",
          preset: result.model_id,
          time_seconds: result.time_seconds,
          seed: result.seed,
          timestamp: Date.now(),
        });
        setProgress(
          `Image generated (${result.time_seconds?.toFixed(1)}s, seed=${result.seed})`,
        );
      } else {
        setError(result?.error ?? "Image generation failed");
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="media-panel__section">
      <textarea
        className="media-panel__prompt"
        placeholder="Describe the image you want to generate..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
      />
      <textarea
        className="media-panel__prompt media-panel__prompt--neg"
        placeholder="Negative prompt (things to avoid)..."
        value={negPrompt}
        onChange={(e) => setNegPrompt(e.target.value)}
        rows={2}
      />
      <div className="form-row">
        <label>Preset:</label>
        <select
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value);
            if (e.target.value === "CPU_FAST") {
              setWidth(512);
              setHeight(512);
              setSteps(4);
            }
            if (e.target.value === "CPU_BALANCED") {
              setWidth(512);
              setHeight(512);
              setSteps(20);
            }
            if (e.target.value === "GPU_HIGH") {
              setWidth(1024);
              setHeight(1024);
              setSteps(30);
            }
          }}
        >
          <option value="auto">Auto (recommended)</option>
          <option value="CPU_FAST">
            CPU Fast (SD Turbo, 512x512, 4 steps)
          </option>
          <option value="CPU_BALANCED">
            CPU Balanced (SD 1.5, 512x512, 20 steps)
          </option>
          <option value="GPU_HIGH" disabled={!hardware?.gpuAvailable}>
            GPU High (SDXL, 1024x1024, 30 steps)
          </option>
        </select>
      </div>

      <button
        className="btn btn--link"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? "Hide" : "Show"} Advanced Options
      </button>

      {showAdvanced && (
        <div className="media-panel__advanced">
          <div className="form-row">
            <label>Width:</label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              min={256}
              max={2048}
              step={64}
            />
            <label>Height:</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              min={256}
              max={2048}
              step={64}
            />
          </div>
          <div className="form-row">
            <label>Steps:</label>
            <input
              type="number"
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              min={1}
              max={100}
            />
            <label>Seed:</label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="Random"
            />
          </div>
        </div>
      )}

      <button
        className="btn btn--primary"
        onClick={generateImage}
        disabled={loading || !prompt.trim()}
      >
        Generate Image
      </button>

      {!hardware?.gpuAvailable && mode === "auto" && (
        <div className="media-panel__hint">
          No GPU detected. Images will use CPU (SD Turbo preset for speed).
          <br />
          For higher quality, install a CUDA-compatible GPU with 4GB+ VRAM.
        </div>
      )}
    </div>
  );
}
