/** Jobs tab: submit jobs and check job status. */
import React, { useState } from "react";

import type { JobStatus } from "./gpu-types";

interface GpuJobsTabProps {
  onSubmitJob: (input: string) => Promise<string | null>;
  onCheckJob: (jobId: string) => Promise<JobStatus | null>;
}

export const GpuJobsTab: React.FC<GpuJobsTabProps> = ({
  onSubmitJob,
  onCheckJob,
}) => {
  const [jobInput, setJobInput] = useState("");
  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [submittingJob, setSubmittingJob] = useState(false);
  const [checkingJob, setCheckingJob] = useState(false);

  const handleSubmit = async () => {
    setSubmittingJob(true);
    const id = await onSubmitJob(jobInput);
    if (id !== null) setJobId(id);
    setSubmittingJob(false);
  };

  const handleCheck = async () => {
    setCheckingJob(true);
    const status = await onCheckJob(jobId);
    if (status) setJobStatus(status);
    setCheckingJob(false);
  };

  return (
    <>
      <div className="gpu-connect">
        <div className="gpu-connect__field">
          <label className="gpu-connect__label">
            Job Input (JSON or text prompt)
          </label>
          <textarea
            className="gpu-connect__input"
            style={{
              minHeight: 80,
              resize: "vertical",
              fontFamily: "var(--codin-font-mono)",
            }}
            placeholder='{"prompt": "hello"} or plain text'
            value={jobInput}
            onChange={(e) => setJobInput(e.target.value)}
          />
        </div>
        <button
          className="gpu-btn gpu-btn--primary"
          onClick={handleSubmit}
          disabled={submittingJob || !jobInput.trim()}
        >
          {submittingJob && <span className="gpu-spinner" />}
          {submittingJob ? "Submitting..." : "Submit Job"}
        </button>
      </div>

      <div
        className="gpu-connect"
        style={{ marginTop: "var(--codin-space-2)" }}
      >
        <div className="gpu-connect__row">
          <div className="gpu-connect__field">
            <label className="gpu-connect__label">Job ID</label>
            <input
              className="gpu-connect__input"
              placeholder="Enter job ID to check status"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCheck()}
            />
          </div>
          <button
            className="gpu-btn gpu-btn--ghost"
            onClick={handleCheck}
            disabled={checkingJob || !jobId.trim()}
            style={{ alignSelf: "flex-end" }}
          >
            {checkingJob && <span className="gpu-spinner" />}
            {checkingJob ? "Checking..." : "Check Status"}
          </button>
        </div>

        {jobStatus && (
          <div
            style={{
              padding: "var(--codin-space-3)",
              background: "var(--codin-bg-surface)",
              borderRadius: "var(--codin-radius-md)",
              fontFamily: "var(--codin-font-mono)",
              fontSize: "var(--codin-font-size-xs)",
              color: "var(--codin-fg-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {JSON.stringify(jobStatus, null, 2)}
          </div>
        )}
      </div>
    </>
  );
};
