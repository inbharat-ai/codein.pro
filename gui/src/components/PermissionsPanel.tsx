import { useEffect, useState } from "react";
import { agentFetch as baseAgentFetch } from "../util/agentConfig";
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
    }
  };

  const handleToggleExtendedAccess = async (grant: boolean) => {
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
    }
  };

  const handleResetPolicy = async () => {
    try {
      await baseAgentFetch("/permissions/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspacePath }),
      });
      void loadPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset policy");
    }
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>System Permissions</h2>
      </div>

      <section className="panel-section">
        <h3>Workspace</h3>
        <div className="search-box">
          <input
            type="text"
            value={workspacePath}
            placeholder="Workspace path"
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
              className="btn-primary"
            >
              Grant Extended Access
            </button>
            <button
              onClick={() => void handleToggleExtendedAccess(false)}
              className="btn-secondary"
            >
              Revoke Extended Access
            </button>
            <button
              onClick={() => void handleResetPolicy()}
              className="btn-secondary"
            >
              Reset Policy
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="loading">Loading permissions...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <div className="permissions-list">
          {queue.length === 0 && (
            <div className="result-card">No pending requests</div>
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
                  className="btn-primary"
                >
                  Allow
                </button>
                <button
                  onClick={() =>
                    void handleRespondPermission(perm.requestId, false)
                  }
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
