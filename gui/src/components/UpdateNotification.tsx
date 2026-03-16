import { useEffect, useState } from "react";

type UpdateState =
  | { status: "idle" }
  | { status: "available"; version: string }
  | { status: "downloading"; percent: number }
  | { status: "ready"; version: string }
  | { status: "error"; message: string };

/**
 * Banner that appears when an app update is available.
 * Listens to IPC channels from AutoUpdateService in the main process.
 */
export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = (window as any).electron;
    if (!api?.ipcRenderer) return;

    const { ipcRenderer } = api;

    const onAvailable = (_e: unknown, data: { version: string }) =>
      setState({ status: "available", version: data.version });

    const onProgress = (_e: unknown, data: { percent: number }) =>
      setState({ status: "downloading", percent: Math.round(data.percent) });

    const onDownloaded = (_e: unknown, data: { version: string }) =>
      setState({ status: "ready", version: data.version });

    const onError = (_e: unknown, data: { message: string }) =>
      setState({ status: "error", message: data.message });

    ipcRenderer.on("update-available", onAvailable);
    ipcRenderer.on("update-download-progress", onProgress);
    ipcRenderer.on("update-downloaded", onDownloaded);
    ipcRenderer.on("update-error", onError);

    return () => {
      ipcRenderer.removeListener("update-available", onAvailable);
      ipcRenderer.removeListener("update-download-progress", onProgress);
      ipcRenderer.removeListener("update-downloaded", onDownloaded);
      ipcRenderer.removeListener("update-error", onError);
    };
  }, []);

  if (state.status === "idle" || dismissed) return null;

  const handleDownload = () => {
    const api = (window as any).electron;
    api?.ipcRenderer?.send("download-update");
  };

  const handleInstall = () => {
    const api = (window as any).electron;
    api?.ipcRenderer?.send("quit-and-install");
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px 16px",
        background: "var(--codin-accent-saffron-subtle, rgba(245,158,11,0.1))",
        borderBottom: "1px solid var(--codin-border, rgba(255,255,255,0.08))",
        fontSize: "13px",
        color: "var(--codin-fg-primary, #e0def4)",
      }}
    >
      <span style={{ flex: 1 }}>
        {state.status === "available" && (
          <>
            Update <strong>v{state.version}</strong> is available.{" "}
            <button
              onClick={handleDownload}
              style={{
                background: "var(--codin-accent-primary, #6366f1)",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "2px 10px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Download
            </button>
          </>
        )}
        {state.status === "downloading" && (
          <>Downloading update... {state.percent}%</>
        )}
        {state.status === "ready" && (
          <>
            Update <strong>v{state.version}</strong> ready.{" "}
            <button
              onClick={handleInstall}
              style={{
                background: "var(--codin-success, #22c55e)",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "2px 10px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Restart to Update
            </button>
          </>
        )}
        {state.status === "error" && (
          <span style={{ color: "var(--codin-fg-muted, #908caa)" }}>
            Update check failed: {state.message}
          </span>
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: "none",
          border: "none",
          color: "var(--codin-fg-muted, #908caa)",
          cursor: "pointer",
          fontSize: "16px",
          padding: "0 4px",
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
