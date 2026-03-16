/** API helper for GPU compute endpoints. */
import {
  agentFetch as baseAgentFetch,
  getAgentV1BaseUrl,
} from "../../util/agentConfig";

export const AGENT_BASE = getAgentV1BaseUrl();

export async function gpuFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await baseAgentFetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}
