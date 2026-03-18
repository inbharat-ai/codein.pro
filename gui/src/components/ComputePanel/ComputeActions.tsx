/** Pause / Resume / Cancel controls for a running compute job. */
import React from "react";

interface ComputeActionsProps {
  jobStatus: string;
  isTerminal: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export const ComputeActions: React.FC<ComputeActionsProps> = ({
  jobStatus,
  isTerminal,
  onPause,
  onResume,
  onCancel,
}) => {
  if (isTerminal) return null;

  return (
    <div className="compute-controls">
      {jobStatus === "running" && (
        <button
          className="codin-btn--ghost codin-focus-ring"
          onClick={onPause}
          style={{ fontSize: "0.8rem", padding: "4px 12px" }}
        >
          Pause
        </button>
      )}
      {jobStatus === "paused" && (
        <button
          className="codin-btn--primary codin-focus-ring"
          onClick={onResume}
          style={{ fontSize: "0.8rem", padding: "4px 12px" }}
        >
          Resume
        </button>
      )}
      <button
        className="codin-btn--ghost codin-focus-ring"
        onClick={onCancel}
        style={{
          fontSize: "0.8rem",
          padding: "4px 12px",
          color: "var(--codin-error, #ef4444)",
        }}
      >
        Cancel
      </button>
    </div>
  );
};
