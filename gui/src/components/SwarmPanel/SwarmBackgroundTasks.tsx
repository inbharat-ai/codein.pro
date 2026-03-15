import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchBackgroundTasks,
  submitBackgroundTask,
  selectBackgroundTasks,
} from "../../redux/slices/swarmSlice";

const STATUS_BADGES: Record<string, string> = {
  queued: "bg-codin-bg-surface",
  running: "bg-codin-indigo-600 animate-pulse",
  completed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-600",
  cancelled: "bg-codin-bg",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "text-red-400",
  normal: "text-codin-fg-secondary",
  low: "text-codin-fg-muted",
};

export function SwarmBackgroundTasks() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectBackgroundTasks);
  const [goal, setGoal] = useState("");
  const [priority, setPriority] = useState("normal");

  useEffect(() => {
    dispatch(fetchBackgroundTasks(undefined));
    const id = setInterval(
      () => dispatch(fetchBackgroundTasks(undefined)),
      10000,
    );
    return () => clearInterval(id);
  }, [dispatch]);

  const handleSubmit = () => {
    if (!goal.trim()) return;
    dispatch(submitBackgroundTask({ goal: goal.trim(), priority }));
    setGoal("");
  };

  return (
    <div>
      <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
        Background Tasks ({tasks.length})
      </h3>

      {/* Submit new */}
      <div className="mb-2 flex gap-1">
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Background task goal..."
          className="bg-codin-bg-surface border-codin-border focus:border-codin-border-focus flex-1 rounded-md border px-2 py-1 text-xs focus:outline-none"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-codin-bg-surface border-codin-border focus:border-codin-border-focus rounded-md border px-1 text-[10px] focus:outline-none"
        >
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <button
          onClick={handleSubmit}
          disabled={!goal.trim()}
          className="rounded-md bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
        >
          Queue
        </button>
      </div>

      {/* Task list */}
      {tasks.length === 0 && (
        <p className="text-codin-fg-muted text-[10px]">
          No background tasks queued. Enter a goal above to queue one.
        </p>
      )}
      {tasks.length > 0 && (
        <div className="scrollbar-thin max-h-40 space-y-1 overflow-y-auto">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="bg-codin-bg-surface flex items-center gap-2 rounded-md px-2 py-1 text-[10px]"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_BADGES[t.status] || "bg-codin-bg-surface"}`}
              />
              <span className="flex-1 truncate">{t.goal}</span>
              <span
                className={PRIORITY_LABELS[t.priority] || "text-codin-fg-muted"}
              >
                {t.priority}
              </span>
              <span className="text-codin-fg-muted">{t.status}</span>
              {t.progress !== undefined && t.progress > 0 && (
                <span className="text-codin-indigo-400">{t.progress}%</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
