/** Progress, error, and loading status indicators. */

interface MediaStatusBarProps {
  progress: string;
  error: string;
  loading: boolean;
}

export function MediaStatusBar({
  progress,
  error,
  loading,
}: MediaStatusBarProps) {
  return (
    <>
      {progress && <div className="media-panel__progress">{progress}</div>}
      {error && <div className="media-panel__error">{error}</div>}
      {loading && <div className="media-panel__spinner">Processing...</div>}
    </>
  );
}
