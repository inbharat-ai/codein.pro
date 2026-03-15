/** GPU panel header with connection status and disconnect button. */
import React from "react";

interface GpuHeaderProps {
  connected: boolean;
  onStop: () => void;
}

export const GpuHeader: React.FC<GpuHeaderProps> = ({ connected, onStop }) => {
  return (
    <div className="gpu-header">
      <div className="gpu-header__title">
        <svg
          className="gpu-header__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="8" y="8" width="8" height="8" rx="1" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
        </svg>
        GPU Compute
        <span
          className={`gpu-header__badge ${connected ? "gpu-header__badge--connected" : "gpu-header__badge--disconnected"}`}
        >
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      {connected && (
        <button className="gpu-btn gpu-btn--danger" onClick={onStop}>
          Disconnect
        </button>
      )}
    </div>
  );
};
