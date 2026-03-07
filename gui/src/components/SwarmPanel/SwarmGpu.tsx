import { useAppSelector } from "../../redux/hooks";
import { selectSwarmStatus } from "../../redux/slices/swarmSlice";

export function SwarmGpu() {
  const status = useAppSelector(selectSwarmStatus);
  const gpu = status?.gpu;

  if (!gpu) return null;

  const budget = gpu.budget ?? 100;
  const spent = gpu.spent ?? 0;
  const remaining = Math.max(0, budget - spent);
  const pct = budget > 0 ? (spent / budget) * 100 : 0;

  const barColor =
    pct > 90 ? "bg-red-500" : pct > 70 ? "bg-orange-500" : "bg-green-500";

  return (
    <div>
      <h3 className="text-vsc-foreground/70 mb-1 text-xs font-semibold">
        GPU Budget
      </h3>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[10px]">
          <div className="bg-vsc-background h-2 flex-1 overflow-hidden rounded">
            <div
              className={`${barColor} h-full rounded transition-all`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <span className="text-vsc-foreground/60 w-20 text-right">
            ${spent.toFixed(2)} / ${budget.toFixed(2)}
          </span>
        </div>
        <div className="text-vsc-foreground/40 flex justify-between text-[10px]">
          <span>Remaining: ${remaining.toFixed(2)}</span>
          {gpu.sessionTtl && (
            <span>Session: {Math.ceil(gpu.sessionTtl / 60000)}m</span>
          )}
          {gpu.idleTimeout && (
            <span>Idle: {Math.ceil(gpu.idleTimeout / 60000)}m</span>
          )}
        </div>
        {pct > 90 && (
          <div className="text-[10px] font-medium text-red-400">
            ⚠ Budget nearly exhausted
          </div>
        )}
      </div>
    </div>
  );
}
