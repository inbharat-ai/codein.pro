export function getAgentBaseUrl(): string {
  // Prefer Vite env if provided
  const viteUrl = (import.meta as any).env?.VITE_AGENT_URL as
    | string
    | undefined;
  if (viteUrl) {
    return viteUrl.replace(/\/$/, "");
  }

  // Allow window-level override when embedded
  if (typeof window !== "undefined" && (window as any).CODIN_AGENT_URL) {
    return String((window as any).CODIN_AGENT_URL).replace(/\/$/, "");
  }

  // Fallback to local default
  return "http://127.0.0.1:43120";
}

export function agentFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const base = getAgentBaseUrl();
  const url = input.startsWith("http")
    ? input
    : `${base}${input.startsWith("/") ? "" : "/"}${input}`;
  return fetch(url, init);
}
