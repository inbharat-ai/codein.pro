import { useAppSelector } from "../../redux/hooks";
import { selectSwarmStatus } from "../../redux/slices/swarmSlice";

export function SwarmGpu() {
  const status = useAppSelector(selectSwarmStatus);
  const gpu = status?.gpu;

  if (!gpu) {
    return (
      <div>
        <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
          GPU Budget
        </h3>
        <p className="text-codin-fg-muted text-[10px]">No GPU session active</p>
      </div>
    );
  }

  const budget = gpu.budget ?? 100;
  const spent = gpu.spent ?? 0;
  const remaining = Math.max(0, budget - spent);
  const pct = budget > 0 ? (spent / budget) * 100 : 0;

  const barColor =
    pct > 90
      ? "bg-red-500"
      : pct > 70
        ? "bg-codin-saffron-500"
        : "bg-emerald-500";

  return (
    <div>
      <h3 className="text-codin-fg-secondary mb-1.5 text-xs font-semibold">
        GPU Budget
      </h3>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[10px]">
          <div className="bg-codin-bg h-2 flex-1 overflow-hidden rounded-full">
            <div
              className={`${barColor} h-full rounded-full transition-all duration-300`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <span className="text-codin-fg-muted w-24 text-right font-mono">
            ${spent.toFixed(2)} / ${budget.toFixed(2)}
          </span>
        </div>
        <div className="text-codin-fg-muted flex justify-between text-[10px]">
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
            Budget nearly exhausted
          </div>
        )}
      </div>
    </div>
  );
}
