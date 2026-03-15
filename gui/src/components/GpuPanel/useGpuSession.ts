/** Custom hook: GPU connection state, status polling, health check. */
import { useCallback, useEffect, useState } from "react";

import { AGENT_BASE, gpuFetch } from "./gpu-api";
import type { GpuStatus, GpuTab, GpuType, Pod } from "./gpu-types";

export function useGpuSession() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [gpuTypes, setGpuTypes] = useState<GpuType[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Check agent availability ─────────────────────────────
  useEffect(() => {
    fetch(`${AGENT_BASE}/health`)
      .then((r) => setIsOffline(!r.ok))
      .catch(() => setIsOffline(true));
  }, []);

  // ── Check existing connection on mount ───────────────────
  const refreshStatus = useCallback(
    async (currentTab?: GpuTab, setTab?: (t: GpuTab) => void) => {
      try {
        const data = await gpuFetch<{ status: GpuStatus }>(
          "/compute/gpu/status",
        );
        setStatus(data.status);
        if (data.status?.connected) {
          setConnected(true);
          if (currentTab === "connect" && setTab) setTab("pods");
        }
      } catch {
        // Not connected yet
      }
    },
    [],
  );

  // ── Connect ──────────────────────────────────────────────
  const connect = async (apiKey: string, maxBudget: string, ttl: string) => {
    if (!apiKey.trim()) {
      setError("RunPod API key is required");
      return false;
    }
    setError(null);
    try {
      await gpuFetch("/compute/gpu/connect", {
        method: "POST",
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          maxBudgetUsd: parseFloat(maxBudget) || 10,
          ttlMinutes: parseInt(ttl) || 30,
        }),
      });
      setConnected(true);
      await refreshStatus();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      return false;
    }
  };

  // ── Load GPU types ───────────────────────────────────────
  const loadGpuTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gpuFetch<{ gpus: GpuType[] }>("/compute/gpu/types");
      setGpuTypes(data.gpus || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GPU types");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load pods ────────────────────────────────────────────
  const loadPods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gpuFetch<{ status: GpuStatus }>("/compute/gpu/status");
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pods");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Stop session ─────────────────────────────────────────
  const stop = async () => {
    setError(null);
    try {
      await gpuFetch("/compute/gpu/stop", { method: "POST" });
      setConnected(false);
      setStatus(null);
      setPods([]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop");
      return false;
    }
  };

  // ── Create pod ───────────────────────────────────────────
  const createPod = async (
    gpuTypeId: string,
    imageName: string,
    volume: string,
    ttl: string,
  ) => {
    if (!gpuTypeId) {
      setError("Select a GPU type first");
      return false;
    }
    setError(null);
    try {
      await gpuFetch<{ pod: Pod }>("/compute/gpu/pod", {
        method: "POST",
        body: JSON.stringify({
          gpuTypeId,
          imageName: imageName.trim(),
          volume: parseInt(volume) || 20,
          timeoutMinutes: parseInt(ttl) || 30,
        }),
      });
      await refreshStatus();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pod");
      return false;
    }
  };

  // ── Submit job ───────────────────────────────────────────
  const submitJob = async (input: string) => {
    if (!input.trim()) {
      setError("Job input is required");
      return null;
    }
    setError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(input);
      } catch {
        parsed = { prompt: input };
      }
      const data = await gpuFetch<{ job: { id: string } }>(
        "/compute/gpu/jobs",
        {
          method: "POST",
          body: JSON.stringify({ input: parsed }),
        },
      );
      return data.job?.id || "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit job");
      return null;
    }
  };

  // ── Check job status ─────────────────────────────────────
  const checkJob = async (jobId: string) => {
    if (!jobId.trim()) {
      setError("Enter a job ID");
      return null;
    }
    setError(null);
    try {
      const data = await gpuFetch<{ status: any }>(
        `/compute/gpu/jobs/${encodeURIComponent(jobId)}`,
      );
      return data.status;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check job");
      return null;
    }
  };

  return {
    connected,
    status,
    gpuTypes,
    pods,
    isOffline,
    loading,
    error,
    setError,
    refreshStatus,
    connect,
    loadGpuTypes,
    loadPods,
    stop,
    createPod,
    submitJob,
    checkJob,
  };
}
