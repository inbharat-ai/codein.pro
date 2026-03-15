import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchBudgetStatus,
  selectSwarmBudget,
} from "../../redux/slices/swarmSlice";

export function SwarmBudget() {
  const dispatch = useAppDispatch();
  const budget = useAppSelector(selectSwarmBudget);

  useEffect(() => {
    dispatch(fetchBudgetStatus());
    const id = setInterval(() => dispatch(fetchBudgetStatus()), 15000);
    return () => clearInterval(id);
  }, [dispatch]);

  if (!budget) {
    return (
      <div>
        <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
          Budget
        </h3>
        <p className="text-codin-fg-muted text-[10px]">
          Loading budget data...
        </p>
      </div>
    );
  }

  const pct =
    budget.budgetUSD > 0 ? (budget.totalSpent / budget.budgetUSD) * 100 : 0;
  const barColor = budget.isOverBudget
    ? "bg-red-500"
    : pct > budget.warningThreshold * 100
      ? "bg-orange-500"
      : "bg-green-500";

  return (
    <div>
      <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
        Budget
      </h3>
      <div className="bg-codin-bg-surface space-y-1.5 rounded-md p-2">
        <div className="flex items-center gap-2 text-[10px]">
          <div className="bg-codin-bg h-2.5 flex-1 overflow-hidden rounded-md">
            <div
              className={`${barColor} h-full rounded-md transition-all`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <span className="text-codin-fg-secondary w-16 text-right font-mono">
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <div>
            <span className="text-codin-fg-muted">Spent</span>
            <div className="font-mono text-green-400">
              ${budget.totalSpent.toFixed(2)}
            </div>
          </div>
          <div>
            <span className="text-codin-fg-muted">Budget</span>
            <div className="font-mono">${budget.budgetUSD.toFixed(2)}</div>
          </div>
          <div>
            <span className="text-codin-fg-muted">Left</span>
            <div
              className={`font-mono ${budget.remaining < 1 ? "text-red-400" : ""}`}
            >
              ${budget.remaining.toFixed(2)}
            </div>
          </div>
        </div>
        {budget.isOverBudget && (
          <div className="text-[10px] font-medium text-red-400">
            Budget exceeded - tasks will be throttled
          </div>
        )}
      </div>
    </div>
  );
}
