/**
 * CodeIn Media Panel
 *
 * UI for the Media Toolkit:
 * - Diagrams (Mermaid / PlantUML / D2) -- CPU only
 * - Images (Stable Diffusion) -- CPU fast / GPU high quality
 * - Videos (SVD) -- GPU required
 * - Hardware info, mode toggle, presets, progress, gallery
 */
import { useState } from "react";

import { MediaDiagramsTab } from "./MediaDiagramsTab";
import { MediaGallery } from "./MediaGallery";
import { MediaHardwareBar } from "./MediaHardwareBar";
import { MediaHeader } from "./MediaHeader";
import { MediaImagesTab } from "./MediaImagesTab";
import { MediaModelManager } from "./MediaModelManager";
import { MediaStatusBar } from "./MediaStatusBar";
import { MediaVideosTab } from "./MediaVideosTab";
import type { MediaMode, MediaTab } from "./media-types";
import { useMediaService } from "./useMediaService";
import "./MediaPanel.css";

export default function MediaPanel() {
  const [tab, setTab] = useState<MediaTab>("diagrams");
  const [mode, setMode] = useState<MediaMode>("auto");

  const svc = useMediaService();

  return (
    <div className="media-panel">
      <MediaHeader
        serviceReady={svc.serviceReady}
        loading={svc.loading}
        onStartService={svc.startService}
      />

      {svc.hardware && (
        <MediaHardwareBar
          hardware={svc.hardware}
          mode={mode}
          onModeChange={setMode}
        />
      )}

      {/* Tabs */}
      <div className="media-panel__tabs">
        <button
          className={`tab ${tab === "diagrams" ? "tab--active" : ""}`}
          onClick={() => setTab("diagrams")}
        >
          Diagrams
        </button>
        <button
          className={`tab ${tab === "images" ? "tab--active" : ""}`}
          onClick={() => setTab("images")}
        >
          Images
        </button>
        <button
          className={`tab ${tab === "videos" ? "tab--active" : ""}`}
          onClick={() => setTab("videos")}
        >
          Videos
        </button>
      </div>

      {/* Tab Content */}
      <div className="media-panel__content">
        {tab === "diagrams" && (
          <MediaDiagramsTab
            loading={svc.loading}
            setLoading={svc.setLoading}
            setProgress={svc.setProgress}
            setError={svc.setError}
            addToGallery={svc.addToGallery}
          />
        )}
        {tab === "images" && (
          <MediaImagesTab
            hardware={svc.hardware}
            mode={mode}
            loading={svc.loading}
            setLoading={svc.setLoading}
            setProgress={svc.setProgress}
            setError={svc.setError}
            addToGallery={svc.addToGallery}
          />
        )}
        {tab === "videos" && (
          <MediaVideosTab
            hardware={svc.hardware}
            loading={svc.loading}
            setLoading={svc.setLoading}
            setProgress={svc.setProgress}
            setError={svc.setError}
            addToGallery={svc.addToGallery}
          />
        )}
      </div>

      <MediaStatusBar
        progress={svc.progress}
        error={svc.error}
        loading={svc.loading}
      />

      <MediaModelManager
        models={svc.models}
        onDownload={svc.downloadModel}
        onDelete={svc.deleteModel}
      />

      <MediaGallery gallery={svc.gallery} />
    </div>
  );
}
