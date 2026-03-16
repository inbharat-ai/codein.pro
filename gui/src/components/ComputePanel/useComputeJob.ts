/** Orchestrator hook: composes SSE, actions, and submit sub-hooks. */
import { useCallback, useEffect, useRef, useState } from "react";

import { AGENT_BASE, agentFetch } from "./compute-api";
import type { Job } from "./compute-types";
import { useComputeActions } from "./useComputeActions";
import { useComputeSSE } from "./useComputeSSE";
import { useComputeSubmit } from "./useComputeSubmit";

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

  const logsEndRef = useRef<HTMLDivElement>(null);

  const computeBridge =
    typeof window !== "undefined" ? window.codinAPI?.compute : undefined;
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
    } catch {
      // Silently ignore – job list will remain stale until next poll
    }
  }, [computeBridge, useIpcCompute]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // ── SSE subscription ───────────────────────────────────────
  const { subscribeToJob } = useComputeSSE({
    computeBridge,
    useIpcCompute,
    setActiveJob,
    loadJobs,
  });

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeJob?.logs]);

  // ── Submit / workflow ──────────────────────────────────────
  const { submitJob, runWorkflow } = useComputeSubmit({
    computeBridge,
    useIpcCompute,
    allowNetwork,
    allowEscalation,
    allowFSWrite,
    setActiveJob,
    setIsSubmitting,
    setError,
    subscribeToJob,
  });

  // ── Job control + view ─────────────────────────────────────
  const { pauseJob, resumeJob, cancelJob, viewJob } = useComputeActions({
    activeJob,
    computeBridge,
    useIpcCompute,
    setActiveJob,
    setError,
    subscribeToJob,
  });

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
