/** SSE event subscription logic for compute jobs. */
import { useCallback, useEffect, useRef } from "react";

import { AGENT_BASE, agentFetch } from "./compute-api";
import type { Job } from "./compute-types";
import type { ComputeBridge } from "./useComputeActions";

const SSE_EVENTS = [
  "job.progress",
  "job.step",
  "plan.ready",
  "job.artifact",
  "job.complete",
  "job.error",
  "job.cancelled",
] as const;

interface UseComputeSSEOptions {
  computeBridge: ComputeBridge | null | undefined;
  useIpcCompute: boolean;
  setActiveJob: React.Dispatch<React.SetStateAction<Job | null>>;
  loadJobs: () => Promise<void>;
}

export function useComputeSSE({
  computeBridge,
  useIpcCompute,
  setActiveJob,
  loadJobs,
}: UseComputeSSEOptions) {
  const eventSubscriptionRef = useRef<{ close: () => void } | null>(null);

  const subscribeToJob = useCallback(
    (jobId: string) => {
      if (eventSubscriptionRef.current) {
        eventSubscriptionRef.current.close();
      }

      const parsePayload = (raw: unknown) => {
        if (!raw) return null;
        if (typeof raw === "string") {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        }
        return raw;
      };

      const handleEvent = (eventName: string, rawPayload: unknown) => {
        const payload = parsePayload(rawPayload);
        if (!payload) return;

        if (eventName === "job.progress") {
          setActiveJob((prev) =>
            prev
              ? { ...prev, status: payload.data?.status || prev.status }
              : prev,
          );
          return;
        }

        if (eventName === "job.step") {
          setActiveJob((prev) => {
            if (!prev) return prev;
            const steps = prev.steps.map((s) =>
              s.id === payload.data?.stepId
                ? {
                    ...s,
                    status: payload.data.status,
                    confidence: payload.data.confidence,
                    model: payload.data.model,
                  }
                : s,
            );
            return { ...prev, steps };
          });
          return;
        }

        if (eventName === "plan.ready") {
          const fetchJob =
            useIpcCompute && computeBridge
              ? computeBridge.getJob(jobId)
              : agentFetch<{ job: Job }>(`/compute/jobs/${jobId}`);
          Promise.resolve(fetchJob).then((result: { job?: Job } | Job) => {
            const job =
              ("job" in result ? result.job : undefined) ?? (result as Job);
            setActiveJob(job);
          });
          return;
        }

        if (eventName === "job.artifact") {
          setActiveJob((prev) =>
            prev
              ? { ...prev, artifacts: [...prev.artifacts, payload.data] }
              : prev,
          );
          return;
        }

        if (eventName === "job.complete") {
          const fetchJob =
            useIpcCompute && computeBridge
              ? computeBridge.getJob(jobId)
              : agentFetch<{ job: Job }>(`/compute/jobs/${jobId}`);
          Promise.resolve(fetchJob).then((result: { job?: Job } | Job) => {
            const job =
              ("job" in result ? result.job : undefined) ?? (result as Job);
            setActiveJob(job);
            loadJobs();
          });
          if (eventSubscriptionRef.current) {
            eventSubscriptionRef.current.close();
          }
          return;
        }

        if (eventName === "job.error") {
          setActiveJob((prev) =>
            prev
              ? { ...prev, error: payload.data?.error || "Unknown error" }
              : prev,
          );
          return;
        }

        if (eventName === "job.cancelled") {
          const fetchJob =
            useIpcCompute && computeBridge
              ? computeBridge.getJob(jobId)
              : agentFetch<{ job: Job }>(`/compute/jobs/${jobId}`);
          Promise.resolve(fetchJob).then((result: { job?: Job } | Job) => {
            const job =
              ("job" in result ? result.job : undefined) ?? (result as Job);
            setActiveJob(job);
            loadJobs();
          });
          if (eventSubscriptionRef.current) {
            eventSubscriptionRef.current.close();
          }
        }
      };

      if (useIpcCompute && computeBridge) {
        const unsubscribe = computeBridge.subscribeToJobEvents(
          jobId,
          handleEvent,
        );
        eventSubscriptionRef.current = { close: unsubscribe };
        return;
      }

      const es = new EventSource(`${AGENT_BASE}/compute/jobs/${jobId}/events`);
      eventSubscriptionRef.current = { close: () => es.close() };

      for (const evt of SSE_EVENTS) {
        es.addEventListener(evt, (e) =>
          handleEvent(evt, (e as MessageEvent).data),
        );
      }

      es.onerror = () => {
        es.close();
      };
    },
    [computeBridge, loadJobs, useIpcCompute, setActiveJob],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSubscriptionRef.current) {
        eventSubscriptionRef.current.close();
      }
    };
  }, []);

  return { subscribeToJob };
}
