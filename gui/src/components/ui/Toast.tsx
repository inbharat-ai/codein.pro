import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/* ─── Types ────────────────────────────────────────────────────────── */

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
  createdAt: number;
}

interface ToastContextValue {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4000;

let toastCounter = 0;

/* ─── Variant config ───────────────────────────────────────────────── */

const VARIANT_STYLES: Record<
  ToastVariant,
  { bg: string; border: string; icon: string; progressColor: string }
> = {
  success: {
    bg: "rgba(34, 197, 94, 0.08)",
    border: "var(--codin-success)",
    icon: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    progressColor: "var(--codin-success)",
  },
  error: {
    bg: "rgba(239, 68, 68, 0.08)",
    border: "var(--codin-error)",
    icon: "m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    progressColor: "var(--codin-error)",
  },
  warning: {
    bg: "rgba(245, 158, 11, 0.08)",
    border: "var(--codin-warning)",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z",
    progressColor: "var(--codin-warning)",
  },
  info: {
    bg: "rgba(99, 102, 241, 0.08)",
    border: "var(--codin-info)",
    icon: "m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z",
    progressColor: "var(--codin-info)",
  },
};

/* ─── Single Toast ─────────────────────────────────────────────────── */

function ToastEntry({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const [remaining, setRemaining] = useState(item.duration);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number>(0);

  const style = VARIANT_STYLES[item.variant];

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(item.id), 200);
  }, [item.id, onDismiss]);

  // Countdown + auto-dismiss
  useEffect(() => {
    startRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const left = Math.max(0, item.duration - elapsed);
      setRemaining(left);
      if (left <= 0) {
        handleDismiss();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [item.duration, handleDismiss]);

  const fraction = remaining / item.duration;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        background: style.bg,
        borderLeft: `3px solid ${style.border}`,
        backdropFilter: "blur(12px)",
        animation: exiting
          ? "codin-toast-exit 0.2s ease-in forwards"
          : "codin-toast-enter 0.25s ease-out forwards",
      }}
      className="pointer-events-auto relative mb-2 flex w-80 items-start gap-2 overflow-hidden rounded-md p-3 shadow-lg"
    >
      {/* Icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke={style.border}
        className="mt-0.5 h-5 w-5 flex-shrink-0"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
      </svg>

      {/* Message */}
      <span
        style={{
          color: "var(--codin-fg-primary)",
          fontSize: "var(--codin-font-size-sm)",
        }}
        className="flex-1 leading-snug"
      >
        {item.message}
      </span>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        style={{ color: "var(--codin-fg-muted)" }}
        className="flex-shrink-0 rounded p-0.5 transition-colors hover:brightness-150"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-3.5 w-3.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5"
        style={{
          width: `${fraction * 100}%`,
          background: style.progressColor,
          transition: "width 100ms linear",
        }}
      />
    </div>
  );
}

/* ─── Provider ─────────────────────────────────────────────────────── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (variant: ToastVariant, message: string, duration = DEFAULT_DURATION) => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      setToasts((prev) => {
        const next = [
          { id, variant, message, duration, createdAt: Date.now() },
          ...prev,
        ];
        return next.slice(0, MAX_TOASTS);
      });
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const toast = React.useMemo(
    () => ({
      success: (msg: string, dur?: number) => addToast("success", msg, dur),
      error: (msg: string, dur?: number) => addToast("error", msg, dur),
      warning: (msg: string, dur?: number) => addToast("warning", msg, dur),
      info: (msg: string, dur?: number) => addToast("info", msg, dur),
    }),
    [addToast],
  );

  const value = React.useMemo(
    () => ({ toast, dismiss, dismissAll }),
    [toast, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast container — fixed top-right */}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 top-4 z-[100001] flex flex-col items-end"
      >
        {toasts.map((item) => (
          <ToastEntry key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ─── Hook ─────────────────────────────────────────────────────────── */

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
