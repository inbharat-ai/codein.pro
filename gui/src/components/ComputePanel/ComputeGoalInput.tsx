/** Goal input area with policy toggles and submit button. */
import React from "react";

interface ComputeGoalInputProps {
  goal: string;
  onGoalChange: (goal: string) => void;
  allowNetwork: boolean;
  onAllowNetworkChange: (v: boolean) => void;
  allowEscalation: boolean;
  onAllowEscalationChange: (v: boolean) => void;
  allowFSWrite: boolean;
  onAllowFSWriteChange: (v: boolean) => void;
  useIpcCompute: boolean;
  isSubmitting: boolean;
  isOffline: boolean;
  onSubmit: () => void;
}

export const ComputeGoalInput: React.FC<ComputeGoalInputProps> = ({
  goal,
  onGoalChange,
  allowNetwork,
  onAllowNetworkChange,
  allowEscalation,
  onAllowEscalationChange,
  allowFSWrite,
  onAllowFSWriteChange,
  useIpcCompute,
  isSubmitting,
  isOffline,
  onSubmit,
}) => {
  return (
    <div className="compute-goal">
      <span className="compute-goal__label">
        What should CodeIn Compute do?
      </span>
      <div className="compute-goal__input-row">
        <textarea
          className="compute-goal__textarea"
          value={goal}
          onChange={(e) => onGoalChange(e.target.value)}
          placeholder="Describe your goal... e.g., 'Fix the failing tests in src/utils' or 'Create a REST API spec for user management'"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              onSubmit();
            }
          }}
        />
      </div>
      <div className="compute-goal__actions">
        <div className="compute-policy">
          <label
            className={`compute-policy__toggle ${allowNetwork ? "compute-policy__toggle--active" : ""}`}
          >
            <input
              type="checkbox"
              checked={allowNetwork}
              onChange={(e) => onAllowNetworkChange(e.target.checked)}
              disabled={useIpcCompute}
            />
            Network
          </label>
          <label
            className={`compute-policy__toggle ${allowEscalation ? "compute-policy__toggle--active" : ""}`}
          >
            <input
              type="checkbox"
              checked={allowEscalation}
              onChange={(e) => onAllowEscalationChange(e.target.checked)}
              disabled={useIpcCompute}
            />
            External AI
          </label>
          <label
            className={`compute-policy__toggle ${allowFSWrite ? "compute-policy__toggle--active" : ""}`}
          >
            <input
              type="checkbox"
              checked={allowFSWrite}
              onChange={(e) => onAllowFSWriteChange(e.target.checked)}
            />
            Write Files
          </label>
        </div>
        <button
          className="codin-btn--primary codin-focus-ring"
          onClick={onSubmit}
          disabled={!goal.trim() || isSubmitting || isOffline}
          style={{
            padding: "6px 16px",
            fontSize: "0.85rem",
            whiteSpace: "nowrap",
          }}
        >
          {isSubmitting ? "Starting..." : "Run"}
        </button>
      </div>
    </div>
  );
};
