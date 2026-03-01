/**
 * SovereignModeBadge — "Offline Ready / Sovereign Mode" indicator
 *
 * Displays when CodeIn is running with local models only,
 * signaling data-sovereign, air-gapped capability.
 * Uses saffron accent with subtle indigo gradient.
 */
import { useEffect, useState } from "react";

interface SovereignModeBadgeProps {
  /** Is the system truly offline / local-only right now? */
  isOffline?: boolean;
  /** Show even when online (as an "available" indicator) */
  alwaysShow?: boolean;
  /** Compact mode for tight spaces */
  compact?: boolean;
}

export function SovereignModeBadge({
  isOffline = false,
  alwaysShow = true,
  compact = false,
}: SovereignModeBadgeProps) {
  const [online, setOnline] = useState(!isOffline);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // If online and not always showing, hide
  if (online && !alwaysShow && !isOffline) return null;

  const active = isOffline || !online;

  return (
    <div
      className="codin-sovereign-badge"
      title={
        active
          ? "Sovereign Mode — All processing is local. No data leaves your device."
          : "Offline Ready — Local models available. Can work without internet."
      }
    >
      <span className="pulse-dot" style={{ opacity: active ? 1 : 0.5 }} />
      {!compact && <span>{active ? "Sovereign" : "Offline Ready"}</span>}
      {compact && <span>{active ? "●" : "○"}</span>}
      {active && !compact && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          style={{ opacity: 0.7, flexShrink: 0 }}
        >
          <path
            d="M8 1a5 5 0 0 0-5 5v1.5a.5.5 0 0 0-.5.5v5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8a.5.5 0 0 0-.5-.5V6a5 5 0 0 0-5-5zm3 6.5H5V6a3 3 0 1 1 6 0v1.5z"
            fill="currentColor"
          />
        </svg>
      )}
    </div>
  );
}

export default SovereignModeBadge;
