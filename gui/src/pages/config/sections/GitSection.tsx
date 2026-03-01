import { useContext, useEffect, useState } from "react";
import { Button, Card, EmptyState } from "../../../components/ui";
import { Input } from "../../../components";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { ConfigHeader } from "../components/ConfigHeader";

type GitStatus = {
  branch: string | null;
  changes: Array<{ path: string; status: string }>;
};

export function GitSection() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [status, setStatus] = useState<GitStatus>({
    branch: null,
    changes: [],
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastOutput, setLastOutput] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    const response = await ideMessenger.request("git/status", undefined);
    if (response.status === "success") {
      setStatus(response.content);
    } else {
      setError(response.error || "Failed to read git status");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleCommit = async () => {
    setError(null);
    setLastOutput(null);
    const response = await ideMessenger.request("git/commit", {
      message,
      addAll: true,
    });
    if (response.status === "success") {
      setMessage("");
      setLastOutput(response.content.commitHash || "Committed");
      void refresh();
    } else {
      setError(response.error || "Commit failed");
    }
  };

  const handlePush = async () => {
    setError(null);
    setLastOutput(null);
    const response = await ideMessenger.request("git/push", {});
    if (response.status === "success") {
      setLastOutput(response.content.output || "Pushed");
    } else {
      setError(response.error || "Push failed");
    }
  };

  return (
    <div>
      <ConfigHeader
        title="Git Actions"
        subtext="Review changes, commit with a message, and push safely."
      />
      <Card>
        <div className="flex flex-col gap-4">
          {status.branch ? (
            <div className="text-description text-sm">
              Branch: {status.branch}
            </div>
          ) : (
            <EmptyState
              title="No Git repository detected"
              description="Initialize a repo to enable Git actions."
            />
          )}

          {status.changes.length > 0 && (
            <div className="max-h-40 overflow-auto rounded border border-gray-700 p-2 text-xs">
              {status.changes.map((change) => (
                <div
                  key={`${change.status}-${change.path}`}
                  className="flex gap-2"
                >
                  <span className="text-gray-400">{change.status}</span>
                  <span>{change.path}</span>
                </div>
              ))}
            </div>
          )}

          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={refresh}>Refresh</Button>
            <Button onClick={handleCommit} disabled={!message}>
              Commit
            </Button>
            <Button onClick={handlePush} disabled={!status.branch}>
              Push
            </Button>
          </div>
          {lastOutput && (
            <div className="text-xs text-gray-500">{lastOutput}</div>
          )}
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>
      </Card>
    </div>
  );
}
