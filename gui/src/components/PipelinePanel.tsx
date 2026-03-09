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
      try {
        await agentFetch(`/pipeline/${id}`, { method: "DELETE" });
        await loadPipelines();
      } catch {
        // Ignore
      }
    },
    [loadPipelines],
  );

  return (
    <div style={{ padding: "16px", maxWidth: 800 }}>
      <h2 style={{ marginTop: 0 }}>Autonomous Coding Pipeline</h2>

      {/* Create form */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 16,
          padding: 12,
          border: "1px solid var(--vscode-panel-border, #444)",
          borderRadius: 6,
        }}
      >
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe what you want to build..."
          rows={3}
          style={{
            width: "100%",
            resize: "vertical",
            padding: 8,
            fontFamily: "inherit",
            borderRadius: 4,
            border: "1px solid var(--vscode-input-border, #555)",
            backgroundColor: "var(--vscode-input-background, #1e1e1e)",
            color: "var(--vscode-input-foreground, #ccc)",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="Language (optional)"
            style={{
              flex: 1,
              padding: 6,
              borderRadius: 4,
              border: "1px solid var(--vscode-input-border, #555)",
              backgroundColor: "var(--vscode-input-background, #1e1e1e)",
              color: "var(--vscode-input-foreground, #ccc)",
            }}
          />
          <input
            value={framework}
            onChange={(e) => setFramework(e.target.value)}
            placeholder="Framework (optional)"
            style={{
              flex: 1,
              padding: 6,
              borderRadius: 4,
              border: "1px solid var(--vscode-input-border, #555)",
              backgroundColor: "var(--vscode-input-background, #1e1e1e)",
              color: "var(--vscode-input-foreground, #ccc)",
            }}
          />
          <button
            onClick={createPipeline}
            disabled={creating || !goal.trim()}
            style={{
              padding: "6px 16px",
              borderRadius: 4,
              border: "none",
              backgroundColor: "var(--vscode-button-background, #0e639c)",
              color: "var(--vscode-button-foreground, #fff)",
              cursor: creating ? "wait" : "pointer",
              opacity: creating || !goal.trim() ? 0.5 : 1,
            }}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
        {error && <div style={{ color: "#d9534f", fontSize: 12 }}>{error}</div>}
      </div>

      {/* Pipeline list */}
      {pipelines.length === 0 ? (
        <div style={{ color: "#888", textAlign: "center", padding: 24 }}>
          No pipelines yet. Create one above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pipelines.map((p) => (
            <div
              key={p.id}
              style={{
                padding: 12,
                border: "1px solid var(--vscode-panel-border, #444)",
                borderRadius: 6,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {p.goal.slice(0, 120)}
                  {p.goal.length > 120 ? "..." : ""}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
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
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "1px solid #d9534f",
                      backgroundColor: "transparent",
                      color: "#d9534f",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Cancel
                  </button>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
