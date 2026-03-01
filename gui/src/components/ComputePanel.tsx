/**
 * CodeIn Compute Panel
 *
 * UI for the Compute job runner.
 * - Submit goals (typed or voice)
 * - View plan preview
 * - Live progress timeline
 * - Artifact panel
 * - Pause / Resume / Cancel
 * - Model badge + confidence per step
 * - Offline indicator
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  agentFetch as baseAgentFetch,
  getAgentBaseUrl,
} from "../util/agentConfig";
import "./ComputePanel.css";

// ─── Types ───────────────────────────────────────────────────
interface Step {
  id: string;
  status: string;
  description: string;
  agentName: string;
  confidence: number | null;
  model: string | null;
  output?: string;
  outputTranslated?: string;
  error?: string;
  escalated?: boolean;
}

interface Artifact {
  id: string;
  type: string;
  name?: string;
  fileName: string;
  size: number;
  createdAt?: string;
}

interface Job {
  id: string;
  status: string;
  goal: string;
  goalOriginal?: string;
  language: string;
  plan: string | null;
  steps: Step[];
  artifacts: Artifact[];
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
    stepId?: string;
  }>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: {
    tokensUsed: number;
    totalCostEstimate: number;
    modelsUsed: string[];
    escalationCount: number;
  };
  policy: Record<string, unknown>;
}

interface Workflow {
  name: string;
  icon: string;
  title: string;
  description: string;
}

const AGENT_BASE = getAgentBaseUrl();

const DEMO_WORKFLOWS: Workflow[] = [
  {
    name: "fix-build",
    icon: "🔧",
    title: "Fix My Build",
    description:
      "Run tests, find failures, propose a fix, create a diff artifact",
  },
  {
    name: "feature-spec",
    icon: "📋",
    title: "Feature Spec + Plan",
    description:
      "Generate a feature specification document and implementation plan",
  },
  {
    name: "research-code",
    icon: "🔍",
    title: "Research + Code",
    description:
      "Search the web, gather info, draft code, cite sources (requires network)",
  },
];

// ─── API helpers ─────────────────────────────────────────────
async function agentFetch<T = unknown>(
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
const ComputePanel: React.FC = () => {
  // State
  const [goal, setGoal] = useState("");
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<
    Array<{ id: string; status: string; goal: string; createdAt: string }>
  >([]);
  const [view, setView] = useState<"input" | "running" | "history">("input");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Policy toggles
  const [allowNetwork, setAllowNetwork] = useState(false);
  const [allowEscalation, setAllowEscalation] = useState(false);
  const [allowFSWrite, setAllowFSWrite] = useState(true);

  // SSE ref
  const eventSubscriptionRef = useRef<{ close: () => void } | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const computeBridge =
    typeof window !== "undefined" ? window.codinAPI?.compute : undefined;
  const useIpcCompute = Boolean(computeBridge);

  // ─── Check agent availability ─────────────────────────────
  useEffect(() => {
    if (useIpcCompute) {
      setIsOffline(false);
      return;
    }
    fetch(`${AGENT_BASE}/health`)
      .then((r) => {
        setIsOffline(!r.ok);
      })
      .catch(() => setIsOffline(true));
  }, [useIpcCompute]);

  useEffect(() => {
    if (useIpcCompute) {
      setAllowNetwork(false);
      setAllowEscalation(false);
    }
  }, [useIpcCompute]);

  // ─── Load job list ─────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    try {
      if (useIpcCompute && computeBridge) {
        const data = await computeBridge.listJobs({ limit: 10 });
        setJobs(data.jobs || []);
      } else {
        const data = await agentFetch<{ jobs: typeof jobs }>(
          "/compute/jobs?limit=10",
        );
        setJobs(data.jobs || []);
      }
    } catch {
      // Agent may not be running
    }
  }, [computeBridge, useIpcCompute]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // ─── SSE subscription ─────────────────────────────────────
  const subscribeToJob = useCallback(
    (jobId: string) => {
      // Cleanup previous subscription
      if (eventSubscriptionRef.current) {
        eventSubscriptionRef.current.close();
      }

      const parsePayload = (raw: any) => {
        if (!raw) return null;
        if (typeof raw === "string") {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        }
        return raw;
      };

      const handleEvent = (eventName: string, rawPayload: any) => {
        const payload = parsePayload(rawPayload);
        if (!payload) return;

        if (eventName === "job.progress") {
          setActiveJob((prev) =>
            prev
              ? { ...prev, status: payload.data?.status || prev.status }
              : prev,
          );
          return;
        }

        if (eventName === "job.step") {
          setActiveJob((prev) => {
            if (!prev) return prev;
            const steps = prev.steps.map((s) =>
              s.id === payload.data?.stepId
                ? {
                    ...s,
                    status: payload.data.status,
                    confidence: payload.data.confidence,
                    model: payload.data.model,
                  }
                : s,
            );
            return { ...prev, steps };
          });
          return;
        }

        if (eventName === "plan.ready") {
          const fetchJob =
            useIpcCompute && computeBridge
              ? computeBridge.getJob(jobId)
              : agentFetch<{ job: Job }>(`/compute/jobs/${jobId}`);
          Promise.resolve(fetchJob).then((result: any) => {
            const job = result.job || result;
            setActiveJob(job);
          });
          return;
        }

        if (eventName === "job.artifact") {
          setActiveJob((prev) =>
            prev
              ? { ...prev, artifacts: [...prev.artifacts, payload.data] }
              : prev,
          );
          return;
        }

        if (eventName === "job.complete") {
          const fetchJob =
            useIpcCompute && computeBridge
              ? computeBridge.getJob(jobId)
              : agentFetch<{ job: Job }>(`/compute/jobs/${jobId}`);
          Promise.resolve(fetchJob).then((result: any) => {
            const job = result.job || result;
            setActiveJob(job);
            loadJobs();
          });
          if (eventSubscriptionRef.current) {
            eventSubscriptionRef.current.close();
          }
          return;
        }

        if (eventName === "job.error") {
          setActiveJob((prev) =>
            prev
              ? { ...prev, error: payload.data?.error || "Unknown error" }
              : prev,
          );
          return;
        }

        if (eventName === "job.cancelled") {
          const fetchJob =
            useIpcCompute && computeBridge
              ? computeBridge.getJob(jobId)
              : agentFetch<{ job: Job }>(`/compute/jobs/${jobId}`);
          Promise.resolve(fetchJob).then((result: any) => {
            const job = result.job || result;
            setActiveJob(job);
            loadJobs();
          });
          if (eventSubscriptionRef.current) {
            eventSubscriptionRef.current.close();
          }
        }
      };

      if (useIpcCompute && computeBridge) {
        const unsubscribe = computeBridge.subscribeToJobEvents(
          jobId,
          handleEvent,
        );
        eventSubscriptionRef.current = { close: unsubscribe };
        return;
      }

      const es = new EventSource(`${AGENT_BASE}/compute/jobs/${jobId}/events`);
      eventSubscriptionRef.current = { close: () => es.close() };

      es.addEventListener("job.progress", (e) =>
        handleEvent("job.progress", (e as MessageEvent).data),
      );
      es.addEventListener("job.step", (e) =>
        handleEvent("job.step", (e as MessageEvent).data),
      );
      es.addEventListener("plan.ready", (e) =>
        handleEvent("plan.ready", (e as MessageEvent).data),
      );
      es.addEventListener("job.artifact", (e) =>
        handleEvent("job.artifact", (e as MessageEvent).data),
      );
      es.addEventListener("job.complete", (e) =>
        handleEvent("job.complete", (e as MessageEvent).data),
      );
      es.addEventListener("job.error", (e) =>
        handleEvent("job.error", (e as MessageEvent).data),
      );
      es.addEventListener("job.cancelled", (e) =>
        handleEvent("job.cancelled", (e as MessageEvent).data),
      );

      es.onerror = () => {
        es.close();
      };
    },
    [AGENT_BASE, computeBridge, loadJobs, useIpcCompute],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSubscriptionRef.current) {
        eventSubscriptionRef.current.close();
      }
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeJob?.logs]);

  // ─── Submit job ────────────────────────────────────────────
  const submitJob = async () => {
    if (!goal.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      let result: any;
      if (useIpcCompute && computeBridge) {
        result = await computeBridge.submitJob({
          goal: goal.trim(),
          policy: {
            allowNetwork,
            allowEscalation,
            allowFSWrite,
          },
        });
      } else {
        result = await agentFetch<{ job: Job }>("/compute/jobs", {
          method: "POST",
          body: JSON.stringify({
            goal: goal.trim(),
            policy: {
              allowNetwork,
              allowEscalation,
              allowFSWrite,
            },
          }),
        });
      }

      const job = result.job || result;

      setActiveJob(job as Job);
      setView("running");
      setGoal("");
      subscribeToJob((job as Job).id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit job");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Run demo workflow ─────────────────────────────────────
  const runWorkflow = async (name: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      let result: any;
      if (useIpcCompute && computeBridge) {
        result = await computeBridge.runWorkflow(name, {});
      } else {
        result = await agentFetch<{ job: Job }>(`/compute/workflows/${name}`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      }

      const job = result.job || result;
      setActiveJob(job as Job);
      setView("running");
      subscribeToJob((job as Job).id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run workflow");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Job control ───────────────────────────────────────────
  const pauseJob = async () => {
    if (!activeJob) return;
    if (useIpcCompute && computeBridge) {
      await computeBridge.pauseJob(activeJob.id);
      return;
    }
    await agentFetch(`/compute/jobs/${activeJob.id}/pause`, { method: "POST" });
  };
  const resumeJob = async () => {
    if (!activeJob) return;
    if (useIpcCompute && computeBridge) {
      await computeBridge.resumeJob(activeJob.id);
      return;
    }
    await agentFetch(`/compute/jobs/${activeJob.id}/resume`, {
      method: "POST",
    });
  };
  const cancelJob = async () => {
    if (!activeJob) return;
    if (useIpcCompute && computeBridge) {
      await computeBridge.cancelJob(activeJob.id);
      return;
    }
    await agentFetch(`/compute/jobs/${activeJob.id}/cancel`, {
      method: "POST",
    });
  };

  // ─── View job details ─────────────────────────────────────
  const viewJob = async (jobId: string) => {
    try {
      let result: any;
      if (useIpcCompute && computeBridge) {
        result = await computeBridge.getJob(jobId);
      } else {
        result = await agentFetch<{ job: Job }>(`/compute/jobs/${jobId}`);
      }
      const job = result.job || result;
      setActiveJob(job as Job);
      setView("running");
      if (job.status === "running" || job.status === "planning") {
        subscribeToJob(jobId);
      }
    } catch {
      // ignore
    }
  };

  // ─── Status helpers ────────────────────────────────────────
  const getStepIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "✓";
      case "running":
        return "▶";
      case "failed":
        return "✕";
      case "skipped":
        return "⏭";
      case "escalated":
        return "⬆";
      default:
        return "○";
    }
  };

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case "diff":
        return "📝";
      case "report":
        return "📄";
      case "code":
        return "💻";
      case "log":
        return "📜";
      case "doc":
        return "📖";
      default:
        return "📎";
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const isTerminal =
    activeJob &&
    ["completed", "failed", "cancelled"].includes(activeJob.status);

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="compute-panel codin-scrollbar">
      {/* Header */}
      <div className="compute-header">
        <div className="compute-header__title">
          <span className="compute-header__icon">⚡</span>
          CodeIn Compute
          <span className="compute-header__badge">BETA</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {isOffline && (
            <span className="compute-header__offline">Offline</span>
          )}
          <button
            className="codin-btn--ghost"
            onClick={() => {
              setView("input");
              setActiveJob(null);
            }}
            style={{ fontSize: "0.8rem", padding: "2px 8px" }}
          >
            + New
          </button>
          <button
            className="codin-btn--ghost"
            onClick={() => {
              setView("history");
              loadJobs();
            }}
            style={{ fontSize: "0.8rem", padding: "2px 8px" }}
          >
            History
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="codin-error-panel--error"
          style={{ padding: "8px 12px", fontSize: "0.8rem" }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Input View ─────────────────────────────────────── */}
      {view === "input" && (
        <>
          {/* Goal input */}
          <div className="compute-goal">
            <span className="compute-goal__label">
              What should CodeIn Compute do?
            </span>
            <div className="compute-goal__input-row">
              <textarea
                className="compute-goal__textarea"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Describe your goal... e.g., 'Fix the failing tests in src/utils' or 'Create a REST API spec for user management'"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    submitJob();
                  }
                }}
              />
            </div>
            <div className="compute-goal__actions">
              {/* Policy toggles */}
              <div className="compute-policy">
                <label
                  className={`compute-policy__toggle ${allowNetwork ? "compute-policy__toggle--active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={allowNetwork}
                    onChange={(e) => setAllowNetwork(e.target.checked)}
                    disabled={useIpcCompute}
                  />
                  🌐 Network
                </label>
                <label
                  className={`compute-policy__toggle ${allowEscalation ? "compute-policy__toggle--active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={allowEscalation}
                    onChange={(e) => setAllowEscalation(e.target.checked)}
                    disabled={useIpcCompute}
                  />
                  ☁️ External AI
                </label>
                <label
                  className={`compute-policy__toggle ${allowFSWrite ? "compute-policy__toggle--active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={allowFSWrite}
                    onChange={(e) => setAllowFSWrite(e.target.checked)}
                  />
                  💾 Write Files
                </label>
              </div>
              <button
                className="codin-btn--primary codin-focus-ring"
                onClick={submitJob}
                disabled={!goal.trim() || isSubmitting || isOffline}
                style={{
                  padding: "6px 16px",
                  fontSize: "0.85rem",
                  whiteSpace: "nowrap",
                }}
              >
                {isSubmitting ? "Starting..." : "▶ Run"}
              </button>
            </div>
          </div>

          {/* Demo workflows */}
          <div className="compute-workflows">
            <span className="compute-workflows__title">Quick Workflows</span>
            {DEMO_WORKFLOWS.map((wf) => {
              const isDisabled = useIpcCompute && wf.name === "research-code";
              return (
                <div
                  key={wf.name}
                  className="compute-workflow-card codin-animate-in"
                  onClick={() => {
                    if (!isDisabled) {
                      runWorkflow(wf.name);
                    }
                  }}
                  style={
                    isDisabled
                      ? { opacity: 0.5, cursor: "not-allowed" }
                      : undefined
                  }
                >
                  <span className="compute-workflow-card__icon">{wf.icon}</span>
                  <div className="compute-workflow-card__info">
                    <div className="compute-workflow-card__name">
                      {wf.title}
                    </div>
                    <div className="compute-workflow-card__desc">
                      {wf.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Running / Results View ─────────────────────────── */}
      {view === "running" && activeJob && (
        <>
          {/* Job info */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              className={`compute-job-card__status compute-job-card__status--${activeJob.status}`}
            />
            <span style={{ fontSize: "0.85rem", fontWeight: 500, flex: 1 }}>
              {activeJob.goalOriginal || activeJob.goal}
            </span>
            {activeJob.language !== "en" && (
              <span
                style={{ fontSize: "0.7rem", color: "var(--codin-fg-muted)" }}
              >
                🌐 {activeJob.language}
              </span>
            )}
          </div>

          {/* Controls */}
          {!isTerminal && (
            <div className="compute-controls">
              {activeJob.status === "running" && (
                <button
                  className="codin-btn--ghost codin-focus-ring"
                  onClick={pauseJob}
                  style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                >
                  ⏸ Pause
                </button>
              )}
              {activeJob.status === "paused" && (
                <button
                  className="codin-btn--primary codin-focus-ring"
                  onClick={resumeJob}
                  style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                >
                  ▶ Resume
                </button>
              )}
              <button
                className="codin-btn--ghost codin-focus-ring"
                onClick={cancelJob}
                style={{
                  fontSize: "0.8rem",
                  padding: "4px 12px",
                  color: "var(--codin-error, #ef4444)",
                }}
              >
                ✕ Cancel
              </button>
            </div>
          )}

          {/* Plan / Steps */}
          {activeJob.steps.length > 0 && (
            <div className="compute-plan">
              <div className="compute-plan__title">
                Execution Plan {activeJob.plan ? `— ${activeJob.plan}` : ""}
              </div>
              {activeJob.steps.map((step, i) => (
                <div
                  key={step.id}
                  className={`compute-plan__step compute-plan__step--${step.status}`}
                >
                  <span className="compute-plan__step-num">
                    {step.status === "completed"
                      ? "✓"
                      : step.status === "running"
                        ? "▶"
                        : step.status === "failed"
                          ? "✕"
                          : i + 1}
                  </span>
                  <span className="compute-plan__step-desc">
                    {step.description}
                  </span>
                  {step.model && (
                    <span className="compute-plan__step-badge">
                      {step.model}
                    </span>
                  )}
                  {step.confidence !== null &&
                    step.confidence !== undefined && (
                      <span className="compute-plan__step-badge">
                        {Math.round(step.confidence * 100)}%
                      </span>
                    )}
                  {step.escalated && (
                    <span className="compute-plan__step-badge">
                      ⬆ escalated
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Artifacts */}
          {activeJob.artifacts.length > 0 && (
            <div className="compute-artifacts">
              <span className="compute-artifacts__title">Artifacts</span>
              {activeJob.artifacts.map((art) => (
                <div key={art.id} className="compute-artifact">
                  <span className="compute-artifact__icon">
                    {getArtifactIcon(art.type)}
                  </span>
                  <span className="compute-artifact__name">
                    {art.name || art.fileName}
                  </span>
                  <span className="compute-artifact__size">
                    {formatSize(art.size)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Logs */}
          {activeJob.logs.length > 0 && (
            <div className="compute-logs codin-scrollbar">
              {activeJob.logs.slice(-30).map((log, i) => (
                <div
                  key={i}
                  className={`compute-log compute-log--${log.level}`}
                >
                  <span className="compute-log__time">
                    {formatTime(log.timestamp)}
                  </span>
                  <span>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}

          {/* Metadata */}
          {isTerminal && (
            <div
              style={{
                display: "flex",
                gap: "12px",
                fontSize: "0.75rem",
                color: "var(--codin-fg-muted)",
              }}
            >
              <span>
                Tokens: {activeJob.metadata.tokensUsed.toLocaleString()}
              </span>
              {activeJob.metadata.totalCostEstimate > 0 && (
                <span>
                  Cost: ${activeJob.metadata.totalCostEstimate.toFixed(4)}
                </span>
              )}
              {activeJob.metadata.modelsUsed.length > 0 && (
                <span>Models: {activeJob.metadata.modelsUsed.join(", ")}</span>
              )}
              {activeJob.metadata.escalationCount > 0 && (
                <span>Escalations: {activeJob.metadata.escalationCount}</span>
              )}
            </div>
          )}
        </>
      )}

      {/* ── History View ───────────────────────────────────── */}
      {view === "history" && (
        <div className="compute-jobs">
          {jobs.length === 0 ? (
            <div className="compute-empty">
              <span className="compute-empty__icon">📋</span>
              <span className="compute-empty__text">
                No compute jobs yet. Submit a goal to get started.
              </span>
            </div>
          ) : (
            jobs.map((j) => (
              <div
                key={j.id}
                className="compute-job-card"
                onClick={() => viewJob(j.id)}
              >
                <span
                  className={`compute-job-card__status compute-job-card__status--${j.status}`}
                />
                <div className="compute-job-card__info">
                  <div className="compute-job-card__goal">{j.goal}</div>
                  <div className="compute-job-card__meta">
                    {j.status} · {formatTime(j.createdAt)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ComputePanel;
