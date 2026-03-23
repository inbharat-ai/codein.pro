import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setMode } from "../redux/slices/sessionSlice";

const MODES = ["ask", "plan", "agent", "implement"] as const;

const LABELS: Record<(typeof MODES)[number], string> = {
  ask: "Ask",
  plan: "Plan",
  agent: "Agent",
  implement: "Implement",
};

export function ModeSelector() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.session.mode);
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const options = useMemo(() => MODES, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = options.indexOf(mode as (typeof MODES)[number]);
      if (currentIndex === -1) return;
      let nextIndex: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % options.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + options.length) % options.length;
      }
      if (nextIndex !== null && !isStreaming) {
        e.preventDefault();
        dispatch(setMode(options[nextIndex]));
        const container = e.currentTarget;
        const buttons =
          container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        buttons[nextIndex]?.focus();
      }
    },
    [dispatch, isStreaming, mode, options],
  );

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg p-0.5"
      style={{ background: "var(--codin-bg-surface, #201e3a)" }}
      role="radiogroup"
      aria-label="Chat mode"
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const isActive = mode === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={isStreaming}
            onClick={() => !isStreaming && dispatch(setMode(option))}
            className="relative rounded-md px-3 py-1 text-xs font-medium transition-all"
            style={{
              background: isActive
                ? "var(--codin-indigo-700, #4338ca)"
                : "transparent",
              color: isActive ? "#fff" : "var(--codin-fg-muted, #8b88ad)",
              cursor: isStreaming ? "not-allowed" : "pointer",
              opacity: isStreaming ? 0.5 : 1,
              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
            }}
          >
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
