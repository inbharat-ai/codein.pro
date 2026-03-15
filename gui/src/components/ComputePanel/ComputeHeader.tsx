/** Compute panel header with title, offline indicator, navigation. */
import React from "react";

interface ComputeHeaderProps {
  isOffline: boolean;
  onNewJob: () => void;
  onShowHistory: () => void;
}

export const ComputeHeader: React.FC<ComputeHeaderProps> = ({
  isOffline,
  onNewJob,
  onShowHistory,
}) => {
  return (
    <div className="compute-header">
      <div className="compute-header__title">
        <span className="compute-header__icon">Compute</span>
        CodeIn Compute
        <span className="compute-header__badge">BETA</span>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {isOffline && <span className="compute-header__offline">Offline</span>}
        <button
          className="codin-btn--ghost"
          onClick={onNewJob}
          style={{ fontSize: "0.8rem", padding: "2px 8px" }}
        >
          + New
        </button>
        <button
          className="codin-btn--ghost"
          onClick={onShowHistory}
          style={{ fontSize: "0.8rem", padding: "2px 8px" }}
        >
          History
        </button>
      </div>
    </div>
  );
};
