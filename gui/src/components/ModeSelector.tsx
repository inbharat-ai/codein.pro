import { useMemo } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setMode } from "../redux/slices/sessionSlice";

const MODES = ["ask", "plan", "agent", "implement"] as const;

export function ModeSelector() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.session.mode);
  const options = useMemo(() => MODES, []);

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="text-xs uppercase tracking-wide opacity-70">Mode</div>
      <div className="flex gap-2">
        {options.map((option) => {
          const isActive = mode === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => dispatch(setMode(option))}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                isActive
                  ? "bg-vsc-button text-vsc-button-foreground"
                  : "bg-vsc-input-background text-vsc-foreground"
              }`}
            >
              {option.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
