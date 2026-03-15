/** Shared types for the GPU Compute panel. */

export interface GpuType {
  id: string;
  displayName?: string;
  memoryInGb?: number;
  secureCloud?: boolean;
  communityCloud?: boolean;
  lowestPrice?: { minimumBidPrice: number; uninterruptablePrice: number };
}

export interface Pod {
  id: string;
  name: string;
  desiredStatus: string;
  runtime?: { uptimeInSeconds?: number; gpus?: Array<{ id: string }> };
  machine?: { gpu?: { id: string; displayName: string } };
  imageName?: string;
}

export interface GpuStatus {
  connected: boolean;
  activePodId?: string;
  budget?: { spent: number; limit: number };
  uptime?: number;
}

export interface JobStatus {
  id: string;
  status: string;
  output?: unknown;
  error?: string;
}

export type GpuTab = "connect" | "gpus" | "pods" | "jobs";
