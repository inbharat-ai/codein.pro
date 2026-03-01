import { ChangeEvent, useContext, useEffect, useMemo, useState } from "react";
import { Button, Card, EmptyState } from "../../../components/ui";
import { Input } from "../../../components";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { ConfigHeader } from "../components/ConfigHeader";

type RunInfo = {
  projectType: string;
  command: string;
  args: string[];
  cwd: string;
  packageManager: string;
  port?: number;
  previewUrl?: string;
};

export function RunSection() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [runInfo, setRunInfo] = useState<RunInfo | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [commandOverride, setCommandOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    ideMessenger
      .request("run/detect", undefined)
      .then((response) => {
        if (response.status === "success" && mounted) {
          setRunInfo(response.content);
          setPreviewUrl(response.content.previewUrl || null);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "Failed to detect run command",
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [ideMessenger]);

  const commandText = useMemo(() => {
    if (commandOverride.trim()) {
      return commandOverride.trim();
    }
    if (!runInfo) {
      return "";
    }
    return [runInfo.command, ...runInfo.args].filter(Boolean).join(" ");
  }, [commandOverride, runInfo]);

  const handleRun = async () => {
    if (!commandText) {
      setError("No command configured");
      return;
    }
    setError(null);
    const response = await ideMessenger.request("run/execute", {
      command: commandText,
      args: [],
      cwd: runInfo?.cwd,
      name: "CodIn Run",
      port: runInfo?.port,
    });
    if (response.status === "success") {
      setRunId(response.content.runId);
      if (response.content.previewUrl) {
        setPreviewUrl(response.content.previewUrl);
      }
    } else {
      setError(response.error || "Run failed");
    }
  };

  const handleStop = async () => {
    if (!runId) {
      return;
    }
    await ideMessenger.request("run/stop", { runId });
    setRunId(null);
  };

  const handlePreview = async () => {
    if (!previewUrl) {
      return;
    }
    await ideMessenger.request("run/openPreview", { url: previewUrl });
  };

  return (
    <div>
      <ConfigHeader
        title="Run Locally"
        subtext="Detect and launch your dev server with a safe command gate."
      />
      <Card>
        {!runInfo ? (
          <EmptyState
            title="No runnable project detected"
            description={
              error ||
              "Add a package.json or an index.html file to enable run detection."
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="text-description text-sm">
              Detected: {runInfo.projectType} ({runInfo.packageManager})
            </div>
            <Input
              value={commandText}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setCommandOverride(e.target.value)
              }
              placeholder="Command to run"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleRun} disabled={!commandText}>
                Run
              </Button>
              <Button onClick={handleStop} disabled={!runId}>
                Stop
              </Button>
              <Button onClick={handlePreview} disabled={!previewUrl}>
                Open Preview
              </Button>
            </div>
            {previewUrl && (
              <div className="text-xs text-gray-500">Preview: {previewUrl}</div>
            )}
            {error && <div className="text-xs text-red-500">{error}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}
