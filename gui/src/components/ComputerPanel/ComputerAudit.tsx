import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchAudit,
  selectAudit,
  type AuditEntry,
} from "../../redux/slices/computerSlice";

const ACTION_STYLES: Record<string, string> = {
  execute: "bg-codin-indigo-500/20 text-codin-indigo-300",
  approve: "bg-emerald-500/20 text-emerald-400",
  deny: "bg-red-500/20 text-red-400",
  error: "bg-red-600/20 text-red-300",
  cost: "bg-codin-saffron-500/20 text-codin-saffron-400",
  plan: "bg-purple-500/20 text-purple-300",
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
        <h3 className="text-codin-fg-secondary text-xs font-semibold">
          {t("computer.audit.title")}{" "}
          <span className="text-codin-fg-muted font-normal">
            ({entries.length})
          </span>
        </h3>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-codin-bg-surface border-codin-border text-codin-fg focus:border-codin-border-focus rounded border px-1.5 py-0.5 text-[10px] focus:outline-none"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? t("computer.audit.allActions") : opt}
            </option>
          ))}
        </select>
      </div>

      {entries.length === 0 && (
        <p className="text-codin-fg-muted py-4 text-center text-[10px]">
          {t("computer.audit.empty")}
        </p>
      )}

      {entries.length > 0 && (
        <div className="max-h-[60vh] space-y-0.5 overflow-y-auto">
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
    <div className="bg-codin-bg-surface hover:bg-codin-bg-hover flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[10px] transition-colors">
      <span className="text-codin-fg-muted shrink-0 font-mono">
        {formatTimestamp(entry.timestamp)}
      </span>

      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${ACTION_STYLES[entry.action] || "bg-codin-bg-hover text-codin-fg-muted"}`}
      >
        {entry.action}
      </span>

      <span
        className="text-codin-fg-secondary min-w-0 shrink truncate"
        title={entry.skill}
      >
        {entry.skill}
      </span>

      <span
        className="text-codin-fg-muted max-w-[60px] shrink-0 truncate font-mono"
        title={entry.agent}
      >
        {entry.agent}
      </span>

      <span className="text-codin-fg-muted shrink-0 font-mono">
        {formatDuration(entry.durationMs)}
      </span>

      {entry.costUSD > 0 && (
        <span className="shrink-0 font-mono text-emerald-400">
          ${entry.costUSD.toFixed(4)}
        </span>
      )}
    </div>
  );
}
