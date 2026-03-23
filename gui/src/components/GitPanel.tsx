import { useState } from "react";
import { agentFetch as baseAgentFetch } from "../util/agentConfig";
import { Button, vscButtonBackground, vscButtonForeground } from "./index";
import { EmptyState } from "./ui/EmptyState";
import { LoadingPanel } from "./ui/LoadingState";
import "./panels.css";

interface GitStatus {
  modified: string[];
  staged: string[];
  untracked: string[];
  branch: string;
}

interface GitStatusResponse {
  branch?: string;
  status?: string;
  modified?: string[];
  staged?: string[];
  untracked?: string[];
}

function normalizeGitStatus(payload: GitStatusResponse): GitStatus {
  if (
    Array.isArray(payload.modified) &&
    Array.isArray(payload.staged) &&
    Array.isArray(payload.untracked)
  ) {
    return {
      branch: payload.branch || "unknown",
      modified: payload.modified,
      staged: payload.staged,
      untracked: payload.untracked,
    };
  }

  const modified: string[] = [];
  const staged: string[] = [];
  const untracked: string[] = [];
  const lines = String(payload.status || "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);

  for (const line of lines) {
    const x = line[0] || " ";
    const y = line[1] || " ";
    const file = line.slice(3).trim();
    if (!file) continue;
    if (x === "?" && y === "?") {
      untracked.push(file);
      continue;
    }
    if (x !== " ") staged.push(file);
    if (y !== " ") modified.push(file);
  }

  return {
    branch: payload.branch || "unknown",
    modified,
    staged,
    untracked,
  };
}

export default function GitPanel() {
  const [repoPath, setRepoPath] = useState("");
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [branchName, setBranchName] = useState("");

  const handleGetStatus = async () => {
    if (!repoPath.trim()) {
      setError("Enter repository path");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await baseAgentFetch(
        `/git/status?repoPath=${encodeURIComponent(repoPath)}`,
        { method: "GET" },
      );
      const res = (await response.json()) as GitStatusResponse;
      setStatus(normalizeGitStatus(res));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get status");
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      setError("Enter commit message");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await baseAgentFetch("/git/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoPath,
          message: commitMessage,
        }),
      });
      setCommitMessage("");
      await handleGetStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!branchName.trim()) {
      setError("Enter branch name");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await baseAgentFetch("/git/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoPath,
          branchName,
          checkout: true,
        }),
      });
      setBranchName("");
      await handleGetStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create branch");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Git</h2>
        <p>View status, stage changes, commit, and manage branches</p>
      </div>

      <section className="panel-section">
        <h3>Repository</h3>
        <div className="search-box">
          <input
            type="text"
            placeholder="Repository path (e.g., . for current)"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
          />
          <Button
            onClick={handleGetStatus}
            disabled={loading}
            style={{
              backgroundColor: vscButtonBackground,
              color: vscButtonForeground,
              margin: 0,
            }}
          >
            {loading ? "Loading..." : "Check Status"}
          </Button>
        </div>
      </section>

      {/* Loading State */}
      {loading && !status && (
        <LoadingPanel
          message="Fetching repository status..."
          className="py-8"
        />
      )}

      {/* Error State */}
      {error && (
        <div
          className="error-message"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{error}</span>
          <button
            onClick={handleGetStatus}
            style={{
              marginLeft: 8,
              textDecoration: "underline",
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: "inherit",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State - before first status check */}
      {!loading && !status && !error && (
        <EmptyState
          icon={
            <svg
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
          title="No Repository Status"
          message="Enter a repository path above and click 'Check Status' to get started."
        />
      )}

      {/* Empty state - repo has no changes */}
      {!loading &&
        status &&
        status.modified.length === 0 &&
        status.staged.length === 0 &&
        status.untracked.length === 0 && (
          <>
            <section className="panel-section">
              <h3>Status: {status.branch}</h3>
              <EmptyState
                icon={
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                }
                title="Working Tree Clean"
                message="No modified, staged, or untracked files."
              />
            </section>

            <section className="panel-section">
              <h3>Create Branch</h3>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Branch name"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                />
                <button onClick={handleCreateBranch} disabled={loading}>
                  Create & Checkout
                </button>
              </div>
            </section>
          </>
        )}

      {status &&
        (status.modified.length > 0 ||
          status.staged.length > 0 ||
          status.untracked.length > 0) && (
          <>
            <section className="panel-section">
              <h3>Status: {status.branch}</h3>
              {status.modified.length > 0 && (
                <div className="git-section">
                  <h4>Modified ({status.modified.length})</h4>
                  <ul className="file-list">
                    {status.modified.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {status.untracked.length > 0 && (
                <div className="git-section">
                  <h4>Untracked ({status.untracked.length})</h4>
                  <ul className="file-list">
                    {status.untracked.slice(0, 5).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="panel-section">
              <h3>Commit Changes</h3>
              <textarea
                placeholder="Commit message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                rows={3}
              />
              <button onClick={handleCommit} disabled={loading}>
                Commit
              </button>
            </section>

            <section className="panel-section">
              <h3>Create Branch</h3>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Branch name"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                />
                <button onClick={handleCreateBranch} disabled={loading}>
                  Create & Checkout
                </button>
              </div>
            </section>
          </>
        )}
    </div>
  );
}
