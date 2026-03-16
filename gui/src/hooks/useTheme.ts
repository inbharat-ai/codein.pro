import { useCallback, useEffect, useMemo, useState } from "react";

export type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "codin-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "dark";
}

function applyTheme(resolved: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", resolved);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(
    getSystemTheme,
  );

  const resolvedTheme = useMemo(
    () => (theme === "system" ? systemTheme : theme),
    [theme, systemTheme],
  );

  // Listen for OS preference changes
  useEffect(() => {
    const mq = window.matchMedia(MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Apply data-theme whenever resolvedTheme changes
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return { theme, setTheme, resolvedTheme } as const;
}

/**
 * Apply the saved theme immediately (call once at startup before React render).
 * This prevents a flash of wrong theme on page load.
 */
export function initializeTheme() {
  const stored = getStoredTheme();
  const resolved = stored === "system" ? getSystemTheme() : stored;
  applyTheme(resolved);
}

export default useTheme;
