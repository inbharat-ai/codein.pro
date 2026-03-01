import { useContext, useEffect, useRef, useState } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { agentFetch } from "../util/agentConfig";

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
    try {
      const workspacePath = (ideMessenger as any).workspacePath || ".";
      const response = await agentFetch("/run/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspacePath }),
      });

      const data = await response.json();
      setProject(data.project);
    } catch (error) {
      console.error("Failed to detect project:", error);
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
    } catch (error) {
      console.error("Install failed:", error);
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
    } catch (error) {
      console.error("Failed to start:", error);
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
    } catch (error) {
      console.error("Failed to stop:", error);
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
      } catch (error) {
        console.error("Failed to poll logs:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  };

  const openPreview = () => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
    }
  };

  if (!project) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-sm opacity-70">Detecting project...</div>
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
      <div className="border-vsc-input-border rounded border border-solid p-3">
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
            className="bg-vsc-input-background rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            Install Dependencies
          </button>
        )}
        {status === "stopped" ? (
          <button
            onClick={start}
            className="bg-vsc-button text-vsc-button-foreground rounded px-3 py-2 text-sm"
          >
            Start
          </button>
        ) : (
          <button
            onClick={stop}
            className="bg-vsc-input-background rounded px-3 py-2 text-sm"
          >
            Stop
          </button>
        )}
        {previewUrl && (
          <button
            onClick={openPreview}
            className="bg-vsc-button text-vsc-button-foreground rounded px-3 py-2 text-sm"
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
          <div className="border-vsc-input-border bg-vsc-input-background max-h-64 overflow-y-auto rounded border border-solid p-2 font-mono text-xs">
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
          <div className="border-vsc-input-border h-96 rounded border border-solid">
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
