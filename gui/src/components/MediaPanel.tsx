/**
 * CodeIn Media Panel
 *
 * UI for the Media Toolkit:
 * - Diagrams (Mermaid / PlantUML / D2) — CPU only
 * - Images (Stable Diffusion) — CPU fast / GPU high quality
 * - Videos (SVD) — GPU required
 * - Hardware info, mode toggle, presets, progress, gallery
 */
import { useCallback, useEffect, useState } from "react";
import "./MediaPanel.css";

// ─── Types ───────────────────────────────────────────────
interface HardwareInfo {
  gpuAvailable: boolean;
  gpuVendor: string;
  gpuName: string;
  vramGB: number;
  vramTier: string;
  cudaAvailable: boolean;
  mpsAvailable: boolean;
  cpuName: string;
  ramGB: number;
}

interface ModelEntry {
  model_id: string;
  label: string;
  type: string;
  size_mb: number;
  downloaded: boolean;
  size_on_disk_mb: number;
  loaded: boolean;
}

interface MediaResult {
  path: string;
  type: "image" | "video" | "diagram";
  preset?: string;
  time_seconds?: number;
  seed?: number;
  timestamp: number;
}

type MediaTab = "diagrams" | "images" | "videos";
type MediaMode = "auto" | "cpu_only" | "gpu_only";

// ─── IPC bridge ──────────────────────────────────────────
const ipc = (window as any).electron?.ipcRenderer;

