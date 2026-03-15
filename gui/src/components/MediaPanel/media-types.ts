/** Shared types for the Media Toolkit panel. */

export interface HardwareInfo {
  gpuAvailable: boolean;
  gpuVendor: string;
  gpuName: string;
  vramGB: number;
  vramTier: string;
  cudaAvailable: boolean;
  mpsAvailable: boolean;
  cpuName: string;
  ramGB: number;
}

export interface ModelEntry {
  model_id: string;
  label: string;
  type: string;
  size_mb: number;
  downloaded: boolean;
  size_on_disk_mb: number;
  loaded: boolean;
}

export interface MediaResult {
  path: string;
  type: "image" | "video" | "diagram";
  preset?: string;
  time_seconds?: number;
  seed?: number;
  timestamp: number;
}

export type MediaTab = "diagrams" | "images" | "videos";
export type MediaMode = "auto" | "cpu_only" | "gpu_only";
