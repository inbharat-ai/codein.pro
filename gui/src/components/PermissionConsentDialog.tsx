import { useContext, useEffect, useState } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { agentFetch } from "../util/agentConfig";

interface ConsentRequest {
  requestId: string;
  toolName: string;
  category: string;
  intent: string;
  details: any;
  risk: "low" | "medium" | "high";
  timestamp: number;
}

export function PermissionConsentDialog() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [queue, setQueue] = useState<ConsentRequest[]>([]);
  const [currentRequest, setCurrentRequest] = useState<ConsentRequest | null>(
    null,
  );
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    // Poll for pending consent requests
    const interval = setInterval(loadQueue, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (queue.length > 0 && !currentRequest) {
      setCurrentRequest(queue[0]);
    }
  }, [queue, currentRequest]);

  const loadQueue = async () => {
    try {
      const response = await agentFetch("/permissions/queue");
      const data = await response.json();
      setQueue(data.queue || []);
    } catch (error) {
      console.error("Failed to load consent queue:", error);
    }
  };

  const respond = async (decision: "allow" | "deny") => {
    if (!currentRequest) return;

    try {
      await agentFetch("/permissions/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: currentRequest.requestId,
          response: { decision, remember },
        }),
      });

      setCurrentRequest(null);
      setRemember(false);
      await loadQueue();
    } catch (error) {
      console.error("Failed to respond to consent:", error);
    }
  };

  if (!currentRequest) {
    return null;
  }

  const getRiskColor = () => {
    switch (currentRequest.risk) {
      case "high":
        return "text-red-500";
      case "medium":
        return "text-yellow-500";
      case "low":
        return "text-green-500";
      default:
        return "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="border-vsc-input-border bg-vsc-background w-full max-w-md rounded-lg border border-solid p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Permission Required</h2>
          <span className={`text-sm font-medium ${getRiskColor()}`}>
            {currentRequest.risk.toUpperCase()} RISK
          </span>
        </div>

        <div className="mb-4 space-y-2">
          <div>
            <div className="text-sm font-medium opacity-70">Tool</div>
            <div className="text-base">
              {currentRequest.toolName} ({currentRequest.category})
            </div>
          </div>

          <div>
            <div className="text-sm font-medium opacity-70">Intent</div>
            <div className="bg-vsc-input-background rounded p-2 text-sm">
              {currentRequest.intent}
            </div>
          </div>

          {currentRequest.details &&
            Object.keys(currentRequest.details).length > 0 && (
              <div>
                <div className="text-sm font-medium opacity-70">Details</div>
                <div className="bg-vsc-input-background max-h-32 overflow-y-auto rounded p-2 font-mono text-xs">
                  {JSON.stringify(currentRequest.details, null, 2)}
                </div>
              </div>
            )}
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded"
            />
            <span>Remember this decision for this tool</span>
          </label>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => respond("allow")}
            className="bg-vsc-button text-vsc-button-foreground flex-1 rounded px-4 py-2 text-sm font-medium"
          >
            Allow
          </button>
          <button
            onClick={() => respond("deny")}
            className="bg-vsc-input-background flex-1 rounded px-4 py-2 text-sm font-medium"
          >
            Deny
          </button>
        </div>

        {queue.length > 1 && (
          <div className="mt-2 text-center text-xs opacity-70">
            {queue.length - 1} more request{queue.length > 2 ? "s" : ""} waiting
          </div>
        )}
      </div>
    </div>
  );
}
