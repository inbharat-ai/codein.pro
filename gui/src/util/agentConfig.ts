export { getAgentBaseUrl as getAgentV1BaseUrl };

export function getAgentBaseUrl(): string {
  // Prefer Vite env if provided
  const viteUrl = import.meta.env?.VITE_AGENT_URL as string | undefined;
  if (viteUrl) {
    return viteUrl.replace(/\/$/, "");
  }

  // Allow window-level override when embedded
  if (typeof window !== "undefined" && window.CODIN_AGENT_URL) {
    return String(window.CODIN_AGENT_URL).replace(/\/$/, "");
  }

  // Fallback to local default
  return "http://127.0.0.1:43120";
}

export async function agentFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const base = getAgentBaseUrl();
  const url = input.startsWith("http")
    ? input
    : `${base}${input.startsWith("/") ? "" : "/"}${input}`;

  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string>),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(url, { ...init, headers });
  };

  // Auto-authenticate
  let token: string | null = null;
  try {
    const { ensureAuth } = await import("./authService");
    token = await ensureAuth();
  } catch {
    // If auth fails, proceed without token — server will return 401
  }

  let res = await doFetch(token);

  // If 401 (stale token — e.g. agent restarted), clear cache and retry once
  if (res.status === 401) {
    const { clearAuth, ensureAuth } = await import("./authService");
    clearAuth();
    token = null;
    try {
      token = await ensureAuth();
    } catch {
      // Still no token
    }
    res = await doFetch(token);
  }

  return res;
}
