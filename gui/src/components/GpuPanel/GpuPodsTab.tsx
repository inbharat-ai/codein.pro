/** Pods tab: active pod display with stop/refresh. */
import React from "react";

import type { GpuStatus, GpuTab } from "./gpu-types";

interface GpuPodsTabProps {
  status: GpuStatus | null;
  loading: boolean;
  onStop: () => void;
  onRefresh: () => void;
  onSetTab: (tab: GpuTab) => void;
}

export const GpuPodsTab: React.FC<GpuPodsTabProps> = ({
  status,
  loading,
  onStop,
  onRefresh,
  onSetTab,
}) => {
  return (
    <>
      {loading ? (
        <div className="gpu-loading">
          <span className="gpu-spinner" /> Loading pods...
        </div>
      ) : !status?.activePodId ? (
        <div className="gpu-empty">
          No active pods. Go to GPU Types tab to create one.
          <br />
          <button
            className="gpu-btn gpu-btn--ghost"
            style={{ marginTop: 12 }}
            onClick={() => onSetTab("gpus")}
          >
            Browse GPUs
          </button>
        </div>
      ) : (
        <div className="gpu-pod-list">
          <div className="gpu-pod-card">
            <div className="gpu-pod-card__info">
              <div className="gpu-pod-card__name">Pod {status.activePodId}</div>
              <div className="gpu-pod-card__meta">
                {status.uptime
                  ? `Uptime: ${Math.round(status.uptime / 60)}m`
                  : ""}
              </div>
            </div>
            <div className="gpu-pod-card__actions">
              <span className="gpu-pod-card__status gpu-pod-card__status--running">
                Running
              </span>
              <button className="gpu-btn gpu-btn--danger" onClick={onStop}>
                Stop
              </button>
            </div>
          </div>
        </div>
      )}
      <button className="gpu-btn gpu-btn--ghost" onClick={onRefresh}>
        Refresh
      </button>
    </>
  );
};
