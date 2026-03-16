/** Pause / resume / cancel / view-details actions for compute jobs. */
import { agentFetch } from "./compute-api";
import type { Job } from "./compute-types";

interface UseComputeActionsOptions {
  activeJob: Job | null;
  computeBridge: any;
  useIpcCompute: boolean;
  setActiveJob: React.Dispatch<React.SetStateAction<Job | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  subscribeToJob: (jobId: string) => void;
}

export function useComputeActions({
  activeJob,
  computeBridge,
  useIpcCompute,
  setActiveJob,
  setError,
  subscribeToJob,
}: UseComputeActionsOptions) {
  const pauseJob = async () => {
    if (!activeJob) return;
    if (useIpcCompute && computeBridge) {
      await computeBridge.pauseJob(activeJob.id);
      return;
    }
    await agentFetch(`/compute/jobs/${activeJob.id}/pause`, {
      method: "POST",
    });
  };

  const resumeJob = async () => {
    if (!activeJob) return;
    if (useIpcCompute && computeBridge) {
      await computeBridge.resumeJob(activeJob.id);
      return;
    }
    await agentFetch(`/compute/jobs/${activeJob.id}/resume`, {
      method: "POST",
    });
  };

  const cancelJob = async () => {
    if (!activeJob) return;
    if (useIpcCompute && computeBridge) {
      await computeBridge.cancelJob(activeJob.id);
      return;
    }
    await agentFetch(`/compute/jobs/${activeJob.id}/cancel`, {
      method: "POST",
    });
  };

  const viewJob = async (jobId: string) => {
    try {
      let result: any;
      if (useIpcCompute && computeBridge) {
        result = await computeBridge.getJob(jobId);
      } else {
        result = await agentFetch<{ job: Job }>(`/compute/jobs/${jobId}`);
      }
      const job = result.job || result;
      setActiveJob(job as Job);
      if (job.status === "running" || job.status === "planning") {
        subscribeToJob(jobId);
      }
      return job as Job;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load job details",
      );
      return null;
    }
  };

  return { pauseJob, resumeJob, cancelJob, viewJob };
}
