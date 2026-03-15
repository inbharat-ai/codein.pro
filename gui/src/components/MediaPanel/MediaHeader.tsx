/** Media Toolkit header: title + service status + start button. */

interface MediaHeaderProps {
  serviceReady: boolean;
  loading: boolean;
  onStartService: () => void;
}

export function MediaHeader({
  serviceReady,
  loading,
  onStartService,
}: MediaHeaderProps) {
  return (
    <div className="media-panel__header">
      <h2>Media Toolkit</h2>
      <div className="media-panel__status">
        <span
          className={`status-dot ${serviceReady ? "status-dot--ok" : "status-dot--off"}`}
        />
        <span>{serviceReady ? "Service Running" : "Service Offline"}</span>
        {!serviceReady && (
          <button
            className="btn btn--sm"
            onClick={onStartService}
            disabled={loading}
          >
            Start Service
          </button>
        )}
      </div>
    </div>
  );
}
