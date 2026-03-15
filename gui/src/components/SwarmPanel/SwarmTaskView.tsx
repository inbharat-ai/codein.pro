import { useState } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  cancelTask,
  fetchTaskStatus,
  orchestrateTask,
  selectActiveTask,
  selectActiveTaskId,
  selectSwarmLoading,
} from "../../redux/slices/swarmSlice";

const NODE_STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  queued: { dot: "bg-codin-fg-muted", text: "text-codin-fg-muted" },
  running: {
    dot: "bg-codin-indigo-400 animate-pulse",
    text: "text-codin-indigo-300",
  },
  blocked: { dot: "bg-codin-saffron-500", text: "text-codin-saffron-400" },
  succeeded: { dot: "bg-emerald-400", text: "text-emerald-400" },
  failed: { dot: "bg-red-400", text: "text-red-400" },
  cancelled: { dot: "bg-zinc-600", text: "text-zinc-500" },
  retrying: { dot: "bg-orange-400 animate-pulse", text: "text-orange-400" },
};

export function SwarmTaskView() {
  const dispatch = useAppDispatch();
  const activeTask = useAppSelector(selectActiveTask);
  const activeTaskId = useAppSelector(selectActiveTaskId);
  const loading = useAppSelector(selectSwarmLoading);
  const [goal, setGoal] = useState("");

  const handleSubmit = () => {
    if (!goal.trim()) return;
    dispatch(orchestrateTask({ goal: goal.trim() }));
    setGoal("");
  };

  const handleRefresh = () => {
    if (activeTaskId) dispatch(fetchTaskStatus(activeTaskId));
  };

  return (
    <div>
      <h3 className="text-codin-fg-secondary mb-1.5 text-xs font-semibold">
        Task
      </h3>

      {/* Submit new task */}
      <div className="mb-2 flex gap-1.5">
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Describe the goal..."
          className="bg-codin-bg-surface border-codin-border text-codin-fg placeholder:text-codin-fg-muted focus:border-codin-border-focus flex-1 rounded border px-2 py-1.5 text-xs focus:outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !goal.trim()}
          className="bg-codin-indigo-600 hover:bg-codin-indigo-500 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Go"}
        </button>
      </div>

      {/* Active task display */}
      {!activeTask && !loading && (
        <p className="text-codin-fg-muted text-[10px]">
          No active task. Describe a goal above to get started.
        </p>
      )}
      {loading && !activeTask && (
        <div className="text-codin-fg-secondary flex items-center gap-2 py-2 text-[10px]">
          <span className="border-codin-indigo-400 h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
          Orchestrating task...
        </div>
      )}
      {activeTask && (
        <div className="bg-codin-bg-surface space-y-1.5 rounded-md p-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-codin-fg max-w-[200px] truncate font-medium">
              {activeTask.goal}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                className="text-codin-indigo-400 hover:text-codin-indigo-300 text-[10px] transition-colors"
              >
                refresh
              </button>
              <button
                onClick={() => dispatch(cancelTask(activeTask.id))}
                className="text-[10px] text-red-400 transition-colors hover:text-red-300"
              >
                cancel
              </button>
            </div>
          </div>

          <div className="text-codin-fg-muted text-[10px]">
            {activeTask.topology} | {activeTask.nodes.length} nodes |{" "}
            {activeTask.metadata.nodesCompleted} done |{" "}
            {activeTask.metadata.nodesFailed} failed
          </div>

          {/* Node list */}
          <div className="space-y-0.5">
            {activeTask.nodes.map((node) => {
              const style =
                NODE_STATUS_STYLES[node.status] || NODE_STATUS_STYLES.queued;
              return (
                <div
                  key={node.id}
                  className="flex items-center gap-1.5 text-[10px]"
                >
                  <span
                    className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${style.dot}`}
                  />
                  <span className="text-codin-fg-secondary truncate">
                    {node.goal}
                  </span>
                  <span className="text-codin-fg-muted ml-auto font-mono">
                    {node.agentType}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
