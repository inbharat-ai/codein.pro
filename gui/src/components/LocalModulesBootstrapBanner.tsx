import { useEffect, useMemo, useState } from "react";
import Alert from "./gui/Alert";

type BootstrapStatus = {
  stage: "ready" | "deferred" | "error";
  message: string;
  updatedAt: string;
  nextAttemptAt?: string;
  details?: Record<string, any>;
} | null;

function formatNextAttempt(nextAttemptAt?: string): string | null {
  if (!nextAttemptAt) {
    return null;
  }
  const timestamp = Date.parse(nextAttemptAt);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Date(timestamp).toLocaleString();
}

function formatDetails(details: Record<string, any>): string[] {
  const labels: Record<string, string> = {
    scriptPath: "Bootstrap script",
    code: "Exit code",
    stderr: "Error output",
    ai4bharat: "AI4Bharat",
    stt: "Speech-to-text",
    stt_note: "STT note",
    tts: "Text-to-speech",
    tts_note: "TTS note",
    tts_fallback: "TTS fallback",
  };

  return Object.entries(details).map(([key, value]) => {
    const label = labels[key] || key;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return `${label}: ${text}`;
  });
}

export function LocalModulesBootstrapBanner() {
  const [status, setStatus] = useState<BootstrapStatus>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const canUseBootstrap =
    typeof window !== "undefined" && !!window.codinAPI?.bootstrap;

  useEffect(() => {
    if (!canUseBootstrap) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      const next = await window.codinAPI.bootstrap.getStatus();
      if (!cancelled) {
        setStatus(next);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [canUseBootstrap]);

  const nextAttemptLabel = useMemo(() => {
    return formatNextAttempt(status?.nextAttemptAt);
  }, [status]);

  if (!canUseBootstrap || !status || status.stage === "ready") {
    return null;
  }

  const isDeferred = status.stage === "deferred";

  const handleRetry = async () => {
    if (!window.codinAPI?.bootstrap) {
      return;
    }
    setIsRetrying(true);
    try {
      const next = await window.codinAPI.bootstrap.retry();
      setStatus(next);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Alert type={isDeferred ? "warning" : "error"} className="max-w-3xl">
      <div className="flex flex-col gap-2">
        <div className="font-medium">Local modules not ready</div>
        <div className="text-description text-sm">{status.message}</div>
        {nextAttemptLabel && (
          <div className="text-description text-xs">
            Next auto retry: {nextAttemptLabel}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="bg-vsc-button text-vsc-button-foreground rounded px-3 py-1 text-xs font-semibold disabled:opacity-60"
          >
            {isRetrying ? "Retrying..." : "Retry install"}
          </button>
          {status.details && (
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="bg-vsc-input-background text-vsc-foreground rounded px-3 py-1 text-xs font-semibold"
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
          )}
          <span className="text-description text-xs">
            Installs local LLM, STT/TTS, and AI4Bharat when online.
          </span>
        </div>
        {showDetails && status.details && (
          <div className="bg-vsc-input-background text-description rounded p-2 text-xs">
            <ul className="list-disc space-y-1 pl-4">
              {formatDetails(status.details).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Alert>
  );
}
