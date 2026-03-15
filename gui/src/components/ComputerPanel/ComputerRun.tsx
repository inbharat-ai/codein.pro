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

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  planning: { bg: "bg-codin-saffron-500/20", text: "text-codin-saffron-400" },
  running: { bg: "bg-codin-indigo-500/20", text: "text-codin-indigo-300" },
  paused: { bg: "bg-orange-500/20", text: "text-orange-400" },
  completed: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  failed: { bg: "bg-red-500/15", text: "text-red-400" },
  cancelled: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
};

const STEP_ICONS: Record<string, { icon: string; color: string }> = {
  pending: { icon: "\u25CB", color: "text-codin-fg-muted" },
  running: { icon: "\u25CF", color: "text-codin-indigo-400 animate-pulse" },
  completed: { icon: "\u2713", color: "text-emerald-400" },
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
          className="bg-codin-bg-surface border-codin-border text-codin-fg placeholder:text-codin-fg-muted focus:border-codin-indigo-500 focus:ring-codin-indigo-500/30 w-full resize-none rounded-md border p-2.5 text-xs leading-relaxed focus:outline-none focus:ring-1"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-codin-fg-muted text-[10px]">
            {t("computer.run.hint")}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!goalInput.trim() || isActive}
            className="bg-codin-indigo-600 shadow-codin-indigo-600/25 hover:bg-codin-indigo-500 hover:shadow-codin-indigo-500/30 rounded-md px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-all disabled:opacity-50 disabled:shadow-none"
          >
            {t("computer.run.submit")}
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-900/20 px-2.5 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Active plan display */}
      {plan && (
        <div className="bg-codin-bg-surface rounded-md p-3">
          {/* Plan header */}
          <div className="mb-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-codin-fg truncate text-xs font-medium">
                {plan.goal}
              </p>
              <div className="mt-1 flex items-center gap-2">
                {(() => {
                  const style =
                    STATUS_STYLES[plan.status] || STATUS_STYLES.cancelled;
                  return (
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide ${style.bg} ${style.text}`}
                    >
                      {plan.status.toUpperCase()}
                    </span>
                  );
                })()}
                <span className="text-codin-fg-muted text-[10px]">
                  {plan.progress.completed}/{plan.progress.total}{" "}
                  {t("computer.run.steps")}
                </span>
                {plan.progress.costUSD > 0 && (
                  <span className="font-mono text-[10px] text-emerald-400">
                    ${plan.progress.costUSD.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-codin-bg mb-2.5 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                plan.status === "failed"
                  ? "bg-red-500"
                  : plan.status === "completed"
                    ? "bg-emerald-500"
                    : "bg-codin-indigo-500"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Steps list */}
          {plan.steps.length > 0 && (
            <div className="mb-2.5 max-h-48 space-y-0.5 overflow-y-auto">
              {plan.steps.map((step) => {
                const stepStyle = STEP_ICONS[step.status] || STEP_ICONS.pending;
                return (
                  <div
                    key={step.id}
                    className="hover:bg-codin-bg-hover flex items-center gap-2 rounded px-1.5 py-1 text-[10px] transition-colors"
                  >
                    <span className={`shrink-0 ${stepStyle.color}`}>
                      {stepStyle.icon}
                    </span>
                    <span className="text-codin-fg-secondary min-w-0 flex-1 truncate">
                      {step.description}
                    </span>
                    {step.durationMs !== undefined &&
                      step.status === "completed" && (
                        <span className="text-codin-fg-muted shrink-0 font-mono">
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
          <div className="flex gap-1.5">
            {plan.status === "running" && (
              <button
                onClick={() => dispatch(pausePlan(plan.id))}
                className="bg-codin-saffron-600/80 hover:bg-codin-saffron-500/80 rounded-md px-2.5 py-1 text-[10px] font-medium text-white transition-colors"
              >
                {t("computer.run.pause")}
              </button>
            )}
            {plan.status === "paused" && (
              <button
                onClick={() => dispatch(resumePlan(plan.id))}
                className="bg-codin-indigo-600 hover:bg-codin-indigo-500 rounded-md px-2.5 py-1 text-[10px] font-medium text-white transition-colors"
              >
                {t("computer.run.resume")}
              </button>
            )}
            {(plan.status === "running" ||
              plan.status === "paused" ||
              plan.status === "planning") && (
              <button
                onClick={() => dispatch(cancelPlan(plan.id))}
                className="rounded-md bg-red-600/60 px-2.5 py-1 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-500/60"
              >
                {t("common.cancel")}
              </button>
            )}
            {(plan.status === "completed" ||
              plan.status === "failed" ||
              plan.status === "cancelled") && (
              <button
                onClick={() => dispatch(clearActivePlan())}
                className="text-codin-fg-muted hover:text-codin-fg-secondary rounded-md px-2.5 py-1 text-[10px] transition-colors"
              >
                {t("computer.run.clear")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!plan && !error && (
        <div className="text-codin-fg-muted flex flex-col items-center gap-2 py-6 text-center text-[10px]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="text-codin-indigo-400/30 h-8 w-8"
          >
            <path
              d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("computer.run.empty")}
        </div>
      )}
    </div>
  );
}
