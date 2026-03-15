/** GPU Types tab: grid of available GPUs with selection. */
import React from "react";

import type { GpuType } from "./gpu-types";

interface GpuTypesTabProps {
  gpuTypes: GpuType[];
  selectedGpu: string;
  loading: boolean;
  onSelectGpu: (id: string) => void;
  onRetry: () => void;
}

export const GpuTypesTab: React.FC<GpuTypesTabProps> = ({
  gpuTypes,
  selectedGpu,
  loading,
  onSelectGpu,
  onRetry,
}) => {
  if (loading) {
    return (
      <div className="gpu-loading">
        <span className="gpu-spinner" /> Loading GPU types...
      </div>
    );
  }

  if (gpuTypes.length === 0) {
    return (
      <div className="gpu-empty">
        No GPU types available. Check your RunPod connection.
        <br />
        <button
          className="gpu-btn gpu-btn--ghost"
          style={{ marginTop: 12 }}
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          fontSize: "var(--codin-font-size-sm)",
          color: "var(--codin-fg-muted)",
        }}
      >
        Select a GPU to create a pod ({gpuTypes.length} available)
      </div>
      <div className="gpu-types-grid">
        {gpuTypes.map((gpu) => (
          <div
            key={gpu.id}
            className={`gpu-type-card ${selectedGpu === gpu.id ? "gpu-type-card--selected" : ""}`}
            onClick={() => onSelectGpu(gpu.id)}
          >
            <div className="gpu-type-card__name">
              {gpu.displayName || gpu.id}
            </div>
            {gpu.memoryInGb && (
              <div className="gpu-type-card__detail">
                {gpu.memoryInGb} GB VRAM
              </div>
            )}
            <div className="gpu-type-card__detail">
              {gpu.secureCloud && "Secure"} {gpu.communityCloud && "Community"}
            </div>
            {gpu.lowestPrice && (
              <div className="gpu-type-card__price">
                ${gpu.lowestPrice.minimumBidPrice?.toFixed(3)}/hr spot
                {" / "}${gpu.lowestPrice.uninterruptablePrice?.toFixed(3)}/hr
                on-demand
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};
