import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchAnalytics,
  fetchCostSuggestions,
  selectSwarmAnalytics,
  selectCostSuggestions,
  selectAnalyticsLoaded,
} from "../../redux/slices/swarmSlice";
import { LoadingSkeleton } from "../ui/LoadingState";

export function SwarmAnalytics() {
  const dispatch = useAppDispatch();
  const analytics = useAppSelector(selectSwarmAnalytics);
  const suggestions = useAppSelector(selectCostSuggestions);
  const loaded = useAppSelector(selectAnalyticsLoaded);

  useEffect(() => {
    dispatch(fetchAnalytics(undefined));
    dispatch(fetchCostSuggestions());
  }, [dispatch]);

  if (!analytics) {
    return (
      <div>
        <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
          Analytics
        </h3>
        {loaded ? (
          <p className="text-codin-fg-muted text-[10px]">
            Analytics not available
          </p>
        ) : (
          <LoadingSkeleton lines={4} />
        )}
      </div>
    );
  }

  const costByAgent = analytics.costByAgent || {};
  const costByModel = analytics.costByModel || {};

  return (
    <div>
      <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
        Analytics
      </h3>
      <div className="space-y-2">
        {/* Summary */}
        <div className="bg-codin-bg-surface rounded-md p-2">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-codin-fg-secondary">Total Cost</span>
              <div className="text-sm font-medium text-green-400">
                ${(analytics.totalCost || 0).toFixed(4)}
              </div>
            </div>
            <div>
              <span className="text-codin-fg-secondary">Total Tokens</span>
              <div className="text-codin-indigo-400 text-sm font-medium">
                {(analytics.totalTokens || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Cost by Agent */}
        {Object.keys(costByAgent).length > 0 && (
          <div>
            <h4 className="text-codin-fg-secondary mb-0.5 text-[10px] font-medium">
              Cost by Agent
            </h4>
            <div className="space-y-0.5">
              {Object.entries(costByAgent)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([agent, cost]) => (
                  <div
                    key={agent}
                    className="flex items-center justify-between text-[10px]"
                  >
                    <span className="text-codin-fg-secondary">{agent}</span>
                    <span className="font-mono text-green-400">
                      ${(cost as number).toFixed(4)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Cost by Model */}
        {Object.keys(costByModel).length > 0 && (
          <div>
            <h4 className="text-codin-fg-secondary mb-0.5 text-[10px] font-medium">
              Cost by Model
            </h4>
            <div className="space-y-0.5">
              {Object.entries(costByModel)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([model, cost]) => (
                  <div
                    key={model}
                    className="flex items-center justify-between text-[10px]"
                  >
                    <span className="text-codin-fg-secondary max-w-[150px] truncate">
                      {model}
                    </span>
                    <span className="font-mono text-green-400">
                      ${(cost as number).toFixed(4)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Cost Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <h4 className="text-codin-fg-secondary mb-0.5 text-[10px] font-medium">
              Optimization Tips
            </h4>
            <div className="space-y-1">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="bg-codin-bg-surface rounded-md p-1.5 text-[10px]"
                >
                  <div className="flex items-start gap-1">
                    <span
                      className={`shrink-0 ${s.priority === "high" ? "text-red-400" : s.priority === "medium" ? "text-codin-saffron-400" : "text-codin-indigo-400"}`}
                    >
                      {s.priority === "high"
                        ? "!"
                        : s.priority === "medium"
                          ? "*"
                          : "-"}
                    </span>
                    <span className="text-codin-fg-secondary">
                      {s.suggestion}
                    </span>
                  </div>
                  {s.estimatedSavings > 0 && (
                    <div className="ml-3 mt-0.5 text-green-400">
                      Save ~${s.estimatedSavings.toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
