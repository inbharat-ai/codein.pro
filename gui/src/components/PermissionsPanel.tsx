import { useEffect, useState } from "react";
import { agentFetch as baseAgentFetch } from "../util/agentConfig";
import { EmptyState } from "./ui/EmptyState";
import { LoadingPanel } from "./ui/LoadingState";
import "./panels.css";

interface QueueItem {
  requestId: string;
  toolName: string;
  category?: string;
  intent?: string;
  risk?: string;
  timestamp?: number;
}

interface PolicySummary {
  workspace?: string;
  extendedAccess?: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
}

export default function PermissionsPanel() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState<PolicySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspacePath, setWorkspacePath] = useState(".");
  // Tracks in-flight POST actions. Uses requestId for per-item actions,
  // or a sentinel string ("grant" | "revoke" | "reset") for global actions.
  const [actionInProgress, setActionInProgress] = useState<Set<string>>(
    new Set(),
  );

  const markAction = (key: string) =>
    setActionInProgress((prev) => new Set(prev).add(key));
  const clearAction = (key: string) =>
    setActionInProgress((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  useEffect(() => {
    void loadPermissions();
  }, []);

  const loadPermissions = async () => {
    setLoading(true);
    setError("");
    try {
      const [queueResp, summaryResp] = await Promise.all([
        baseAgentFetch("/permissions/queue", { method: "GET" }),
        baseAgentFetch(
          `/permissions/summary?workspace=${encodeURIComponent(workspacePath)}`,
          { method: "GET" },
        ),
      ]);

      const queueJson = (await queueResp.json()) as { queue?: QueueItem[] };
      const summaryJson = (await summaryResp.json()) as PolicySummary;

      setQueue(queueJson.queue || []);
      setSummary(summaryJson || null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load permissions",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRespondPermission = async (
    requestId: string,
    response: boolean,
  ) => {
    markAction(requestId);
    try {
      await baseAgentFetch("/permissions/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, response }),
      });
      void loadPermissions();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Permission request failed",
      );
    } finally {
      clearAction(requestId);
    }
  };

  const handleToggleExtendedAccess = async (grant: boolean) => {
    const key = grant ? "grant" : "revoke";
    markAction(key);
    try {
      await baseAgentFetch("/permissions/extended-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspacePath, grant }),
      });
      void loadPermissions();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update extended access",
      );
    } finally {
      clearAction(key);
    }
  };

  const handleResetPolicy = async () => {
    markAction("reset");
    try {
      await baseAgentFetch("/permissions/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspacePath }),
      });
      void loadPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset policy");
    } finally {
      clearAction("reset");
    }
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Permissions</h2>
        <p>Review and manage tool access permissions for your workspace</p>
      </div>

      <section className="panel-section">
        <h3>Workspace</h3>
        <div className="search-box">
          <input
            type="text"
            value={workspacePath}
            placeholder="Workspace path"
            aria-label="Workspace path"
            onChange={(e) => setWorkspacePath(e.target.value)}
          />
          <button onClick={() => void loadPermissions()} disabled={loading}>
            Refresh
          </button>
        </div>
      </section>

      {summary && (
        <section className="panel-section">
          <h3>Policy Summary</h3>
          <div className="result-card">
            <p>Workspace: {summary.workspace || workspacePath}</p>
            <p>
              Extended Access: {summary.extendedAccess ? "Enabled" : "Disabled"}
            </p>
            <p>Always Allowed Tools: {summary.allowedTools?.length || 0}</p>
            <p>Denied Tools: {summary.deniedTools?.length || 0}</p>
          </div>
          <div className="permission-actions">
            <button
              onClick={() => void handleToggleExtendedAccess(true)}
              disabled={actionInProgress.has("grant")}
              className="btn-primary"
            >
              {actionInProgress.has("grant")
                ? "Granting…"
                : "Grant Extended Access"}
            </button>
            <button
              onClick={() => void handleToggleExtendedAccess(false)}
              disabled={actionInProgress.has("revoke")}
              className="btn-secondary"
            >
              {actionInProgress.has("revoke")
                ? "Revoking…"
                : "Revoke Extended Access"}
            </button>
            <button
              onClick={() => void handleResetPolicy()}
              disabled={actionInProgress.has("reset")}
              className="btn-secondary"
            >
              {actionInProgress.has("reset") ? "Resetting…" : "Reset Policy"}
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <LoadingPanel message="Loading permissions..." />
      ) : error ? (
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
              onClick={() => setError("")}
              className="btn-secondary"
              style={{ fontSize: "12px", padding: "2px 8px" }}
            >
              Dismiss
            </button>
            <button
              onClick={() => void loadPermissions()}
              className="btn-primary"
              style={{ fontSize: "12px", padding: "2px 8px" }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="permissions-list">
          {queue.length === 0 && (
            <EmptyState
              title="No pending permissions"
              message="Permission requests will appear here when agents need approval."
            />
          )}
          {queue.map((perm) => (
            <div key={perm.requestId} className="permission-card">
              <div className="permission-header">
                <h4>{perm.toolName}</h4>
                <span className="status pending">Pending Consent</span>
              </div>
              <p>{perm.intent || perm.category || "No context provided"}</p>
              <div className="permission-actions">
                <button
                  onClick={() =>
                    void handleRespondPermission(perm.requestId, true)
                  }
                  disabled={actionInProgress.has(perm.requestId)}
                  className="btn-primary"
                >
                  {actionInProgress.has(perm.requestId) ? "Working…" : "Allow"}
                </button>
                <button
                  onClick={() =>
                    void handleRespondPermission(perm.requestId, false)
                  }
                  disabled={actionInProgress.has(perm.requestId)}
                  className="btn-secondary"
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
