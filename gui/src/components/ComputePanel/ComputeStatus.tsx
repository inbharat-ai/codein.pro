/** Job status header and execution plan / step timeline. */
import React from "react";

import type { Job } from "./compute-types";

interface ComputeStatusProps {
  job: Job;
}

export const ComputeStatus: React.FC<ComputeStatusProps> = ({ job }) => {
  return (
    <>
      {/* Job info */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          className={`compute-job-card__status compute-job-card__status--${job.status}`}
        />
        <span style={{ fontSize: "0.85rem", fontWeight: 500, flex: 1 }}>
          {job.goalOriginal || job.goal}
        </span>
        {job.language !== "en" && (
          <span style={{ fontSize: "0.7rem", color: "var(--codin-fg-muted)" }}>
            {job.language}
          </span>
        )}
      </div>

      {/* Plan / Steps */}
      {job.steps.length > 0 && (
        <div className="compute-plan">
          <div className="compute-plan__title">
            Execution Plan {job.plan ? `-- ${job.plan}` : ""}
          </div>
          {job.steps.map((step, i) => (
            <div
              key={step.id}
              className={`compute-plan__step compute-plan__step--${step.status}`}
            >
              <span className="compute-plan__step-num">
                {step.status === "completed"
                  ? "ok"
                  : step.status === "running"
                    ? ">"
                    : step.status === "failed"
                      ? "x"
                      : i + 1}
              </span>
              <span className="compute-plan__step-desc">
                {step.description}
              </span>
              {step.model && (
                <span className="compute-plan__step-badge">{step.model}</span>
              )}
              {step.confidence !== null && step.confidence !== undefined && (
                <span className="compute-plan__step-badge">
                  {Math.round(step.confidence * 100)}%
                </span>
              )}
              {step.escalated && (
                <span className="compute-plan__step-badge">escalated</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
