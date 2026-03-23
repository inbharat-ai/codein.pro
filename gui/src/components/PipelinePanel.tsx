/**
 * CodeIn Pipeline Panel
 *
 * UI for the Autonomous Coding Pipeline.
 * - Create new pipelines from a goal
 * - List running/completed pipelines
 * - View pipeline status and artifacts
 * - Cancel running pipelines
 */
import { useCallback, useEffect, useState } from "react";
import { agentFetch } from "../util/agentConfig";
import { EmptyState } from "./ui/EmptyState";
import "./panels.css";

interface Pipeline {
  id: string;
  status: string;
  goal: string;
  language?: string;
  framework?: string;
  startTime?: number;
  endTime?: number;
  artifacts?: Record<string, unknown>;
}

const STATUS_COLORS: Record<string, string> = {
  planning: "#f0ad4e",
  executing: "#5bc0de",
  completed: "#5cb85c",
  failed: "#d9534f",
  cancelled: "#999",
};

export default function PipelinePanel() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [goal, setGoal] = useState("");
  const [language, setLanguage] = useState("");
  const [framework, setFramework] = useState("");
  const [creating, setCreating] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPipelines = useCallback(async () => {
    try {
      const res = await agentFetch("/pipeline");
      if (res.ok) {
        const data = await res.json();
        setPipelines(data.pipelines || []);
      }
    } catch {
      // Ignore fetch failures
    }
  }, []);

  useEffect(() => {
    loadPipelines();
    const interval = setInterval(loadPipelines, 5000);
    return () => clearInterval(interval);
  }, [loadPipelines]);

  const createPipeline = useCallback(async () => {
    if (!goal.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await agentFetch("/pipeline/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(),
          ...(language ? { language } : {}),
          ...(framework ? { framework } : {}),
        }),
      });
      if (res.ok) {
        setGoal("");
        await loadPipelines();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create pipeline");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setCreating(false);
    }
  }, [goal, language, framework, loadPipelines]);

  const cancelPipeline = useCallback(
    async (id: string) => {
      setCancellingId(id);
      try {
        await agentFetch(`/pipeline/${id}`, { method: "DELETE" });
        await loadPipelines();
      } catch {
        // Ignore network errors on cancel – list will auto-refresh
      } finally {
        setCancellingId(null);
      }
    },
    [loadPipelines],
  );

  return (
    <div className="panel-container" style={{ maxWidth: 800 }}>
      <div className="panel-header">
        <h2>Pipeline</h2>
        <p>Create and manage autonomous coding pipelines</p>
      </div>

      {/* Create form */}
      <section className="panel-section">
        <h3>New Pipeline</h3>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe what you want to build..."
          aria-label="Pipeline description"
          rows={3}
          style={{ width: "100%" }}
        />
        <div className="search-box">
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="Language (optional)"
            aria-label="Language"
          />
          <input
            value={framework}
            onChange={(e) => setFramework(e.target.value)}
            placeholder="Framework (optional)"
            aria-label="Framework"
          />
          <button
            onClick={createPipeline}
            disabled={creating || !goal.trim()}
            className="btn-primary"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="error-message"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{error}</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setError(null)}
                className="btn-secondary"
                style={{ fontSize: "12px", padding: "2px 8px" }}
              >
                Dismiss
              </button>
              <button
                onClick={createPipeline}
                className="btn-primary"
                style={{ fontSize: "12px", padding: "2px 8px" }}
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Pipeline list */}
      {pipelines.length === 0 ? (
        <EmptyState
          title="No pipelines yet"
          message="Create your first pipeline to automate your workflow."
        />
      ) : (
        <div className="results-list" style={{ maxHeight: "none" }}>
          {pipelines.map((p) => (
            <div
              key={p.id}
              className="result-card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 4,
                    color: "var(--codin-fg-primary)",
                  }}
                >
                  {p.goal.slice(0, 120)}
                  {p.goal.length > 120 ? "..." : ""}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: 12,
                    color: "var(--codin-fg-muted)",
                  }}
                >
                  <span
                    style={{
                      color: STATUS_COLORS[p.status] || "#888",
                      fontWeight: 500,
                    }}
                  >
                    {p.status}
                  </span>
                  {p.language && <span>Lang: {p.language}</span>}
                  {p.framework && <span>Framework: {p.framework}</span>}
                  {p.startTime && (
                    <span>
                      Started: {new Date(p.startTime).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
              {p.status !== "completed" &&
                p.status !== "failed" &&
                p.status !== "cancelled" && (
                  <button
                    onClick={() => cancelPipeline(p.id)}
                    disabled={cancellingId === p.id}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "1px solid #d9534f",
                      backgroundColor: "transparent",
                      color: "#d9534f",
                      cursor: cancellingId === p.id ? "wait" : "pointer",
                      opacity: cancellingId === p.id ? 0.5 : 1,
                      fontSize: 12,
                    }}
                  >
                    {cancellingId === p.id ? "Cancelling…" : "Cancel"}
                  </button>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
