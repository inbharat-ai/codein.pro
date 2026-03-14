import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchAudit,
  selectAudit,
  type AuditEntry,
} from "../../redux/slices/computerSlice";

const ACTION_BADGES: Record<string, string> = {
  execute: "bg-blue-600",
  approve: "bg-green-600",
  deny: "bg-red-600",
  error: "bg-red-800",
  cost: "bg-yellow-600",
  plan: "bg-purple-600",
};

const ACTION_OPTIONS = [
  "all",
  "execute",
  "approve",
  "deny",
  "error",
  "cost",
  "plan",
];

export function ComputerAudit() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const entries = useAppSelector(selectAudit);
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    dispatch(
      fetchAudit(actionFilter !== "all" ? { action: actionFilter } : undefined),
    );
  }, [dispatch, actionFilter]);

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="space-y-2">
      {/* Header + filter */}
      <div className="flex items-center justify-between">
        <h3 className="text-vsc-foreground/70 text-xs font-semibold">
          {t("computer.audit.title")} ({entries.length})
        </h3>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-vsc-input-background border-vsc-input-border rounded border px-1 py-0.5 text-[10px]"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? t("computer.audit.allActions") : opt}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {entries.length === 0 && (
        <p className="text-vsc-foreground/40 py-4 text-center text-[10px]">
          {t("computer.audit.empty")}
        </p>
      )}

      {/* Audit entries */}
      {entries.length > 0 && (
        <div className="scrollbar-thin max-h-[60vh] space-y-0.5 overflow-y-auto">
          {entries.map((entry) => (
            <AuditRow
              key={entry.id}
              entry={entry}
              formatTimestamp={formatTimestamp}
              formatDuration={formatDuration}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AuditRow({
  entry,
  formatTimestamp,
  formatDuration,
}: {
  entry: AuditEntry;
  formatTimestamp: (ts: string) => string;
  formatDuration: (ms: number) => string;
}) {
  return (
    <div className="bg-vsc-input-background flex items-center gap-2 rounded px-2 py-1 text-[10px]">
      {/* Timestamp */}
      <span className="text-vsc-foreground/30 shrink-0 font-mono">
        {formatTimestamp(entry.timestamp)}
      </span>

      {/* Action badge */}
      <span
        className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-medium text-white ${ACTION_BADGES[entry.action] || "bg-zinc-600"}`}
      >
        {entry.action}
      </span>

      {/* Skill */}
      <span
        className="text-vsc-foreground/60 min-w-0 shrink truncate"
        title={entry.skill}
      >
        {entry.skill}
      </span>

      {/* Agent */}
      <span
        className="text-vsc-foreground/40 max-w-[60px] shrink-0 truncate"
        title={entry.agent}
      >
        {entry.agent}
      </span>

      {/* Duration */}
      <span className="text-vsc-foreground/30 shrink-0 font-mono">
        {formatDuration(entry.durationMs)}
      </span>

      {/* Cost */}
      {entry.costUSD > 0 && (
        <span className="shrink-0 font-mono text-green-400">
          ${entry.costUSD.toFixed(4)}
        </span>
      )}
    </div>
  );
}
