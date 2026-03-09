import { useState } from "react";
import { agentFetch as baseAgentFetch } from "../util/agentConfig";
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
        <h2>Git Workflow</h2>
      </div>

      <section className="panel-section">
        <h3>Repository</h3>
        <div className="search-box">
          <input
            type="text"
            placeholder="Repository path"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
          />
          <button onClick={handleGetStatus} disabled={loading}>
            {loading ? "Loading..." : "Check Status"}
          </button>
        </div>
      </section>

      {status && (
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

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
