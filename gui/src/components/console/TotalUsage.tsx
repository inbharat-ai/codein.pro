import { calculateRequestCost } from "core/llm/utils/calculateRequestCost";
import React, { useMemo, useState } from "react";
import { LLMLog } from "../../hooks/useLLMLog";
import useTotalUsage from "../../hooks/useTotalUsage";

interface TotalUsageProps {
  llmLog: LLMLog;
}

const StatCard: React.FC<{ label: string; value: number; color?: string }> = ({
  label,
  value,
  color = "var(--codin-fg-primary, #e8e6f0)",
}) => (
  <div className="border-[color:var(--codin-border, #2a2845)] bg-[color:var(--codin-bg-surface, #201e3a)] flex flex-col items-center rounded-lg border p-3">
    <div className="text-[color:var(--codin-fg-muted, #8b88ad)] text-sm">
      {label}
    </div>
    <div className="text-lg font-semibold" style={{ color }}>
      {value.toLocaleString()}
    </div>
  </div>
);

const CostChart: React.FC<{ llmLog: LLMLog }> = ({ llmLog }) => {
  const chartData = useMemo(() => {
    let cumulativeCost = 0;
    const dataPoints: { interaction: number; cost: number }[] = [];

    llmLog.order.forEach((id, index) => {
      const interaction = llmLog.interactions.get(id);

      // Calculate cost for this interaction if we have the necessary data
      if (
        interaction?.end?.usage &&
        interaction.start?.provider &&
        interaction.start?.options?.model
      ) {
        const costBreakdown = calculateRequestCost(
          interaction.start.provider,
          interaction.start.options.model,
          interaction.end.usage,
        );
        if (costBreakdown) {
          cumulativeCost += costBreakdown.cost;
        }
      }

      dataPoints.push({ interaction: index + 1, cost: cumulativeCost });
    });

    return dataPoints;
  }, [llmLog.order, llmLog.interactions]);

  if (chartData.length === 0 || chartData[chartData.length - 1].cost === 0) {
    return null;
  }

  const maxCost = Math.max(...chartData.map((d) => d.cost));
  const maxInteraction = chartData.length;
  const chartWidth = 400;
  const chartHeight = 200;
  const padding = 40;

  const xScale = (interaction: number) =>
    ((interaction - 1) / (maxInteraction - 1)) * (chartWidth - 2 * padding) +
    padding;

  const yScale = (cost: number) =>
    chartHeight - padding - (cost / maxCost) * (chartHeight - 2 * padding);

  const pathData = chartData
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"} ${xScale(d.interaction)} ${yScale(d.cost)}`,
    )
    .join(" ");

  return (
    <div className="border-[color:var(--codin-border, #2a2845)] bg-[color:var(--codin-bg-surface, #201e3a)] mb-4 rounded-lg border p-4">
      <h3 className="text-[color:var(--codin-fg-primary, #e8e6f0)] mb-3 text-sm font-semibold">
        Cumulative Cost Over Interactions
      </h3>
      <div className="flex justify-center">
        <svg
          width={chartWidth}
          height={chartHeight}
          className="overflow-visible"
        >
          {/* Grid lines */}
          <defs>
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="var(--codin-border, #2a2845)"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </pattern>
          </defs>
          <rect width={chartWidth} height={chartHeight} fill="url(#grid)" />

          {/* Chart area background */}
          <rect
            x={padding}
            y={padding}
            width={chartWidth - 2 * padding}
            height={chartHeight - 2 * padding}
            fill="var(--codin-bg-surface, #201e3a)"
            stroke="var(--codin-border, #2a2845)"
            strokeWidth="1"
          />

          {/* Cost line */}
          <path
            d={pathData}
            fill="none"
            stroke="var(--codin-saffron-500, #22c55e)"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Data points */}
          {chartData.map((d, i) => (
            <circle
              key={i}
              cx={xScale(d.interaction)}
              cy={yScale(d.cost)}
              r="3"
              fill="var(--codin-saffron-500, #22c55e)"
              stroke="var(--codin-bg-surface, #201e3a)"
              strokeWidth="1"
            />
          ))}

          {/* Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const cost = maxCost * ratio;
            const y = yScale(cost);
            return (
              <g key={ratio}>
                <line
                  x1={padding - 5}
                  y1={y}
                  x2={padding}
                  y2={y}
                  stroke="var(--codin-fg-primary, #e8e6f0)"
                  strokeWidth="1"
                />
                <text
                  x={padding - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--codin-fg-muted, #8b88ad)"
                >
                  ${cost.toFixed(4)}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const interaction = Math.round(1 + ratio * (maxInteraction - 1));
            const x = xScale(interaction);
            return (
              <g key={ratio}>
                <line
                  x1={x}
                  y1={chartHeight - padding}
                  x2={x}
                  y2={chartHeight - padding + 5}
                  stroke="var(--codin-fg-primary, #e8e6f0)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={chartHeight - padding + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--codin-fg-muted, #8b88ad)"
                >
                  {interaction}
                </text>
              </g>
            );
          })}

          {/* Axis labels */}
          <text
            x={chartWidth / 2}
            y={chartHeight - 5}
            textAnchor="middle"
            fontSize="12"
            fill="var(--codin-fg-primary, #e8e6f0)"
          >
            Interaction Number
          </text>
          <text
            x={15}
            y={chartHeight / 2}
            textAnchor="middle"
            fontSize="12"
            fill="var(--codin-fg-primary, #e8e6f0)"
            transform={`rotate(-90 15 ${chartHeight / 2})`}
          >
            Cumulative Cost ($)
          </text>
        </svg>
      </div>
    </div>
  );
};

