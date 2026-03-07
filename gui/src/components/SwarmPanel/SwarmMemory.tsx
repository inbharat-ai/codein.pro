import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchMemoryUsage,
  selectMemoryUsage,
} from "../../redux/slices/swarmSlice";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SwarmMemory() {
  const dispatch = useAppDispatch();
  const memory = useAppSelector(selectMemoryUsage);

  useEffect(() => {
    dispatch(fetchMemoryUsage());
  }, [dispatch]);

  if (!memory) {
    return (
      <div>
        <h3 className="text-vsc-foreground/70 mb-1 text-xs font-semibold">
          Memory
        </h3>
        <p className="text-vsc-foreground/40 text-[10px]">No data</p>
      </div>
    );
  }

  const tiers = [
    {
      label: "Short-term",
      entries: memory.shortTerm?.entries ?? 0,
      size: memory.shortTerm?.sizeBytes ?? 0,
      color: "bg-blue-500",
    },
    {
      label: "Working",
      entries: memory.working?.entries ?? 0,
      size: memory.working?.sizeBytes ?? 0,
      color: "bg-purple-500",
    },
    {
      label: "Long-term",
      entries: memory.longTerm?.entries ?? 0,
      size: memory.longTerm?.sizeBytes ?? 0,
      color: "bg-green-500",
    },
  ];

  const totalSize = tiers.reduce((s, t) => s + t.size, 0);
  const maxSize = 10 * 1024 * 1024; // 10 MB cap

  return (
    <div>
      <h3 className="text-vsc-foreground/70 mb-1 text-xs font-semibold">
        Memory
      </h3>
      <div className="space-y-1">
        {tiers.map((t) => (
          <div key={t.label} className="flex items-center gap-2 text-[10px]">
            <span className="text-vsc-foreground/60 w-16">{t.label}</span>
            <div className="bg-vsc-background h-1.5 flex-1 overflow-hidden rounded">
              <div
                className={`${t.color} h-full rounded transition-all`}
                style={{ width: `${Math.min(100, (t.size / maxSize) * 100)}%` }}
              />
            </div>
            <span className="text-vsc-foreground/40 w-14 text-right">
              {t.entries} / {formatBytes(t.size)}
            </span>
          </div>
        ))}
        <div className="text-vsc-foreground/40 text-right text-[10px]">
          Total: {formatBytes(totalSize)} / {formatBytes(maxSize)}
        </div>
      </div>
    </div>
  );
}
