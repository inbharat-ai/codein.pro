/**
 * CodeIn Compute Panel
 *
 * UI for the Compute job runner.
 * - Submit goals (typed or voice)
 * - View plan preview
 * - Live progress timeline
 * - Artifact panel
 * - Pause / Resume / Cancel
 * - Model badge + confidence per step
 * - Offline indicator
 */
import React, { useState } from "react";

import { ComputeArtifacts } from "./ComputeArtifacts";
import { ComputeGoalInput } from "./ComputeGoalInput";
import { ComputeHeader } from "./ComputeHeader";
import { ComputeHistory } from "./ComputeHistory";
import { ComputeJobMetadata } from "./ComputeJobMetadata";
import { ComputeJobView } from "./ComputeJobView";
import { ComputeLogs } from "./ComputeLogs";
import { ComputeWorkflows } from "./ComputeWorkflows";
import { useComputeJob } from "./useComputeJob";
import "./ComputePanel.css";

const ComputePanel: React.FC = () => {
  const [goal, setGoal] = useState("");
  const [view, setView] = useState<"input" | "running" | "history">("input");
  const job = useComputeJob();

  const handleSubmit = async () => {
    const result = await job.submitJob(goal);
    if (result) {
      setView("running");
      setGoal("");
    }
  };

  const handleRunWorkflow = async (name: string) => {
    const result = await job.runWorkflow(name);
    if (result) setView("running");
  };

  const handleViewJob = async (jobId: string) => {
    const result = await job.viewJob(jobId);
    if (result) setView("running");
  };

  return (
    <div className="compute-panel codin-scrollbar">
      <ComputeHeader
        isOffline={job.isOffline}
        onNewJob={() => {
          setView("input");
          job.setActiveJob(null);
        }}
        onShowHistory={() => {
          setView("history");
          job.loadJobs();
        }}
      />

      {/* Error banner */}
      {job.error && (
        <div
          className="codin-error-panel--error"
          role="alert"
          aria-live="assertive"
          style={{ padding: "8px 12px", fontSize: "0.8rem" }}
        >
          {job.error}
          <button
            onClick={() => job.setError(null)}
            aria-label="Dismiss error"
            className="compute-error-dismiss"
          >
            x
          </button>
        </div>
      )}

      {/* Input View */}
      {view === "input" && (
        <>
          <ComputeGoalInput
            goal={goal}
            onGoalChange={setGoal}
            allowNetwork={job.allowNetwork}
            onAllowNetworkChange={job.setAllowNetwork}
            allowEscalation={job.allowEscalation}
            onAllowEscalationChange={job.setAllowEscalation}
            allowFSWrite={job.allowFSWrite}
            onAllowFSWriteChange={job.setAllowFSWrite}
            useIpcCompute={job.useIpcCompute}
            isSubmitting={job.isSubmitting}
            isOffline={job.isOffline}
            onSubmit={handleSubmit}
          />
          <ComputeWorkflows
            useIpcCompute={job.useIpcCompute}
            onRunWorkflow={handleRunWorkflow}
          />
        </>
      )}

      {/* Running / Results View */}
      {view === "running" && job.activeJob && (
        <>
          <ComputeJobView
            job={job.activeJob}
            isTerminal={!!job.isTerminal}
            onPause={job.pauseJob}
            onResume={job.resumeJob}
            onCancel={job.cancelJob}
          />
          <ComputeArtifacts artifacts={job.activeJob.artifacts} />
          <ComputeLogs logs={job.activeJob.logs} logsEndRef={job.logsEndRef} />
          {job.isTerminal && <ComputeJobMetadata job={job.activeJob} />}
        </>
      )}

      {/* History View */}
      {view === "history" && (
        <ComputeHistory jobs={job.jobs} onViewJob={handleViewJob} />
      )}
    </div>
  );
};

export default ComputePanel;
