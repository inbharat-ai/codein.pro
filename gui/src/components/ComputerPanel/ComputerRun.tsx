import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  selectActivePlan,
  selectGoalInput,
  selectComputerError,
  selectPlanIsActive,
  setGoalInput,
  submitGoal,
  fetchPlanStatus,
  pausePlan,
  resumePlan,
  cancelPlan,
  clearActivePlan,
} from "../../redux/slices/computerSlice";

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-yellow-600",
  running: "bg-blue-600 animate-pulse",
  paused: "bg-orange-600",
  completed: "bg-green-600",
  failed: "bg-red-600",
  cancelled: "bg-zinc-600",
};

const STEP_ICONS: Record<string, { icon: string; color: string }> = {
  pending: { icon: "\u25CB", color: "text-zinc-400" },
  running: { icon: "\u25CF", color: "text-blue-400 animate-pulse" },
  completed: { icon: "\u2713", color: "text-green-400" },
  failed: { icon: "\u2717", color: "text-red-400" },
};

export function ComputerRun() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const plan = useAppSelector(selectActivePlan);
  const goalInput = useAppSelector(selectGoalInput);
  const error = useAppSelector(selectComputerError);
  const isActive = useAppSelector(selectPlanIsActive);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for plan status every 3s when active
  useEffect(() => {
    if (!isActive || !plan?.id) return;
    pollRef.current = setInterval(() => {
      dispatch(fetchPlanStatus(plan.id));
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isActive, plan?.id, dispatch]);

  const handleSubmit = () => {
    const trimmed = goalInput.trim();
    if (!trimmed) return;
    dispatch(submitGoal(trimmed));
  };

  const progressPercent =
    plan && plan.progress.total > 0
      ? Math.round((plan.progress.completed / plan.progress.total) * 100)
      : 0;

  return (
    <div className="space-y-3">
      {/* Goal input */}
      <div>
        <textarea
          value={goalInput}
          onChange={(e) => dispatch(setGoalInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
          placeholder={t("computer.run.placeholder")}
          rows={4}
          className="bg-vsc-input-background border-vsc-input-border text-vsc-foreground w-full resize-none rounded border p-2 text-xs placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-vsc-foreground/30 text-[10px]">
            {t("computer.run.hint")}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!goalInput.trim() || isActive}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {t("computer.run.submit")}
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded bg-red-900/30 px-2 py-1.5 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Active plan display */}
      {plan && (
        <div className="bg-vsc-input-background rounded p-2">
          {/* Plan header */}
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-vsc-foreground truncate text-xs font-medium">
                {plan.goal}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-medium text-white ${STATUS_COLORS[plan.status] || "bg-zinc-600"}`}
                >
                  {plan.status.toUpperCase()}
                </span>
                <span className="text-vsc-foreground/40 text-[10px]">
                  {plan.progress.completed}/{plan.progress.total}{" "}
                  {t("computer.run.steps")}
                </span>
                {plan.progress.costUSD > 0 && (
                  <span className="font-mono text-[10px] text-green-400">
                    ${plan.progress.costUSD.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                plan.status === "failed"
                  ? "bg-red-500"
                  : plan.status === "completed"
                    ? "bg-green-500"
                    : "bg-blue-500"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Steps list */}
          {plan.steps.length > 0 && (
            <div className="scrollbar-thin mb-2 max-h-48 space-y-0.5 overflow-y-auto">
              {plan.steps.map((step) => {
                const stepStyle = STEP_ICONS[step.status] || STEP_ICONS.pending;
                return (
                  <div
                    key={step.id}
                    className="flex items-center gap-2 rounded px-1 py-0.5 text-[10px]"
                  >
                    <span className={`shrink-0 ${stepStyle.color}`}>
                      {stepStyle.icon}
                    </span>
                    <span className="text-vsc-foreground/70 min-w-0 flex-1 truncate">
                      {step.description}
                    </span>
                    {step.durationMs !== undefined &&
                      step.status === "completed" && (
                        <span className="text-vsc-foreground/30 shrink-0 font-mono">
                          {step.durationMs < 1000
                            ? `${step.durationMs}ms`
                            : `${(step.durationMs / 1000).toFixed(1)}s`}
                        </span>
                      )}
                    {step.error && (
                      <span
                        className="shrink-0 truncate text-red-400"
                        title={step.error}
                      >
                        {step.error}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-1">
            {plan.status === "running" && (
              <button
                onClick={() => dispatch(pausePlan(plan.id))}
                className="rounded bg-orange-600 px-2 py-0.5 text-[10px] text-white hover:bg-orange-700"
              >
                {t("computer.run.pause")}
              </button>
            )}
            {plan.status === "paused" && (
              <button
                onClick={() => dispatch(resumePlan(plan.id))}
                className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700"
              >
                {t("computer.run.resume")}
              </button>
            )}
            {(plan.status === "running" ||
              plan.status === "paused" ||
              plan.status === "planning") && (
              <button
                onClick={() => dispatch(cancelPlan(plan.id))}
                className="rounded bg-red-600 px-2 py-0.5 text-[10px] text-white hover:bg-red-700"
              >
                {t("common.cancel")}
              </button>
            )}
            {(plan.status === "completed" ||
              plan.status === "failed" ||
              plan.status === "cancelled") && (
              <button
                onClick={() => dispatch(clearActivePlan())}
                className="text-vsc-foreground/40 hover:text-vsc-foreground/60 rounded px-2 py-0.5 text-[10px]"
              >
                {t("computer.run.clear")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!plan && !error && (
        <div className="text-vsc-foreground/30 py-4 text-center text-[10px]">
          {t("computer.run.empty")}
        </div>
      )}
    </div>
  );
}
