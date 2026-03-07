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

const NODE_STATUS_COLORS: Record<string, string> = {
  queued: "bg-zinc-600",
  running: "bg-blue-600 animate-pulse",
  blocked: "bg-yellow-600",
  succeeded: "bg-green-600",
  failed: "bg-red-600",
  cancelled: "bg-zinc-800",
  retrying: "bg-orange-600",
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
      <h3 className="text-vsc-foreground/70 mb-1 text-xs font-semibold">
        Task
      </h3>

      {/* Submit new task */}
      <div className="mb-2 flex gap-1">
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Describe the goal..."
          className="bg-vsc-input-background border-vsc-input-border flex-1 rounded border px-2 py-1 text-xs"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !goal.trim()}
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "..." : "Go"}
        </button>
      </div>

      {/* Active task display */}
      {activeTask && (
        <div className="bg-vsc-input-background space-y-1.5 rounded p-2">
          <div className="flex items-center justify-between text-xs">
            <span className="max-w-[200px] truncate font-medium">
              {activeTask.goal}
            </span>
            <div className="flex gap-1">
              <button
                onClick={handleRefresh}
                className="text-[10px] text-blue-400 hover:underline"
              >
                refresh
              </button>
              <button
                onClick={() => dispatch(cancelTask(activeTask.id))}
                className="text-[10px] text-red-400 hover:underline"
              >
                cancel
              </button>
            </div>
          </div>

          <div className="text-vsc-foreground/50 text-[10px]">
            {activeTask.topology} | {activeTask.nodes.length} nodes |
            {activeTask.metadata.nodesCompleted} done |{" "}
            {activeTask.metadata.nodesFailed} failed
          </div>

          {/* Node list */}
          <div className="space-y-0.5">
            {activeTask.nodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center gap-1.5 text-[10px]"
              >
                <span
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${NODE_STATUS_COLORS[node.status] || "bg-zinc-600"}`}
                />
                <span className="truncate">{node.goal}</span>
                <span className="text-vsc-foreground/40 ml-auto">
                  {node.agentType}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