async function mediaInvoke(channel: string, ...args: any[]): Promise<any> {
  if (ipc) {
    return ipc.invoke(channel, ...args);
  }
  // Fallback for web dev mode: direct HTTP to media service
  const MEDIA_BASE = "http://127.0.0.1:43130";
  const endpointMap: Record<string, string> = {
    "media:health": "/health",
    "media:modelsStatus": "/models/status",
    "media:generateImage": "/generate/image",
    "media:generateVideo": "/generate/video",
    "media:renderDiagram": "/generate/diagram",
  };
  const endpoint = endpointMap[channel];
  if (!endpoint) throw new Error(`Unknown channel: ${channel}`);
  const method = args.length > 0 ? "POST" : "GET";
  const res = await fetch(`${MEDIA_BASE}${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: args.length > 0 ? JSON.stringify(args[0]) : undefined,
  });
  return res.json();
}

// ─── Component ───────────────────────────────────────────
export default function MediaPanel() {
  const [tab, setTab] = useState<MediaTab>("diagrams");
  const [mode, setMode] = useState<MediaMode>("auto");
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [serviceReady, setServiceReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [gallery, setGallery] = useState<MediaResult[]>([]);

  // Diagram state
  const [diagramEngine, setDiagramEngine] = useState<string>("mermaid");
  const [diagramSource, setDiagramSource] = useState<string>("");
  const [diagramFormat, setDiagramFormat] = useState<string>("svg");

  // Image state
  const [imagePrompt, setImagePrompt] = useState<string>("");
  const [imageNegPrompt, setImageNegPrompt] = useState<string>("");
  const [imagePreset, setImagePreset] = useState<string>("auto");
  const [imageWidth, setImageWidth] = useState<number>(512);
  const [imageHeight, setImageHeight] = useState<number>(512);
  const [imageSteps, setImageSteps] = useState<number>(4);
  const [imageSeed, setImageSeed] = useState<string>("");
  const [showImageAdvanced, setShowImageAdvanced] = useState(false);

  // Video state
  const [videoPrompt, setVideoPrompt] = useState<string>("");
  const [videoPreset, setVideoPreset] = useState<string>("auto");
  const [videoSeed, setVideoSeed] = useState<string>("");

  // ─── Lifecycle ─────────────────────────────────────────
  const checkService = useCallback(async () => {
    try {
      const result = await mediaInvoke("media:health");
      setServiceReady(result?.status === "ok");
      if (result?.gpu) {
        setHardware({
          gpuAvailable: result.gpu.available ?? false,
          gpuVendor: result.gpu.backend ?? "none",
          gpuName: result.gpu.name ?? "Unknown",
          vramGB: result.gpu.vram_gb ?? 0,
          vramTier:
            result.gpu.vram_gb > 16
              ? "ULTRA"
              : result.gpu.vram_gb > 8
                ? "HIGH"
                : result.gpu.vram_gb > 4
                  ? "MEDIUM"
                  : "LOW",
          cudaAvailable: result.gpu.backend === "cuda",
          mpsAvailable: result.gpu.backend === "mps",
          cpuName: "",
          ramGB: result.memory_total_gb ?? 0,
        });
      }
    } catch {
      setServiceReady(false);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const result = await mediaInvoke("media:modelsStatus");
      setModels(result?.models ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkService();
    fetchModels();
    const interval = setInterval(checkService, 10000);
    return () => clearInterval(interval);
  }, [checkService, fetchModels]);

  // ─── Actions ───────────────────────────────────────────
  const startService = async () => {
    setLoading(true);
    setError("");
    try {
      await mediaInvoke("media:startService");
      await checkService();
      await fetchModels();
    } catch (e: any) {
      setError(e.message ?? "Failed to start media service");
    }
    setLoading(false);
  };

  const generateDiagram = async () => {
    if (!diagramSource.trim()) return;
    setLoading(true);
    setProgress("Rendering diagram…");
    setError("");
    try {
      const result = await mediaInvoke("media:renderDiagram", {
        engine: diagramEngine,
        source: diagramSource,
        format: diagramFormat,
      });
      if (result?.success) {
        setGallery((prev) => [
          {
            path: result.path,
            type: "diagram",
            time_seconds: 0,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
        setProgress("✅ Diagram rendered");
      } else {
        setError(result?.error ?? "Diagram rendering failed");
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const generateImage = async () => {
    if (!imagePrompt.trim()) return;
    setLoading(true);
    setProgress("Generating image…");
    setError("");
    try {
      const params: any = {
        prompt: imagePrompt,
        negative_prompt: imageNegPrompt,
        width: imageWidth,
        height: imageHeight,
        steps: imageSteps,
      };
      if (imagePreset !== "auto") params.preset = imagePreset;
      if (imageSeed) params.seed = parseInt(imageSeed, 10);

      const result = await mediaInvoke("media:generateImage", params);
      if (result?.success) {
        setGallery((prev) => [
          {
            path: result.path,
            type: "image",
            preset: result.model_id,
            time_seconds: result.time_seconds,
            seed: result.seed,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
        setProgress(
          `✅ Image generated (${result.time_seconds?.toFixed(1)}s, seed=${result.seed})`,
        );
      } else {
        setError(result?.error ?? "Image generation failed");
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const generateVideo = async () => {
    if (!videoPrompt.trim()) return;
    setLoading(true);
    setProgress("Generating video (this may take several minutes)…");
    setError("");
    try {
      const params: any = { prompt: videoPrompt };
      if (videoPreset !== "auto") params.preset = videoPreset;
      if (videoSeed) params.seed = parseInt(videoSeed, 10);

      const result = await mediaInvoke("media:generateVideo", params);
      if (result?.success) {
        setGallery((prev) => [
          {
            path: result.path,
            type: "video",
            preset: result.model_id,
            time_seconds: result.time_seconds,
            seed: result.seed,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
        setProgress(`✅ Video generated (${result.time_seconds?.toFixed(1)}s)`);
      } else {
        setError(result?.error ?? "Video generation failed");
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const downloadModel = async (modelId: string) => {
    setLoading(true);
    setProgress(`Downloading ${modelId}…`);
    try {
      await mediaInvoke("media:downloadModel", modelId);
      await fetchModels();
      setProgress(`✅ ${modelId} downloaded`);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const deleteModel = async (modelId: string) => {
    try {
      await mediaInvoke("media:deleteModel", modelId);
      await fetchModels();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ─── Render ────────────────────────────────────────────
  return (
    <div className="media-panel">
      <div className="media-panel__header">
        <h2>🎨 Media Toolkit</h2>
        <div className="media-panel__status">
          <span
            className={`status-dot ${serviceReady ? "status-dot--ok" : "status-dot--off"}`}
          />
          <span>{serviceReady ? "Service Running" : "Service Offline"}</span>
          {!serviceReady && (
            <button
              className="btn btn--sm"
              onClick={startService}
              disabled={loading}
            >
              Start Service
            </button>
          )}
        </div>
      </div>

      {/* Hardware Info Bar */}
      {hardware && (
        <div className="media-panel__hw-bar">
          <span>
            {hardware.gpuAvailable
              ? `🟢 GPU: ${hardware.gpuName} (${hardware.vramGB}GB VRAM)`
              : "🟡 CPU Only"}
          </span>
          <span>RAM: {hardware.ramGB}GB</span>
          <div className="media-panel__mode-toggle">
            <label>Mode:</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as MediaMode)}
            >
              <option value="auto">Auto</option>
              <option value="cpu_only">CPU Only</option>
              <option value="gpu_only" disabled={!hardware.gpuAvailable}>
                GPU Only
              </option>
            </select>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="media-panel__tabs">
        <button
          className={`tab ${tab === "diagrams" ? "tab--active" : ""}`}
          onClick={() => setTab("diagrams")}
        >
          📊 Diagrams
        </button>
        <button
          className={`tab ${tab === "images" ? "tab--active" : ""}`}
          onClick={() => setTab("images")}
        >
          🖼️ Images
        </button>
        <button
          className={`tab ${tab === "videos" ? "tab--active" : ""}`}
          onClick={() => setTab("videos")}
        >
          🎬 Videos
        </button>
      </div>

      {/* Tab Content */}
      <div className="media-panel__content">
        {/* ── Diagrams ───────────────────────── */}
        {tab === "diagrams" && (
          <div className="media-panel__section">
            <div className="form-row">
              <label>Engine:</label>
              <select
                value={diagramEngine}
                onChange={(e) => setDiagramEngine(e.target.value)}
              >
                <option value="mermaid">Mermaid</option>
                <option value="plantuml">PlantUML</option>
                <option value="d2">D2</option>
              </select>
              <select
                value={diagramFormat}
                onChange={(e) => setDiagramFormat(e.target.value)}
              >
                <option value="svg">SVG</option>
                <option value="png">PNG</option>
              </select>
            </div>
            <textarea
              className="media-panel__source"
              placeholder={`graph TD\n  A[Start] --> B[End]`}
              value={diagramSource}
              onChange={(e) => setDiagramSource(e.target.value)}
              rows={8}
            />
            <button
              className="btn btn--primary"
              onClick={generateDiagram}
              disabled={loading || !diagramSource.trim()}
            >
              Render Diagram
            </button>
          </div>
        )}

        {/* ── Images ─────────────────────────── */}
        {tab === "images" && (
          <div className="media-panel__section">
            <textarea
              className="media-panel__prompt"
              placeholder="Describe the image you want to generate…"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={3}
            />
            <textarea
              className="media-panel__prompt media-panel__prompt--neg"
              placeholder="Negative prompt (things to avoid)…"
              value={imageNegPrompt}
              onChange={(e) => setImageNegPrompt(e.target.value)}
              rows={2}
            />
            <div className="form-row">
              <label>Preset:</label>
              <select
                value={imagePreset}
                onChange={(e) => {
                  setImagePreset(e.target.value);
                  if (e.target.value === "CPU_FAST") {
                    setImageWidth(512);
                    setImageHeight(512);
                    setImageSteps(4);
                  }
                  if (e.target.value === "CPU_BALANCED") {
                    setImageWidth(512);
                    setImageHeight(512);
                    setImageSteps(20);
                  }
                  if (e.target.value === "GPU_HIGH") {
                    setImageWidth(1024);
                    setImageHeight(1024);
                    setImageSteps(30);
                  }
                }}
              >
                <option value="auto">Auto (recommended)</option>
                <option value="CPU_FAST">
                  CPU Fast (SD Turbo, 512×512, 4 steps)
                </option>
                <option value="CPU_BALANCED">
                  CPU Balanced (SD 1.5, 512×512, 20 steps)
                </option>
                <option value="GPU_HIGH" disabled={!hardware?.gpuAvailable}>
                  GPU High (SDXL, 1024×1024, 30 steps)
                </option>
              </select>
            </div>

            <button
              className="btn btn--link"
              onClick={() => setShowImageAdvanced(!showImageAdvanced)}
            >
              {showImageAdvanced ? "Hide" : "Show"} Advanced Options
            </button>

            {showImageAdvanced && (
              <div className="media-panel__advanced">
                <div className="form-row">
                  <label>Width:</label>
                  <input
                    type="number"
                    value={imageWidth}
                    onChange={(e) => setImageWidth(Number(e.target.value))}
                    min={256}
                    max={2048}
                    step={64}
                  />
                  <label>Height:</label>
                  <input
                    type="number"
                    value={imageHeight}
                    onChange={(e) => setImageHeight(Number(e.target.value))}
                    min={256}
                    max={2048}
                    step={64}
                  />
                </div>
                <div className="form-row">
                  <label>Steps:</label>
                  <input
                    type="number"
                    value={imageSteps}
                    onChange={(e) => setImageSteps(Number(e.target.value))}
                    min={1}
                    max={100}
                  />
                  <label>Seed:</label>
                  <input
                    type="text"
                    value={imageSeed}
                    onChange={(e) => setImageSeed(e.target.value)}
                    placeholder="Random"
                  />
                </div>
              </div>
            )}

            <button
              className="btn btn--primary"
              onClick={generateImage}
              disabled={loading || !imagePrompt.trim()}
            >
              Generate Image
            </button>

            {!hardware?.gpuAvailable && mode === "auto" && (
              <div className="media-panel__hint">
                💡 No GPU detected. Images will use CPU (SD Turbo preset for
                speed).
                <br />
                For higher quality, install a CUDA-compatible GPU with ≥4GB
                VRAM.
              </div>
            )}
          </div>
        )}

        {/* ── Videos ─────────────────────────── */}
        {tab === "videos" && (
          <div className="media-panel__section">
            {hardware?.gpuAvailable ? (
              <>
                <textarea
                  className="media-panel__prompt"
                  placeholder="Describe the video you want to generate…"
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  rows={3}
                />
                <div className="form-row">
                  <label>Preset:</label>
                  <select
                    value={videoPreset}
                    onChange={(e) => setVideoPreset(e.target.value)}
                  >
                    <option value="auto">Auto</option>
                    <option value="GPU_SHORT">Short (4s, 576×320)</option>
                    <option value="GPU_STANDARD">Standard (8s, 576×320)</option>
                  </select>
                  <label>Seed:</label>
                  <input
                    type="text"
                    value={videoSeed}
                    onChange={(e) => setVideoSeed(e.target.value)}
                    placeholder="Random"
                  />
                </div>
                <button
                  className="btn btn--primary"
                  onClick={generateVideo}
                  disabled={loading || !videoPrompt.trim()}
                >
                  Generate Video
                </button>
              </>
            ) : (
              <div className="media-panel__blocked">
                <h3>🚫 GPU Required for Video Generation</h3>
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
        )}
      </div>

      {/* Progress & Error */}
      {progress && <div className="media-panel__progress">{progress}</div>}
      {error && <div className="media-panel__error">❌ {error}</div>}
      {loading && <div className="media-panel__spinner">⏳ Processing…</div>}

      {/* Model Management */}
      <details className="media-panel__models">
        <summary>
          📦 Models ({models.filter((m) => m.downloaded).length}/{models.length}{" "}
          downloaded)
        </summary>
        <div className="media-panel__model-list">
          {models.map((m) => (
            <div key={m.model_id} className="media-panel__model-row">
              <span className="model-label">{m.label}</span>
              <span className="model-type">{m.type}</span>
              <span className="model-size">{m.size_mb}MB</span>
              {m.downloaded ? (
                <>
                  <span className="model-status model-status--ok">
                    ✅ Downloaded
                  </span>
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={() => deleteModel(m.model_id)}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <span className="model-status model-status--missing">
                    Not downloaded
                  </span>
                  <button
                    className="btn btn--sm"
                    onClick={() => downloadModel(m.model_id)}
                  >
                    Download
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </details>

      {/* Output Gallery */}
      {gallery.length > 0 && (
        <div className="media-panel__gallery">
          <h3>📁 Generated Outputs</h3>
          {gallery.map((item, i) => (
            <div key={i} className="media-panel__gallery-item">
              <span className="gallery-icon">
                {item.type === "diagram"
                  ? "📊"
                  : item.type === "image"
                    ? "🖼️"
                    : "🎬"}
              </span>
              <span className="gallery-path" title={item.path}>
                {item.path.split(/[/\\]/).slice(-2).join("/")}
              </span>
              {item.time_seconds !== undefined && (
                <span className="gallery-time">
                  {item.time_seconds.toFixed(1)}s
                </span>
              )}
              {item.seed !== undefined && (
                <span className="gallery-seed">seed={item.seed}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
