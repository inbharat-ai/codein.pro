/** Collapsible model list with download/delete actions. */
import type { ModelEntry } from "./media-types";

interface MediaModelManagerProps {
  models: ModelEntry[];
  onDownload: (modelId: string) => void;
  onDelete: (modelId: string) => void;
}

export function MediaModelManager({
  models,
  onDownload,
  onDelete,
}: MediaModelManagerProps) {
  return (
    <details className="media-panel__models">
      <summary>
        Models ({models.filter((m) => m.downloaded).length}/{models.length}{" "}
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
                  Downloaded
                </span>
                <button
                  className="btn btn--sm btn--danger"
                  onClick={() => onDelete(m.model_id)}
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
                  onClick={() => onDownload(m.model_id)}
                >
                  Download
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