const TotalUsage: React.FC<TotalUsageProps> = ({ llmLog }) => {
  const totalUsage = useTotalUsage(llmLog);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  return (
    <div className="border-[color:var(--codin-border, #2a2845)] border-b p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[color:var(--codin-fg-primary, #e8e6f0)] text-lg font-semibold">
          Total Usage Summary
        </h2>
        <div className="flex items-center gap-4">
          {totalUsage.totalCost > 0 && (
            <button
              onClick={() => setShowCostBreakdown(!showCostBreakdown)}
              className="text-[color:var(--codin-saffron-500, #22c55e)] hover:text-[color:var(--codin-indigo-400, #818cf8)] cursor-pointer text-lg font-semibold"
            >
              ${totalUsage.totalCost.toFixed(6)}
            </button>
          )}
          <div className="text-[color:var(--codin-fg-muted, #8b88ad)] text-sm">
            {totalUsage.totalInteractions} interactions
          </div>
        </div>
      </div>

      {showCostBreakdown && totalUsage.costBreakdowns.length > 0 && (
        <div className="border-[color:var(--codin-border, #2a2845)] bg-[color:var(--codin-bg-surface, #201e3a)] mb-4 max-h-32 overflow-y-auto rounded border p-3">
          <h3 className="text-[color:var(--codin-fg-primary, #e8e6f0)] mb-2 text-sm font-semibold">
            Cost Breakdown
          </h3>
          <div className="space-y-2 text-xs">
            {totalUsage.costBreakdowns.map((breakdown, index) => (
              <div
                key={index}
                className="border-[color:var(--codin-border, #2a2845)] border-b pb-2 last:border-b-0"
              >
                <pre className="text-[color:var(--codin-fg-muted, #8b88ad)] whitespace-pre-wrap">
                  {breakdown.breakdown}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Input Tokens"
          value={totalUsage.totalPromptTokens}
          color="var(--codin-indigo-400, #818cf8)"
        />
        <StatCard
          label="Output Tokens"
          value={totalUsage.totalGeneratedTokens}
          color="var(--codin-saffron-500, #22c55e)"
        />
        <StatCard
          label="Thinking Tokens"
          value={totalUsage.totalThinkingTokens}
          color="var(--codin-indigo-500, #6366f1)"
        />
        <StatCard
          label="Cache Read"
          value={totalUsage.totalCachedTokens}
          color="var(--codin-saffron-600, #d97706)"
        />
      </div>

      {totalUsage.totalCost > 0 && (
        <>
          <CostChart llmLog={llmLog} />
          <div className="mb-4">
            <div className="border-[color:var(--codin-border, #2a2845)] bg-[color:var(--codin-bg-surface, #201e3a)] flex flex-col items-center rounded-lg border p-3">
              <div className="text-[color:var(--codin-fg-muted, #8b88ad)] text-sm">
                Total Cost
              </div>
              <div className="text-[color:var(--codin-saffron-500, #22c55e)] text-2xl font-bold">
                ${totalUsage.totalCost.toFixed(6)}
              </div>
              <div className="text-[color:var(--codin-fg-muted, #8b88ad)] text-xs">
                {totalUsage.costBreakdowns.length} cost calculations
              </div>
            </div>
          </div>
        </>
      )}

      {totalUsage.totalCacheWriteTokens > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <StatCard
            label="Cache Write"
            value={totalUsage.totalCacheWriteTokens}
            color="var(--codin-saffron-700, #b45309)"
          />
          <div className="border-[color:var(--codin-border, #2a2845)] bg-[color:var(--codin-bg-surface, #201e3a)] flex items-center justify-center rounded-lg border p-3">
            <div className="text-[color:var(--codin-fg-muted, #8b88ad)] text-sm">
              Cache Hit Rate:{" "}
              {totalUsage.totalPromptTokens > 0
                ? (
                    (totalUsage.totalCachedTokens /
                      totalUsage.totalPromptTokens) *
                    100
                  ).toFixed(1)
                : "0"}
              %
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="border-[color:var(--codin-border, #2a2845)] bg-[color:var(--codin-bg-surface, #201e3a)] rounded border p-2 text-center">
          <div className="text-[color:var(--codin-saffron-500, #22c55e)]">
            {totalUsage.totalSuccessfulInteractions}
          </div>
          <div className="text-[color:var(--codin-fg-muted, #8b88ad)]">
            Success
          </div>
        </div>
        <div className="border-[color:var(--codin-border, #2a2845)] bg-[color:var(--codin-bg-surface, #201e3a)] rounded border p-2 text-center">
          <div className="text-[color:var(--codin-saffron-700, #b45309)]">
            {totalUsage.totalErrorInteractions}
          </div>
          <div className="text-[color:var(--codin-fg-muted, #8b88ad)]">
            Error
          </div>
        </div>
        <div className="border-[color:var(--codin-border, #2a2845)] bg-[color:var(--codin-bg-surface, #201e3a)] rounded border p-2 text-center">
          <div className="text-[color:var(--codin-saffron-300, #fcd34d)]">
            {totalUsage.totalCancelledInteractions}
          </div>
          <div className="text-[color:var(--codin-fg-muted, #8b88ad)]">
            Cancelled
          </div>
        </div>
      </div>
    </div>
  );
};

export default TotalUsage;
