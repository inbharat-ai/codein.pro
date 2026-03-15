/** History view: list of past compute jobs. */
import React from "react";

import { formatTime } from "./compute-utils";

interface JobSummary {
  id: string;
  status: string;
  goal: string;
  createdAt: string;
}

interface ComputeHistoryProps {
  jobs: JobSummary[];
  onViewJob: (jobId: string) => void;
}

export const ComputeHistory: React.FC<ComputeHistoryProps> = ({
  jobs,
  onViewJob,
}) => {
  if (jobs.length === 0) {
    return (
      <div className="compute-empty">
        <span className="compute-empty__icon">Jobs</span>
        <span className="compute-empty__text">
          No compute jobs yet. Submit a goal to get started.
        </span>
      </div>
    );
  }

  return (
    <div className="compute-jobs">
      {jobs.map((j) => (
        <div
          key={j.id}
          className="compute-job-card"
          onClick={() => onViewJob(j.id)}
        >
          <span
            className={`compute-job-card__status compute-job-card__status--${j.status}`}
          />
          <div className="compute-job-card__info">
            <div className="compute-job-card__goal">{j.goal}</div>
            <div className="compute-job-card__meta">
              {j.status} / {formatTime(j.createdAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
