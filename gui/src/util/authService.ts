import { getAgentV1BaseUrl } from "./agentConfig";

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _expiresAt: number = 0;

/** Auto-login to the agent server (local dev mode — no password needed) */
export async function ensureAuth(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (_accessToken && Date.now() < _expiresAt - 60000) {
    return _accessToken;
  }

  // Try refresh first if we have a refresh token
  if (_refreshToken) {
    try {
      const base = getAgentV1BaseUrl();
      const res = await fetch(`${base}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: _refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        _accessToken = data.accessToken;
        _refreshToken = data.refreshToken || _refreshToken;
        _expiresAt = Date.now() + parseExpiry(data.expiresIn);
        return _accessToken!;
      }
    } catch {
      // Fall through to fresh login
    }
  }

  // Fresh login
  const base = getAgentV1BaseUrl();
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "developer" }),
  });

  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  _accessToken = data.accessToken;
  _refreshToken = data.refreshToken;
  _expiresAt = Date.now() + parseExpiry(data.expiresIn);
  return _accessToken!;
}

/** Get current token without refreshing (may be null) */
export function getToken(): string | null {
  return _accessToken;
}

/** Clear stored tokens */
export function clearAuth(): void {
  _accessToken = null;
  _refreshToken = null;
  _expiresAt = 0;
}

function parseExpiry(expiresIn: string): number {
  // Parse "15m", "1h", "7d" format
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000; // default 15min
  const val = parseInt(match[1]);
  switch (match[2]) {
    case "s":
      return val * 1000;
    case "m":
      return val * 60 * 1000;
    case "h":
      return val * 3600 * 1000;
    case "d":
      return val * 86400 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}
