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
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="text-xs uppercase tracking-wide opacity-70">Mode</div>
      <div
        className="flex gap-2"
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
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                isActive
                  ? "bg-codin-indigo-700 text-white"
                  : "bg-codin-bg-surface text-codin-fg"
              } ${isStreaming ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {LABELS[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
