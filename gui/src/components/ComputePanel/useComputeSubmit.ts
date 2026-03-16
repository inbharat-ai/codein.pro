/** Submit job and run workflow logic for compute jobs. */
import { agentFetch } from "./compute-api";
import type { Job } from "./compute-types";

interface UseComputeSubmitOptions {
  computeBridge: any;
  useIpcCompute: boolean;
  allowNetwork: boolean;
  allowEscalation: boolean;
  allowFSWrite: boolean;
  setActiveJob: React.Dispatch<React.SetStateAction<Job | null>>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  subscribeToJob: (jobId: string) => void;
}

export function useComputeSubmit({
  computeBridge,
  useIpcCompute,
  allowNetwork,
  allowEscalation,
  allowFSWrite,
  setActiveJob,
  setIsSubmitting,
  setError,
  subscribeToJob,
}: UseComputeSubmitOptions) {
  const submitJob = async (goal: string) => {
    if (!goal.trim()) return null;
    setIsSubmitting(true);
    setError(null);

    try {
      let result: any;
      if (useIpcCompute && computeBridge) {
        result = await computeBridge.submitJob({
          goal: goal.trim(),
          policy: { allowNetwork, allowEscalation, allowFSWrite },
        });
      } else {
        result = await agentFetch<{ job: Job }>("/compute/jobs", {
          method: "POST",
          body: JSON.stringify({
            goal: goal.trim(),
            policy: { allowNetwork, allowEscalation, allowFSWrite },
          }),
        });
      }

      const job = result.job || result;
      setActiveJob(job as Job);
      subscribeToJob((job as Job).id);
      return job as Job;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit job");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const runWorkflow = async (name: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      let result: any;
      if (useIpcCompute && computeBridge) {
        result = await computeBridge.runWorkflow(name, {});
      } else {
        result = await agentFetch<{ job: Job }>(`/compute/workflows/${name}`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      }

      const job = result.job || result;
      setActiveJob(job as Job);
      subscribeToJob((job as Job).id);
      return job as Job;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run workflow");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitJob, runWorkflow };
}
