/** Diagrams tab: engine select, source textarea, render button. */
import { useState } from "react";

import { mediaInvoke } from "./media-api";
import type { MediaResult } from "./media-types";

interface MediaDiagramsTabProps {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setProgress: (v: string) => void;
  setError: (v: string) => void;
  addToGallery: (item: MediaResult) => void;
}

export function MediaDiagramsTab({
  loading,
  setLoading,
  setProgress,
  setError,
  addToGallery,
}: MediaDiagramsTabProps) {
  const [engine, setEngine] = useState("mermaid");
  const [source, setSource] = useState("");
  const [format, setFormat] = useState("svg");

  const generateDiagram = async () => {
    if (!source.trim()) return;
    setLoading(true);
    setProgress("Rendering diagram...");
    setError("");
    try {
      const result = await mediaInvoke("media:renderDiagram", {
        engine,
        source,
        format,
      });
      if (result?.success) {
        addToGallery({
          path: result.path,
          type: "diagram",
          time_seconds: 0,
          timestamp: Date.now(),
        });
        setProgress("Diagram rendered");
      } else {
        setError(result?.error ?? "Diagram rendering failed");
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="media-panel__section">
      <div className="form-row">
        <label>Engine:</label>
        <select value={engine} onChange={(e) => setEngine(e.target.value)}>
          <option value="mermaid">Mermaid</option>
          <option value="plantuml">PlantUML</option>
          <option value="d2">D2</option>
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="svg">SVG</option>
          <option value="png">PNG</option>
        </select>
      </div>
      <textarea
        className="media-panel__source"
        placeholder={`graph TD\n  A[Start] --> B[End]`}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        rows={8}
      />
      <button
        className="btn btn--primary"
        onClick={generateDiagram}
        disabled={loading || !source.trim()}
      >
        Render Diagram
      </button>
    </div>
  );
}
