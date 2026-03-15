/** Output gallery list showing generated media items. */
import type { MediaResult } from "./media-types";

interface MediaGalleryProps {
  gallery: MediaResult[];
}

export function MediaGallery({ gallery }: MediaGalleryProps) {
  if (gallery.length === 0) return null;

  const typeIcon = (type: string) => {
    switch (type) {
      case "diagram":
        return "Diagram";
      case "image":
        return "Image";
      case "video":
        return "Video";
      default:
        return "File";
    }
  };

  return (
    <div className="media-panel__gallery">
      <h3>Generated Outputs</h3>
      {gallery.map((item, i) => (
        <div key={i} className="media-panel__gallery-item">
          <span className="gallery-icon">{typeIcon(item.type)}</span>
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
  );
}
