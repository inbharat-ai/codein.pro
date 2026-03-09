import { useAppSelector } from "../../redux/hooks";
import { selectSwarmEvents } from "../../redux/slices/swarmSlice";

const TYPE_COLORS: Record<string, string> = {
  swarm_initialized: "text-green-400",
  swarm_shutdown: "text-red-400",
  agent_spawned: "text-blue-400",
  agent_terminated: "text-gray-400",
  task_submitted: "text-cyan-400",
  task_completed: "text-green-400",
  task_failed: "text-red-400",
  task_cancelled: "text-yellow-400",
  node_queued: "text-gray-300",
  node_running: "text-blue-300",
  node_completed: "text-green-300",
  node_failed: "text-red-300",
  node_retrying: "text-orange-300",
  permission_requested: "text-yellow-400",
  permission_granted: "text-green-400",
  permission_denied: "text-red-400",
  memory_saved: "text-purple-400",
  gpu_budget_warning: "text-orange-400",
  gpu_session_expired: "text-red-300",
  batch_started: "text-cyan-300",
  batch_completed: "text-cyan-400",
};

function formatTime(ts: string | number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SwarmTimeline(): JSX.Element {
  const events = useAppSelector(selectSwarmEvents);

  if (events.length === 0) {
    return (
      <div>
        <h3 className="text-vsc-foreground/70 mb-1 text-xs font-semibold">
          Timeline
        </h3>
        <p className="text-vsc-foreground/40 text-[10px]">No events yet</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-vsc-foreground/70 mb-1 text-xs font-semibold">
        Timeline ({events.length})
      </h3>
      <div className="scrollbar-thin max-h-48 space-y-0.5 overflow-y-auto pr-1">
        {[...events].reverse().map((ev) => (
          <div
            key={ev.id}
            className="flex items-start gap-1.5 py-0.5 text-[10px] leading-tight"
          >
            <span className="text-vsc-foreground/40 shrink-0 font-mono">
              {formatTime(ev.timestamp)}
            </span>
            <span
              className={`shrink-0 ${TYPE_COLORS[ev.type] || "text-vsc-foreground/60"}`}
            >
              {ev.type.replace(/_/g, " ")}
            </span>
            {ev.data && (
              <span className="text-vsc-foreground/40 truncate">
                {typeof ev.data === "string"
                  ? ev.data
                  : ((ev.data.agentType ||
                      ev.data.taskId ||
                      ev.data.nodeId ||
                      "") as string)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
