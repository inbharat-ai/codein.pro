/**
 * CodeIn GPU Panel
 *
 * Full GPU management UI for RunPod integration.
 * - Connect with API key
 * - Browse available GPU types
 * - Create / stop / terminate pods
 * - Submit serverless jobs + check status
 * - Budget monitoring
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  agentFetch as baseAgentFetch,
  getAgentBaseUrl,
} from "../util/agentConfig";
import "./GpuPanel.css";

// ─── Types ───────────────────────────────────────────────────
interface GpuType {
  id: string;
  displayName?: string;
  memoryInGb?: number;
  secureCloud?: boolean;
  communityCloud?: boolean;
  lowestPrice?: { minimumBidPrice: number; uninterruptablePrice: number };
}

interface Pod {
  id: string;
  name: string;
  desiredStatus: string;
  runtime?: { uptimeInSeconds?: number; gpus?: Array<{ id: string }> };
  machine?: { gpu?: { id: string; displayName: string } };
  imageName?: string;
}

interface GpuStatus {
  connected: boolean;
  activePodId?: string;
  budget?: { spent: number; limit: number };
  uptime?: number;
}

interface JobStatus {
  id: string;
  status: string;
  output?: unknown;
  error?: string;
}

type Tab = "connect" | "gpus" | "pods" | "jobs";

// ─── API helpers ─────────────────────────────────────────────
const AGENT_BASE = getAgentBaseUrl();

async function gpuFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await baseAgentFetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ─── Component ───────────────────────────────────────────────
const GpuPanel: React.FC = () => {
  // Connection state
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [maxBudget, setMaxBudget] = useState("10");
  const [ttl, setTtl] = useState("30");
  const [connecting, setConnecting] = useState(false);

  // Data state
  const [gpuTypes, setGpuTypes] = useState<GpuType[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [status, setStatus] = useState<GpuStatus | null>(null);

  // Create pod form
  const [selectedGpu, setSelectedGpu] = useState("");
  const [imageName, setImageName] = useState(
    "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
  );
  const [volume, setVolume] = useState("20");
  const [creating, setCreating] = useState(false);

  // Jobs
  const [jobInput, setJobInput] = useState("");
  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [submittingJob, setSubmittingJob] = useState(false);
  const [checkingJob, setCheckingJob] = useState(false);

  // UI state
  const [tab, setTab] = useState<Tab>("connect");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // ─── Check agent availability ─────────────────────────────
  useEffect(() => {
    fetch(`${AGENT_BASE}/health`)
      .then((r) => setIsOffline(!r.ok))
      .catch(() => setIsOffline(true));
  }, []);

  // ─── Check existing connection on mount ───────────────────
  const refreshStatus = useCallback(async () => {
    try {
      const data = await gpuFetch<{ status: GpuStatus }>("/compute/gpu/status");
      setStatus(data.status);
      if (data.status?.connected) {
        setConnected(true);
        if (tab === "connect") setTab("pods");
      }
    } catch {
      // Not connected yet — that's fine
    }
  }, [tab]);

  useEffect(() => {
    if (!isOffline) void refreshStatus();
  }, [isOffline, refreshStatus]);

  // ─── Connect ──────────────────────────────────────────────
  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError("RunPod API key is required");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await gpuFetch("/compute/gpu/connect", {
        method: "POST",
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          maxBudgetUsd: parseFloat(maxBudget) || 10,
          ttlMinutes: parseInt(ttl) || 30,
        }),
      });
      setConnected(true);
      setTab("gpus");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  // ─── Load GPU types ───────────────────────────────────────
  const loadGpuTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gpuFetch<{ gpus: GpuType[] }>("/compute/gpu/types");
      setGpuTypes(data.gpus || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GPU types");
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Load pods ────────────────────────────────────────────
  const loadPods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use the status endpoint which includes pod info
      const data = await gpuFetch<{ status: GpuStatus }>("/compute/gpu/status");
      setStatus(data.status);
      // Also try to get pod list from logs endpoint as a data source
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pods");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load data when switching tabs
  useEffect(() => {
    if (!connected) return;
    if (tab === "gpus") void loadGpuTypes();
    if (tab === "pods") void loadPods();
  }, [tab, connected, loadGpuTypes, loadPods]);

  // ─── Create pod ───────────────────────────────────────────
  const handleCreatePod = async () => {
    if (!selectedGpu) {
      setError("Select a GPU type first");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const data = await gpuFetch<{ pod: Pod }>("/compute/gpu/pod", {
        method: "POST",
        body: JSON.stringify({
          gpuTypeId: selectedGpu,
          imageName: imageName.trim(),
          volume: parseInt(volume) || 20,
          timeoutMinutes: parseInt(ttl) || 30,
        }),
      });
      setTab("pods");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pod");
    } finally {
      setCreating(false);
    }
  };

  // ─── Stop session ─────────────────────────────────────────
  const handleStop = async () => {
    setError(null);
    try {
      await gpuFetch("/compute/gpu/stop", { method: "POST" });
      setConnected(false);
      setStatus(null);
      setPods([]);
      setTab("connect");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop");
    }
  };

  // ─── Submit job ───────────────────────────────────────────
  const handleSubmitJob = async () => {
    if (!jobInput.trim()) {
      setError("Job input is required");
      return;
    }
    setSubmittingJob(true);
    setError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jobInput);
      } catch {
        parsed = { prompt: jobInput };
      }
      const data = await gpuFetch<{ job: { id: string } }>(
        "/compute/gpu/jobs",
        {
          method: "POST",
          body: JSON.stringify({ input: parsed }),
        },
      );
      setJobId(data.job?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit job");
    } finally {
      setSubmittingJob(false);
    }
  };

  // ─── Check job status ─────────────────────────────────────
  const handleCheckJob = async () => {
    if (!jobId.trim()) {
      setError("Enter a job ID");
      return;
    }
    setCheckingJob(true);
    setError(null);
    try {
      const data = await gpuFetch<{ status: JobStatus }>(
        `/compute/gpu/jobs/${encodeURIComponent(jobId)}`,
      );
      setJobStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check job");
    } finally {
      setCheckingJob(false);
    }
  };

  // ─── Budget helpers ───────────────────────────────────────
  const budgetPercent = status?.budget
    ? Math.min(100, (status.budget.spent / status.budget.limit) * 100)
    : 0;
  const budgetClass =
    budgetPercent > 80
      ? "gpu-budget__fill--danger"
      : budgetPercent > 50
        ? "gpu-budget__fill--warn"
        : "gpu-budget__fill--ok";

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="gpu-panel">
      {/* Header */}
      <div className="gpu-header">
        <div className="gpu-header__title">
          <svg
            className="gpu-header__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="8" y="8" width="8" height="8" rx="1" />
            <line x1="12" y1="2" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="22" />
            <line x1="2" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="22" y2="12" />
          </svg>
          GPU Compute
          <span
            className={`gpu-header__badge ${connected ? "gpu-header__badge--connected" : "gpu-header__badge--disconnected"}`}
          >
            {connected ? "● Connected" : "○ Disconnected"}
          </span>
        </div>
        {connected && (
          <button className="gpu-btn gpu-btn--danger" onClick={handleStop}>
            Disconnect
          </button>
        )}
      </div>

      {/* Offline banner */}
      {isOffline && (
        <div className="gpu-error">
          Agent is not running. Start the CodeIn agent to use GPU compute.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="gpu-error">
          {error}
          <button className="gpu-error__dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {/* Budget bar (when connected) */}
      {connected && status?.budget && (
        <div className="gpu-budget">
          <div className="gpu-budget__row">
            <span className="gpu-budget__label">Budget</span>
            <span className="gpu-budget__value">
              ${status.budget.spent.toFixed(2)} / $
              {status.budget.limit.toFixed(2)}
            </span>
          </div>
          <div className="gpu-budget__bar">
            <div
              className={`gpu-budget__fill ${budgetClass}`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="gpu-tabs">
        <button
          className={`gpu-tab ${tab === "connect" ? "gpu-tab--active" : ""}`}
          onClick={() => setTab("connect")}
        >
          Connect
        </button>
        <button
          className={`gpu-tab ${tab === "gpus" ? "gpu-tab--active" : ""}`}
          onClick={() => setTab("gpus")}
          disabled={!connected}
        >
          GPU Types
        </button>
        <button
          className={`gpu-tab ${tab === "pods" ? "gpu-tab--active" : ""}`}
          onClick={() => setTab("pods")}
          disabled={!connected}
        >
          Pods
        </button>
        <button
          className={`gpu-tab ${tab === "jobs" ? "gpu-tab--active" : ""}`}
          onClick={() => setTab("jobs")}
          disabled={!connected}
        >
          Jobs
        </button>
      </div>

      {/* ─── Connect Tab ─────────────────────────────────── */}
      {tab === "connect" && (
        <div className="gpu-connect">
          {connected ? (
            <div
              className="gpu-empty"
              style={{ color: "var(--codin-fg-primary)" }}
            >
              ✓ Connected to RunPod. Switch to GPU Types or Pods tab to get
              started.
            </div>
          ) : (
            <>
              <div className="gpu-connect__field">
                <label className="gpu-connect__label">RunPod API Key</label>
                <input
                  className="gpu-connect__input"
                  type="password"
                  placeholder="rp_xxxxxxxxxx"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                />
              </div>
              <div className="gpu-connect__row">
                <div className="gpu-connect__field">
                  <label className="gpu-connect__label">Max Budget (USD)</label>
                  <input
                    className="gpu-connect__input"
                    type="number"
                    min="1"
                    value={maxBudget}
                    onChange={(e) => setMaxBudget(e.target.value)}
                  />
                </div>
                <div className="gpu-connect__field">
                  <label className="gpu-connect__label">
                    Session TTL (min)
                  </label>
                  <input
                    className="gpu-connect__input"
                    type="number"
                    min="5"
                    value={ttl}
                    onChange={(e) => setTtl(e.target.value)}
                  />
                </div>
              </div>
              <button
                className="gpu-btn gpu-btn--primary"
                onClick={handleConnect}
                disabled={connecting || isOffline}
              >
                {connecting && <span className="gpu-spinner" />}
                {connecting ? "Connecting…" : "Connect to RunPod"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ─── GPU Types Tab ───────────────────────────────── */}
      {tab === "gpus" && (
        <>
          {loading ? (
            <div className="gpu-loading">
              <span className="gpu-spinner" /> Loading GPU types…
            </div>
          ) : gpuTypes.length === 0 ? (
            <div className="gpu-empty">
              No GPU types available. Check your RunPod connection.
              <br />
              <button
                className="gpu-btn gpu-btn--ghost"
                style={{ marginTop: 12 }}
                onClick={loadGpuTypes}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: "var(--codin-font-size-sm)",
                  color: "var(--codin-fg-muted)",
                }}
              >
                Select a GPU to create a pod ({gpuTypes.length} available)
              </div>
              <div className="gpu-types-grid">
                {gpuTypes.map((gpu) => (
                  <div
                    key={gpu.id}
                    className={`gpu-type-card ${selectedGpu === gpu.id ? "gpu-type-card--selected" : ""}`}
                    onClick={() => setSelectedGpu(gpu.id)}
                  >
                    <div className="gpu-type-card__name">
                      {gpu.displayName || gpu.id}
                    </div>
                    {gpu.memoryInGb && (
                      <div className="gpu-type-card__detail">
                        {gpu.memoryInGb} GB VRAM
                      </div>
                    )}
                    <div className="gpu-type-card__detail">
                      {gpu.secureCloud && "☁ Secure"}{" "}
                      {gpu.communityCloud && "🌐 Community"}
                    </div>
                    {gpu.lowestPrice && (
                      <div className="gpu-type-card__price">
                        ${gpu.lowestPrice.minimumBidPrice?.toFixed(3)}/hr spot
                        {" · "}$
                        {gpu.lowestPrice.uninterruptablePrice?.toFixed(3)}/hr
                        on-demand
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Create pod form */}
              {selectedGpu && (
                <div className="gpu-create-form">
                  <div className="gpu-create-form__title">
                    Create Pod —{" "}
                    {gpuTypes.find((g) => g.id === selectedGpu)?.displayName ||
                      selectedGpu}
                  </div>
                  <div className="gpu-connect__field">
                    <label className="gpu-connect__label">Docker Image</label>
                    <input
                      className="gpu-connect__input"
                      value={imageName}
                      onChange={(e) => setImageName(e.target.value)}
                      placeholder="runpod/pytorch:2.1.0-..."
                    />
                  </div>
                  <div className="gpu-connect__row">
                    <div className="gpu-connect__field">
                      <label className="gpu-connect__label">Volume (GB)</label>
                      <input
                        className="gpu-connect__input"
                        type="number"
                        min="0"
                        value={volume}
                        onChange={(e) => setVolume(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    className="gpu-btn gpu-btn--primary"
                    onClick={handleCreatePod}
                    disabled={creating}
                  >
                    {creating && <span className="gpu-spinner" />}
                    {creating ? "Creating…" : "Create Pod"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Pods Tab ────────────────────────────────────── */}
      {tab === "pods" && (
        <>
          {loading ? (
            <div className="gpu-loading">
              <span className="gpu-spinner" /> Loading pods…
            </div>
          ) : !status?.activePodId ? (
            <div className="gpu-empty">
              No active pods. Go to GPU Types tab to create one.
              <br />
              <button
                className="gpu-btn gpu-btn--ghost"
                style={{ marginTop: 12 }}
                onClick={() => setTab("gpus")}
              >
                Browse GPUs
              </button>
            </div>
          ) : (
            <div className="gpu-pod-list">
              <div className="gpu-pod-card">
                <div className="gpu-pod-card__info">
                  <div className="gpu-pod-card__name">
                    Pod {status.activePodId}
                  </div>
                  <div className="gpu-pod-card__meta">
                    {status.uptime
                      ? `Uptime: ${Math.round(status.uptime / 60)}m`
                      : ""}
                  </div>
                </div>
                <div className="gpu-pod-card__actions">
                  <span className="gpu-pod-card__status gpu-pod-card__status--running">
                    ● Running
                  </span>
                  <button
                    className="gpu-btn gpu-btn--danger"
                    onClick={handleStop}
                  >
                    Stop
                  </button>
                </div>
              </div>
            </div>
          )}
          <button className="gpu-btn gpu-btn--ghost" onClick={loadPods}>
            ↻ Refresh
          </button>
        </>
      )}

      {/* ─── Jobs Tab ────────────────────────────────────── */}
      {tab === "jobs" && (
        <>
          <div className="gpu-connect">
            <div className="gpu-connect__field">
              <label className="gpu-connect__label">
                Job Input (JSON or text prompt)
              </label>
              <textarea
                className="gpu-connect__input"
                style={{
                  minHeight: 80,
                  resize: "vertical",
                  fontFamily: "var(--codin-font-mono)",
                }}
                placeholder='{"prompt": "hello"} or plain text'
                value={jobInput}
                onChange={(e) => setJobInput(e.target.value)}
              />
            </div>
            <button
              className="gpu-btn gpu-btn--primary"
              onClick={handleSubmitJob}
              disabled={submittingJob || !jobInput.trim()}
            >
              {submittingJob && <span className="gpu-spinner" />}
              {submittingJob ? "Submitting…" : "Submit Job"}
            </button>
          </div>

          <div
            className="gpu-connect"
            style={{ marginTop: "var(--codin-space-2)" }}
          >
            <div className="gpu-connect__row">
              <div className="gpu-connect__field">
                <label className="gpu-connect__label">Job ID</label>
                <input
                  className="gpu-connect__input"
                  placeholder="Enter job ID to check status"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCheckJob()}
                />
              </div>
              <button
                className="gpu-btn gpu-btn--ghost"
                onClick={handleCheckJob}
                disabled={checkingJob || !jobId.trim()}
                style={{ alignSelf: "flex-end" }}
              >
                {checkingJob && <span className="gpu-spinner" />}
                {checkingJob ? "Checking…" : "Check Status"}
              </button>
            </div>

            {jobStatus && (
              <div
                style={{
                  padding: "var(--codin-space-3)",
                  background: "var(--codin-bg-surface)",
                  borderRadius: "var(--codin-radius-md)",
                  fontFamily: "var(--codin-font-mono)",
                  fontSize: "var(--codin-font-size-xs)",
                  color: "var(--codin-fg-primary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(jobStatus, null, 2)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default GpuPanel;
