import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchMemoryUsage,
  selectMemoryUsage,
} from "../../redux/slices/swarmSlice";

export function SwarmMemory() {
  const dispatch = useAppDispatch();
  const memory = useAppSelector(selectMemoryUsage);

  useEffect(() => {
    dispatch(fetchMemoryUsage());
  }, [dispatch]);

  if (!memory) {
    return (
      <div>
        <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
          Memory
        </h3>
        <p className="text-codin-fg-muted text-[10px]">No data</p>
      </div>
    );
  }

  const tiers = [
    {
      label: "Short-term",
      entries: memory.shortTerm?.entries ?? 0,
      color: "bg-blue-500",
    },
    {
      label: "Working",
      entries: memory.working?.entries ?? 0,
      color: "bg-purple-500",
    },
    {
      label: "Long-term",
      entries: memory.longTerm?.entries ?? 0,
      color: "bg-green-500",
    },
  ];

  const totalEntries = tiers.reduce((s, t) => s + t.entries, 0);
  const maxEntries = 500; // display cap

  return (
    <div>
      <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
        Memory
      </h3>
      <div className="space-y-1">
        {tiers.map((t) => (
          <div key={t.label} className="flex items-center gap-2 text-[10px]">
            <span className="text-codin-fg-secondary w-16">{t.label}</span>
            <div className="bg-codin-bg h-1.5 flex-1 overflow-hidden rounded-md">
              <div
                className={`${t.color} h-full rounded-md transition-all`}
                style={{
                  width: `${Math.min(100, (t.entries / maxEntries) * 100)}%`,
                }}
              />
            </div>
            <span className="text-codin-fg-muted w-14 text-right">
              {t.entries}
            </span>
          </div>
        ))}
        <div className="text-codin-fg-muted text-right text-[10px]">
          Total: {totalEntries} entries
        </div>
      </div>
    </div>
  );
}
