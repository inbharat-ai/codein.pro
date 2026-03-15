/** Videos tab: prompt, preset, seed, GPU requirement warning. */
import { useState } from "react";

import { mediaInvoke } from "./media-api";
import type { HardwareInfo, MediaResult } from "./media-types";

interface MediaVideosTabProps {
  hardware: HardwareInfo | null;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setProgress: (v: string) => void;
  setError: (v: string) => void;
  addToGallery: (item: MediaResult) => void;
}

export function MediaVideosTab({
  hardware,
  loading,
  setLoading,
  setProgress,
  setError,
  addToGallery,
}: MediaVideosTabProps) {
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState("auto");
  const [seed, setSeed] = useState("");

  const generateVideo = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setProgress("Generating video (this may take several minutes)...");
    setError("");
    try {
      const params: any = { prompt };
      if (preset !== "auto") params.preset = preset;
      if (seed) params.seed = parseInt(seed, 10);

      const result = await mediaInvoke("media:generateVideo", params);
      if (result?.success) {
        addToGallery({
          path: result.path,
          type: "video",
          preset: result.model_id,
          time_seconds: result.time_seconds,
          seed: result.seed,
          timestamp: Date.now(),
        });
        setProgress(`Video generated (${result.time_seconds?.toFixed(1)}s)`);
      } else {
        setError(result?.error ?? "Video generation failed");
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="media-panel__section">
      {hardware?.gpuAvailable ? (
        <>
          <textarea
            className="media-panel__prompt"
            placeholder="Describe the video you want to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
          <div className="form-row">
            <label>Preset:</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="auto">Auto</option>
              <option value="GPU_SHORT">Short (4s, 576x320)</option>
              <option value="GPU_STANDARD">Standard (8s, 576x320)</option>
            </select>
            <label>Seed:</label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="Random"
            />
          </div>
          <button
            className="btn btn--primary"
            onClick={generateVideo}
            disabled={loading || !prompt.trim()}
          >
            Generate Video
          </button>
        </>
      ) : (
        <div className="media-panel__blocked">
          <h3>GPU Required for Video Generation</h3>
          <p>
            Video generation requires a GPU with at least 8GB VRAM. No
            compatible GPU was detected on this system.
          </p>
          <ul>
            <li>NVIDIA GPUs: RTX 3060+ recommended (CUDA)</li>
            <li>Apple Silicon: M1 Pro/Max+ recommended (MPS)</li>
          </ul>
        </div>
      )}
    </div>
  );
}
