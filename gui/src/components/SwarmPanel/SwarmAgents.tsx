import { useAppSelector } from "../../redux/hooks";
import {
  selectSwarmAgents,
  selectSwarmLoading,
} from "../../redux/slices/swarmSlice";
import { LoadingSkeleton } from "../ui/LoadingState";

const STATUS_STYLES: Record<string, { dot: string; ring: string }> = {
  idle: { dot: "bg-codin-fg-muted", ring: "" },
  busy: {
    dot: "bg-codin-saffron-400 animate-pulse",
    ring: "ring-1 ring-codin-saffron-400/30",
  },
  failed: { dot: "bg-red-400", ring: "ring-1 ring-red-400/30" },
  terminated: { dot: "bg-zinc-600", ring: "" },
};

export function SwarmAgents() {
  const agents = useAppSelector(selectSwarmAgents);
  const loading = useAppSelector(selectSwarmLoading);

  if (loading && agents.length === 0) {
    return (
      <div>
        <h3 className="text-codin-fg-secondary mb-1.5 text-xs font-semibold">
          Agents
        </h3>
        <LoadingSkeleton lines={3} />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div>
        <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
          Agents
        </h3>
        <p className="text-codin-fg-muted text-[10px]">
          No agents spawned yet. Submit a task to auto-spawn agents.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-codin-fg-secondary mb-1.5 text-xs font-semibold">
        Agents{" "}
        <span className="text-codin-indigo-400 font-normal">
          ({agents.length})
        </span>
      </h3>
      <div className="space-y-1">
        {agents.map((agent) => {
          const style = STATUS_STYLES[agent.status] || STATUS_STYLES.idle;
          return (
            <div
              key={agent.id}
              className="bg-codin-bg-surface hover:bg-codin-bg-hover flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
            >
              <span
                className={`h-2 w-2 rounded-full ${style.dot} ${style.ring}`}
              />
              <span className="text-codin-fg font-medium">{agent.type}</span>
              <span className="text-codin-fg-muted font-mono text-[10px]">
                {agent.id.slice(0, 8)}
              </span>
              <span className="text-codin-fg-muted ml-auto text-[10px]">
                {agent.metrics.tasksCompleted} tasks
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
