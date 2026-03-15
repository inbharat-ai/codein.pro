/** Connect tab: API key entry, budget, TTL, connect button. */
import React, { useState } from "react";

interface GpuConnectTabProps {
  connected: boolean;
  isOffline: boolean;
  onConnect: (
    apiKey: string,
    maxBudget: string,
    ttl: string,
  ) => Promise<boolean>;
  onConnected: () => void;
}

export const GpuConnectTab: React.FC<GpuConnectTabProps> = ({
  connected,
  isOffline,
  onConnect,
  onConnected,
}) => {
  const [apiKey, setApiKey] = useState("");
  const [maxBudget, setMaxBudget] = useState("10");
  const [ttl, setTtl] = useState("30");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    const success = await onConnect(apiKey, maxBudget, ttl);
    if (success) onConnected();
    setConnecting(false);
  };

  return (
    <div className="gpu-connect">
      {connected ? (
        <div className="gpu-empty" style={{ color: "var(--codin-fg-primary)" }}>
          Connected to RunPod. Switch to GPU Types or Pods tab to get started.
        </div>
      ) : (
        <>
          <div className="gpu-connect__field">
            <label className="gpu-connect__label">RunPod API Key</label>
            <input
              className="gpu-connect__input"
              type="password"
              placeholder="rp_xxxxxxxxxx"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>
          <div className="gpu-connect__row">
            <div className="gpu-connect__field">
              <label className="gpu-connect__label">Max Budget (USD)</label>
              <input
                className="gpu-connect__input"
                type="number"
                min="1"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
              />
            </div>
            <div className="gpu-connect__field">
              <label className="gpu-connect__label">Session TTL (min)</label>
              <input
                className="gpu-connect__input"
                type="number"
                min="5"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
              />
            </div>
          </div>
          <button
            className="gpu-btn gpu-btn--primary"
            onClick={handleConnect}
            disabled={connecting || isOffline}
          >
            {connecting && <span className="gpu-spinner" />}
            {connecting ? "Connecting..." : "Connect to RunPod"}
          </button>
        </>
      )}
    </div>
  );
};
