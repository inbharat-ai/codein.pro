/** Budget bar showing spending progress against limit. */
import React from "react";

import type { GpuStatus } from "./gpu-types";

interface GpuBudgetBarProps {
  status: GpuStatus;
}

export const GpuBudgetBar: React.FC<GpuBudgetBarProps> = ({ status }) => {
  if (!status.budget) return null;

  const budgetPercent = Math.min(
    100,
    (status.budget.spent / status.budget.limit) * 100,
  );
  const budgetClass =
    budgetPercent > 80
      ? "gpu-budget__fill--danger"
      : budgetPercent > 50
        ? "gpu-budget__fill--warn"
        : "gpu-budget__fill--ok";

  return (
    <div className="gpu-budget">
      <div className="gpu-budget__row">
        <span className="gpu-budget__label">Budget</span>
        <span className="gpu-budget__value">
          ${status.budget.spent.toFixed(2)} / ${status.budget.limit.toFixed(2)}
        </span>
      </div>
      <div className="gpu-budget__bar">
        <div
          className={`gpu-budget__fill ${budgetClass}`}
          style={{ width: `${budgetPercent}%` }}
        />
      </div>
    </div>
  );
};
