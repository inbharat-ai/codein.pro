import { useEffect, useState, useCallback } from "react";
import { Card, EmptyState } from "../../../components/ui";
import { ConfigHeader } from "../components/ConfigHeader";

/** Agent HTTP API base URL */
const AGENT_URL = "http://127.0.0.1:43120";

interface GitNexusStatus {
  available: boolean;
  installed?: boolean;
  version?: string | null;
  indexed?: boolean;
  stale?: boolean;
  commitsBehind?: number;
  mcpRegistered?: boolean;
  mcpConnected?: boolean;
  needsReindex?: boolean;
  reason?: string;
}

/** Direct fetch helper — talks to agent HTTP API without going through IdeMessenger */
async function agentFetch<T>(
  path: string,
  method: "GET" | "POST" = "GET",
): Promise<T | null> {
  try {
    const res = await fetch(`${AGENT_URL}/api/v1${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function GitNexusSection() {
  const [status, setStatus] = useState<GitNexusStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    const data = await agentFetch<GitNexusStatus>("/gitnexus/status");
    setStatus(data ?? { available: false, reason: "Agent unavailable" });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleAction = async (path: string) => {
    setActionLoading(true);
    try {
      await agentFetch(path, "POST");
      await fetchStatus();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <ConfigHeader
        title="Code Graph (GitNexus)"
        subtext="Knowledge graph for code intelligence — query, impact analysis, and execution flow tracing."
      />
      <Card>
        {loading ? (
          <div className="p-4 text-center text-xs text-gray-400">
            Checking GitNexus status...
          </div>
        ) : !status?.available || !status?.installed ? (
          <EmptyState
            title="GitNexus not installed"
            description="Install GitNexus to enable code knowledge graph features: npm install -g gitnexus"
          />
        ) : (
          <div className="flex flex-col gap-3 p-2">
            {/* Status indicators */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatusRow
                label="Installed"
                value={status.installed ? `v${status.version}` : "No"}
                ok={!!status.installed}
              />
              <StatusRow
                label="Indexed"
                value={status.indexed ? "Yes" : "No"}
                ok={!!status.indexed}
              />
              <StatusRow
                label="MCP Server"
                value={
                  status.mcpConnected
                    ? "Connected"
                    : status.mcpRegistered
                      ? "Registered"
                      : "Not registered"
                }
                ok={!!status.mcpConnected}
              />
              <StatusRow
                label="Freshness"
                value={
                  status.stale
                    ? `${status.commitsBehind} commits behind`
                    : "Up to date"
                }
                ok={!status.stale}
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 border-t border-gray-700 pt-2">
              {!status.indexed && (
                <ActionButton
                  onClick={() => handleAction("/gitnexus/setup")}
                  loading={actionLoading}
                  label="Setup & Index"
                />
              )}
              {status.indexed && status.needsReindex && (
                <ActionButton
                  onClick={() => handleAction("/gitnexus/reindex")}
                  loading={actionLoading}
                  label="Re-index"
                />
              )}
              {status.installed && !status.mcpRegistered && (
                <ActionButton
                  onClick={() => handleAction("/gitnexus/register")}
                  loading={actionLoading}
                  label="Register MCP"
                />
              )}
              {status.indexed && !status.needsReindex && (
                <ActionButton
                  onClick={() => handleAction("/gitnexus/reindex")}
                  loading={actionLoading}
                  label="Force Re-index"
                  secondary
                />
              )}
            </div>

            {/* Available tools info */}
            {status.mcpConnected && (
              <div className="border-t border-gray-700 pt-1 text-xs text-gray-400">
                Tools available via MCP: query, context, impact, detect_changes,
                rename, cypher, list_repos
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? "text-green-400" : "text-yellow-400"}>
        {ok ? "●" : "○"}
      </span>
      <span className="text-gray-400">{label}:</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  label,
  secondary,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
        secondary
          ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
          : "bg-blue-600 text-white hover:bg-blue-500"
      } disabled:opacity-50`}
    >
      {loading ? "..." : label}
    </button>
  );
}
