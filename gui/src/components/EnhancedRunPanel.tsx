import { useContext, useEffect, useRef, useState } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { agentFetch } from "../util/agentConfig";
import { EmptyState } from "./ui/EmptyState";
import { LoadingPanel } from "./ui/LoadingState";

interface Project {
  root: string;
  type: string;
  profile: {
    installCmd: string | null;
    runCmd: string;
    port: number;
    cwd: string;
    env: any;
  };
}

export function EnhancedRunPanel() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [project, setProject] = useState<Project | null>(null);
  const [detecting, setDetecting] = useState(true);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<"stopped" | "running" | "failed">(
    "stopped",
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    detectProject();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const detectProject = async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const workspacePath = window.workspacePaths?.[0] ?? ".";
      const response = await agentFetch("/run/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspacePath }),
      });

      const data = await response.json();
      setProject(data.project);
    } catch (error) {
      setDetectError(
        error instanceof Error ? error.message : "Failed to detect project",
      );
    } finally {
      setDetecting(false);
    }
  };

  const install = async () => {
    if (!project?.profile.installCmd) return;

    // Run install command
    try {
      const response = await agentFetch("/run/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            ...project.profile,
            runCmd: project.profile.installCmd,
          },
          options: { approved: false },
        }),
      });

      const data = await response.json();
      alert("Install started. Check terminal output.");
    } catch {
      alert("Install failed");
    }
  };

  const start = async () => {
    if (!project) return;

    try {
      const response = await agentFetch("/run/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: project.profile,
          options: { approved: false },
        }),
      });

      const data = await response.json();

      if (data.runId) {
        setRunId(data.runId);
        setStatus("running");
        setPreviewUrl(data.url);

        // Start polling logs
        pollLogs(data.runId);
      }
    } catch {
      alert("Failed to start project");
    }
  };

  const stop = async () => {
    if (!runId) return;

    try {
      await agentFetch(`/run/${runId}/stop`, {
        method: "POST",
      });

      setStatus("stopped");
      setRunId(null);
    } catch {
      // Stop failure is non-critical; UI already reflects intended state
    }
  };

  const pollLogs = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await agentFetch(`/run/${id}/logs?tail=50`);
        const data = await response.json();

        if (data.logs) {
          setLogs(data.logs.map((log: any) => log.text));
        }

        // Check status
        const statusResponse = await agentFetch(`/run/${id}/status`);
        const statusData = await statusResponse.json();

        if (statusData.status?.status) {
          setStatus(statusData.status.status);

          if (statusData.status.url) {
            setPreviewUrl(statusData.status.url);
          }

          if (statusData.status.status !== "running") {
            clearInterval(interval);
          }
        }
      } catch {
        // Polling failure is transient; next tick retries automatically
      }
    }, 1000);

    return () => clearInterval(interval);
  };

  const openPreview = () => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
    }
  };

  if (detecting) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <LoadingPanel message="Detecting project..." />
      </div>
    );
  }

  if (detectError) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          <span>{detectError}</span>
        </div>
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
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          title="Detection Failed"
          message="Could not detect a runnable project in the workspace."
          action={{ label: "Retry Detection", onClick: detectProject }}
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col gap-4 p-4">
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
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
          }
          title="No Runs Yet"
          message="No runnable project detected. Execute a command to see results here."
          action={{ label: "Retry Detection", onClick: detectProject }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Run & Preview</h2>
        <div className="text-sm opacity-70">
          Detected: {project.type} project
        </div>
      </div>

      {/* Project Info */}
      <div className="border-codin-border rounded border border-solid p-3">
        <div className="text-sm font-medium">Configuration</div>
        <div className="mt-2 text-xs opacity-70">
          {project.profile.installCmd && (
            <div>Install: {project.profile.installCmd}</div>
          )}
          <div>Run: {project.profile.runCmd}</div>
          <div>Port: {project.profile.port}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {project.profile.installCmd && (
          <button
            onClick={install}
            disabled={status === "running"}
            className="bg-codin-bg-surface rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            Install Dependencies
          </button>
        )}
        {status === "stopped" ? (
          <button
            onClick={start}
            className="bg-codin-indigo-700 rounded px-3 py-2 text-sm text-white"
          >
            Start
          </button>
        ) : (
          <button
            onClick={stop}
            className="bg-codin-bg-surface rounded px-3 py-2 text-sm"
          >
            Stop
          </button>
        )}
        {previewUrl && (
          <button
            onClick={openPreview}
            className="bg-codin-indigo-700 rounded px-3 py-2 text-sm text-white"
          >
            Open Preview
          </button>
        )}
      </div>

      {/* Status */}
      {status !== "stopped" && (
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${status === "running" ? "bg-green-500" : "bg-red-500"}`}
          />
          <div className="text-sm">{status}</div>
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Logs</div>
          <div className="border-codin-border bg-codin-bg-surface max-h-64 overflow-y-auto rounded border border-solid p-2 font-mono text-xs">
            {logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Preview (iframe) */}
      {previewUrl && status === "running" && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Preview</div>
          <div className="border-codin-border h-96 rounded border border-solid">
            <iframe
              src={previewUrl}
              className="h-full w-full"
              title="Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
