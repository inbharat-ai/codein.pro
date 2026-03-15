/** Custom hook: health checks, models, hardware, service lifecycle. */
import { useCallback, useEffect, useState } from "react";

import { mediaInvoke } from "./media-api";
import type { HardwareInfo, MediaResult, ModelEntry } from "./media-types";

export function useMediaService() {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [serviceReady, setServiceReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [gallery, setGallery] = useState<MediaResult[]>([]);

  // ── Health check ───────────────────────────────────────────
  const checkService = useCallback(async () => {
    try {
      const result = await mediaInvoke("media:health");
      setServiceReady(result?.status === "ok");
      if (result?.gpu) {
        setHardware({
          gpuAvailable: result.gpu.available ?? false,
          gpuVendor: result.gpu.backend ?? "none",
          gpuName: result.gpu.name ?? "Unknown",
          vramGB: result.gpu.vram_gb ?? 0,
          vramTier:
            result.gpu.vram_gb > 16
              ? "ULTRA"
              : result.gpu.vram_gb > 8
                ? "HIGH"
                : result.gpu.vram_gb > 4
                  ? "MEDIUM"
                  : "LOW",
          cudaAvailable: result.gpu.backend === "cuda",
          mpsAvailable: result.gpu.backend === "mps",
          cpuName: "",
          ramGB: result.memory_total_gb ?? 0,
        });
      }
    } catch {
      setServiceReady(false);
    }
  }, []);

  // ── Fetch models ───────────────────────────────────────────
  const fetchModels = useCallback(async () => {
    try {
      const result = await mediaInvoke("media:modelsStatus");
      setModels(result?.models ?? []);
    } catch {
      // ignore
    }
  }, []);

  // ── Poll on mount ──────────────────────────────────────────
  useEffect(() => {
    checkService();
    fetchModels();
    const interval = setInterval(checkService, 10000);
    return () => clearInterval(interval);
  }, [checkService, fetchModels]);

  // ── Service start ──────────────────────────────────────────
  const startService = async () => {
    setLoading(true);
    setError("");
    try {
      await mediaInvoke("media:startService");
      await checkService();
      await fetchModels();
    } catch (e: any) {
      setError(e.message ?? "Failed to start media service");
    }
    setLoading(false);
  };

  // ── Model management ──────────────────────────────────────
  const downloadModel = async (modelId: string) => {
    setLoading(true);
    setProgress(`Downloading ${modelId}...`);
    try {
      await mediaInvoke("media:downloadModel", modelId);
      await fetchModels();
      setProgress(`${modelId} downloaded`);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const deleteModel = async (modelId: string) => {
    try {
      await mediaInvoke("media:deleteModel", modelId);
      await fetchModels();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Gallery helpers ────────────────────────────────────────
  const addToGallery = (item: MediaResult) => {
    setGallery((prev) => [item, ...prev]);
  };

  return {
    hardware,
    models,
    serviceReady,
    loading,
    setLoading,
    progress,
    setProgress,
    error,
    setError,
    gallery,
    addToGallery,
    startService,
    downloadModel,
    deleteModel,
  };
}
