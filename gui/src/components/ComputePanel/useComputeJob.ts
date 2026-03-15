/** Custom hook: SSE subscription + all job state management. */
import { useCallback, useEffect, useRef, useState } from "react";

import { AGENT_BASE, agentFetch } from "./compute-api";
import type { Job } from "./compute-types";

export function useComputeJob() {
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<
    Array<{ id: string; status: string; goal: string; createdAt: string }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Policy toggles
  const [allowNetwork, setAllowNetwork] = useState(false);
  const [allowEscalation, setAllowEscalation] = useState(false);
  const [allowFSWrite, setAllowFSWrite] = useState(true);

  const eventSubscriptionRef = useRef<{ close: () => void } | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const computeBridge =
    typeof window !== "undefined"
      ? (window as any).codinAPI?.compute
      : undefined;
  const useIpcCompute = Boolean(computeBridge);

  // ── Check agent availability ─────────────────────────────
  useEffect(() => {
    if (useIpcCompute) {
      setIsOffline(false);
      return;
    }
    fetch(`${AGENT_BASE}/health`)
      .then((r) => setIsOffline(!r.ok))
      .catch(() => setIsOffline(true));
  }, [useIpcCompute]);

  useEffect(() => {
    if (useIpcCompute) {
      setAllowNetwork(false);
      setAllowEscalation(false);
    }
  }, [useIpcCompute]);

  // ── Load job list ─────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    try {
      if (useIpcCompute && computeBridge) {
        const data = await computeBridge.listJobs({ limit: 10 });
        setJobs(data.jobs || []);
      } else {
        const data = await agentFetch<{ jobs: typeof jobs }>(
          "/compute/jobs?limit=10",
        );
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.warn("[Compute] Failed to load jobs:", err);
    }
  }, [computeBridge, useIpcCompute]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // ── SSE subscription ─────────────────────────────────────
  const subscribeToJob = useCallback(
    (jobId: string) => {
      if (eventSubscriptionRef.current) {
        eventSubscriptionRef.current.close();
      }

      const parsePayload = (raw: any) => {
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

      const handleEvent = (eventName: string, rawPayload: any) => {
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
          Promise.resolve(fetchJob).then((result: any) => {
            const job = result.job || result;
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
          Promise.resolve(fetchJob).then((result: any) => {
            const job = result.job || result;
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
          Promise.resolve(fetchJob).then((result: any) => {
            const job = result.job || result;
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

      es.addEventListener("job.progress", (e) =>
        handleEvent("job.progress", (e as MessageEvent).data),
      );
      es.addEventListener("job.step", (e) =>
        handleEvent("job.step", (e as MessageEvent).data),
      );
      es.addEventListener("plan.ready", (e) =>
        handleEvent("plan.ready", (e as MessageEvent).data),
      );
      es.addEventListener("job.artifact", (e) =>
        handleEvent("job.artifact", (e as MessageEvent).data),
      );
      es.addEventListener("job.complete", (e) =>
        handleEvent("job.complete", (e as MessageEvent).data),
      );
      es.addEventListener("job.error", (e) =>
        handleEvent("job.error", (e as MessageEvent).data),
      );
      es.addEventListener("job.cancelled", (e) =>
        handleEvent("job.cancelled", (e as MessageEvent).data),
      );

      es.onerror = () => {
        es.close();
      };
    },
    [computeBridge, loadJobs, useIpcCompute],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSubscriptionRef.current) {
        eventSubscriptionRef.current.close();
      }
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeJob?.logs]);

  // ── Submit job ────────────────────────────────────────────
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

  // ── Run demo workflow ─────────────────────────────────────
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

  // ── Job control ───────────────────────────────────────────
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

  // ── View job details ─────────────────────────────────────
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

  const isTerminal =
    activeJob &&
    ["completed", "failed", "cancelled"].includes(activeJob.status);

  return {
    activeJob,
    setActiveJob,
    jobs,
    isSubmitting,
    isOffline,
    error,
    setError,
    allowNetwork,
    setAllowNetwork,
    allowEscalation,
    setAllowEscalation,
    allowFSWrite,
    setAllowFSWrite,
    useIpcCompute,
    logsEndRef,
    isTerminal,
    loadJobs,
    submitJob,
    runWorkflow,
    pauseJob,
    resumeJob,
    cancelJob,
    viewJob,
  };
}
