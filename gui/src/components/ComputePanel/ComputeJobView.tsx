/** Running / completed job view: status, controls, step timeline. */
import React from "react";

import { ComputeActions } from "./ComputeActions";
import { ComputeStatus } from "./ComputeStatus";
import type { Job } from "./compute-types";

interface ComputeJobViewProps {
  job: Job;
  isTerminal: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export const ComputeJobView: React.FC<ComputeJobViewProps> = ({
  job,
  isTerminal,
  onPause,
  onResume,
  onCancel,
}) => {
  return (
    <>
      <ComputeStatus job={job} />
      <ComputeActions
        jobStatus={job.status}
        isTerminal={isTerminal}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    </>
  );
};
