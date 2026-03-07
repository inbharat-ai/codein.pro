import { useAppSelector } from "../../redux/hooks";
import { selectSwarmAgents } from "../../redux/slices/swarmSlice";

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-zinc-600",
  busy: "bg-yellow-600",
  failed: "bg-red-600",
  terminated: "bg-zinc-800",
};

export function SwarmAgents() {
  const agents = useAppSelector(selectSwarmAgents);

  if (agents.length === 0) return null;

  return (
    <div>
      <h3 className="text-vsc-foreground/70 mb-1 text-xs font-semibold">
        Agents ({agents.length})
      </h3>
      <div className="space-y-1">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="bg-vsc-input-background flex items-center gap-2 rounded px-2 py-1 text-xs"
          >
            <span
              className={`h-2 w-2 rounded-full ${STATUS_COLORS[agent.status] || "bg-zinc-600"}`}
            />
            <span className="font-medium">{agent.type}</span>
            <span className="text-vsc-foreground/50 text-[10px]">
              {agent.id.slice(0, 8)}
            </span>
            <span className="text-vsc-foreground/50 ml-auto">
              {agent.metrics.tasksCompleted} tasks
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
