import { useCallback, useEffect, useMemo, useState } from "react";
import { agentFetch as baseAgentFetch } from "../util/agentConfig";
import "./ModelManagerPanel.css";
import { Card, Divider } from "./ui";

type ModelEntry = {
  id: string;
  name: string;
  path: string;
  role: "coder" | "reasoner";
};

type ModelStore = {
  models: ModelEntry[];
  active: { coder: string | null; reasoner: string | null };
};

type DownloadProgress = {
  modelId: string;
  progress: number;
  status: "downloading" | "complete" | "error";
};

const DEFAULT_MODELS = [
  {
    id: "qwen2.5-coder-1.5b-q4",
    name: "Qwen2.5 Coder 1.5B",
    description: "Fast, lightweight model perfect for code completion",
    url: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
    size: "900 MB",
    role: "coder",
    icon: "⚡",
  },
  {
    id: "deepseek-r1-distill-qwen-7b-q4",
    name: "DeepSeek R1 7B",
    description: "Advanced reasoning for complex coding tasks",
    url: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
    size: "4 GB",
    role: "reasoner",
    icon: "🧠",
  },
] as const;

async function fetchAgent(path: string, options?: RequestInit) {
  const response = await baseAgentFetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}

export function ModelManagerPanel() {
  const [store, setStore] = useState<ModelStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [agentStatus, setAgentStatus] = useState<
    "checking" | "online" | "offline"
  >("checking");
  const [downloads, setDownloads] = useState<Map<string, DownloadProgress>>(
    new Map(),
  );

  const checkAgentStatus = useCallback(async () => {
    try {
      const response = await baseAgentFetch("/health", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      setAgentStatus(response.ok ? "online" : "offline");
    } catch {
      setAgentStatus("offline");
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAgent("/models");
      setStore(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    }
  }, []);

  useEffect(() => {
    void checkAgentStatus();
    void refresh();

    // Check agent status every 10 seconds
    const interval = setInterval(checkAgentStatus, 10000);
    return () => clearInterval(interval);
  }, [refresh, checkAgentStatus]);

  const handleDownload = useCallback(
    async (model: (typeof DEFAULT_MODELS)[number]) => {
      setIsBusy(true);
      setDownloads((prev) =>
        new Map(prev).set(model.id, {
          modelId: model.id,
          progress: 0,
          status: "downloading",
        }),
      );

      try {
        await fetchAgent("/models/download", {
          method: "POST",
          body: JSON.stringify({
            id: model.id,
            name: model.name,
            url: model.url,
            role: model.role,
          }),
        });

        setDownloads((prev) =>
          new Map(prev).set(model.id, {
            modelId: model.id,
            progress: 100,
            status: "complete",
          }),
        );

        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download failed");
        setDownloads((prev) =>
          new Map(prev).set(model.id, {
            modelId: model.id,
            progress: 0,
            status: "error",
          }),
        );
      } finally {
        setIsBusy(false);
        setTimeout(() => {
          setDownloads((prev) => {
            const newMap = new Map(prev);
            newMap.delete(model.id);
            return newMap;
          });
        }, 3000);
      }
    },
    [refresh],
  );

  const handleActivate = useCallback(
    async (id: string, role: "coder" | "reasoner") => {
      setIsBusy(true);
      try {
        await fetchAgent("/models/activate", {
          method: "POST",
          body: JSON.stringify({ id, role }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Activation failed");
      } finally {
        setIsBusy(false);
      }
    },
    [refresh],
  );

  const installedIds = useMemo(
    () => new Set(store?.models.map((m) => m.id)),
    [store],
  );

  return (
    <Card>
      <div className="model-manager-panel">
        <div className="panel-header">
          <div className="header-content">
            <div className="title-row">
              <h3 className="panel-title">🤖 Local Model Manager</h3>
              <div className={`agent-status ${agentStatus}`}>
                <span className="status-dot"></span>
                <span className="status-text">
                  {agentStatus === "checking"
                    ? "Checking..."
                    : agentStatus === "online"
                      ? "Agent Online"
                      : "Agent Offline"}
                </span>
              </div>
            </div>
            <p className="panel-description">
              Download and manage local AI models for offline coding assistance
            </p>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{error}</span>
            <button
              className="error-dismiss"
              onClick={() => setError(null)}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <div className="models-grid">
          {DEFAULT_MODELS.map((model) => {
            const isInstalled = installedIds.has(model.id);
            const isActive = store?.active[model.role] === model.id;
            const downloadProgress = downloads.get(model.id);

            return (
              <div
                key={model.id}
                className={`model-card ${isActive ? "active" : ""}`}
              >
                <div className="model-icon">{model.icon}</div>

                <div className="model-info">
                  <div className="model-header">
                    <h4 className="model-name">{model.name}</h4>
                    <span className={`role-badge ${model.role}`}>
                      {model.role === "coder" ? "⚡ Coder" : "🧠 Reasoner"}
                    </span>
                  </div>

                  <p className="model-description">{model.description}</p>

                  <div className="model-meta">
                    <span className="meta-item">
                      <span className="meta-icon">💾</span>
                      {model.size}
                    </span>
                    {isInstalled && (
                      <span className="meta-item installed">
                        <span className="meta-icon">✓</span>
                        Installed
                      </span>
                    )}
                    {isActive && (
                      <span className="meta-item active">
                        <span className="meta-icon">⚡</span>
                        Active
                      </span>
                    )}
                  </div>

                  {downloadProgress &&
                    downloadProgress.status === "downloading" && (
                      <div className="download-progress">
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${downloadProgress.progress}%` }}
                          />
                        </div>
                        <span className="progress-text">Downloading...</span>
                      </div>
                    )}
                </div>

                <div className="model-actions">
                  {!isInstalled ? (
                    <button
                      className="btn-download"
                      disabled={
                        isBusy ||
                        agentStatus !== "online" ||
                        downloadProgress?.status === "downloading"
                      }
                      onClick={() => handleDownload(model)}
                      title={
                        agentStatus !== "online"
                          ? "Agent must be online"
                          : "Download model"
                      }
                    >
                      {downloadProgress?.status === "downloading"
                        ? "⏳ Downloading..."
                        : "⬇️ Download"}
                    </button>
                  ) : (
                    <button
                      className={`btn-activate ${isActive ? "active" : ""}`}
                      disabled={isBusy || isActive}
                      onClick={() => handleActivate(model.id, model.role)}
                      title={
                        isActive ? "Currently active" : "Set as active model"
                      }
                    >
                      {isActive ? "✓ Active" : "⚡ Activate"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Divider />

        <div className="active-models-summary">
          <h4 className="summary-title">Active Models</h4>
          <div className="active-models-grid">
            <div className="active-model-item">
              <span className="active-label">⚡ Coder:</span>
              <span className="active-value">
                {store?.active.coder || <em className="none-text">None</em>}
              </span>
            </div>
            <div className="active-model-item">
              <span className="active-label">🧠 Reasoner:</span>
              <span className="active-value">
                {store?.active.reasoner || <em className="none-text">None</em>}
              </span>
            </div>
          </div>
        </div>

        {agentStatus === "offline" && (
          <div className="offline-help">
            <div className="help-icon">ℹ️</div>
            <div className="help-content">
              <strong>CodIn Agent is offline</strong>
              <p>Make sure the agent server is running on port 43120.</p>
              <button
                className="btn-retry"
                onClick={checkAgentStatus}
                disabled={false}
              >
                🔄 Retry Connection
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
