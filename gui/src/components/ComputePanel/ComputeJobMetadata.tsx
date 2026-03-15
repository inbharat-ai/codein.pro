/** Terminal-state job metadata: tokens, cost, models, escalations. */
import React from "react";

import type { Job } from "./compute-types";

interface ComputeJobMetadataProps {
  job: Job;
}

export const ComputeJobMetadata: React.FC<ComputeJobMetadataProps> = ({
  job,
}) => {
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        fontSize: "0.75rem",
        color: "var(--codin-fg-muted)",
      }}
    >
      <span>Tokens: {job.metadata.tokensUsed.toLocaleString()}</span>
      {job.metadata.totalCostEstimate > 0 && (
        <span>Cost: ${job.metadata.totalCostEstimate.toFixed(4)}</span>
      )}
      {job.metadata.modelsUsed.length > 0 && (
        <span>Models: {job.metadata.modelsUsed.join(", ")}</span>
      )}
      {job.metadata.escalationCount > 0 && (
        <span>Escalations: {job.metadata.escalationCount}</span>
      )}
    </div>
  );
};
