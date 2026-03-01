/**
 * CodeDiffView — Side-by-side or inline diff with Accept/Reject actions
 * Highlights additions (green), deletions (red), and modifications
 */
import React, { useMemo, useState } from "react";

interface DiffLine {
  type: "add" | "remove" | "context";
  lineNumber: { old?: number; new?: number };
  content: string;
}

interface CodeDiffViewProps {
  original: string;
  modified: string;
  filePath?: string;
  language?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onPartialAccept?: (selectedLines: number[]) => void;
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const oldLines = original.split("\n");
  const newLines = modified.split("\n");
  const result: DiffLine[] = [];
  let oi = 0,
    ni = 0;

  // Simple LCS-based diff
  const lcs = buildLCS(oldLines, newLines);
  let li = lcs.length - 1;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li >= 0 && oi === lcs[li][0] && ni === lcs[li][1]) {
      result.push({
        type: "context",
        lineNumber: { old: oi + 1, new: ni + 1 },
        content: oldLines[oi],
      });
      oi++;
      ni++;
      li--;
    } else if (ni < newLines.length && (li < 0 || ni < lcs[li][1])) {
      result.push({
        type: "add",
        lineNumber: { new: ni + 1 },
        content: newLines[ni],
      });
      ni++;
    } else if (oi < oldLines.length && (li < 0 || oi < lcs[li][0])) {
      result.push({
        type: "remove",
        lineNumber: { old: oi + 1 },
        content: oldLines[oi],
      });
      oi++;
    }
  }
  return result;
}

function buildLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length,
    n = b.length;
  // DP array (optimized for reasonable sizes)
  const max = Math.min(m * n, 500_000); // guard against huge files
  if (m * n > max) {
    // Fallback: treat everything as changed
    return [];
  }
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack
  const pairs: [number, number][] = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return pairs; // reversed order, consumed from end
}

const LINE_STYLES: Record<string, React.CSSProperties> = {
  add: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderLeft: "3px solid #22c55e",
  },
  remove: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderLeft: "3px solid #ef4444",
    textDecoration: "line-through",
    opacity: 0.7,
  },
  context: { borderLeft: "3px solid transparent" },
};

export function CodeDiffView({
  original,
  modified,
  filePath,
  language,
  onAccept,
  onReject,
  onPartialAccept,
}: CodeDiffViewProps) {
  const diff = useMemo(
    () => computeDiff(original, modified),
    [original, modified],
  );
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());

  const stats = useMemo(() => {
    const adds = diff.filter((d) => d.type === "add").length;
    const removes = diff.filter((d) => d.type === "remove").length;
    return { adds, removes };
  }, [diff]);

  const toggleLine = (idx: number) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div
      className="code-diff-view"
      style={{
        borderRadius: "8px",
        border: "1px solid rgba(128, 128, 128, 0.2)",
        overflow: "hidden",
        fontSize: "13px",
        fontFamily: "var(--vscode-editor-font-family, monospace)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          backgroundColor: "rgba(128, 128, 128, 0.06)",
          borderBottom: "1px solid rgba(128, 128, 128, 0.15)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {filePath && <span style={{ fontWeight: 500 }}>{filePath}</span>}
          {language && (
            <span
              style={{
                fontSize: "11px",
                opacity: 0.6,
                textTransform: "uppercase",
              }}
            >
              {language}
            </span>
          )}
          <span style={{ color: "#22c55e", fontSize: "12px" }}>
            +{stats.adds}
          </span>
          <span style={{ color: "#ef4444", fontSize: "12px" }}>
            -{stats.removes}
          </span>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {onPartialAccept && selectedLines.size > 0 && (
            <button
              onClick={() => onPartialAccept(Array.from(selectedLines))}
              style={buttonStyle("#818cf8")}
            >
              Accept Selected ({selectedLines.size})
            </button>
          )}
          {onReject && (
            <button onClick={onReject} style={buttonStyle("#ef4444")}>
              Reject
            </button>
          )}
          {onAccept && (
            <button onClick={onAccept} style={buttonStyle("#22c55e")}>
              Accept All
            </button>
          )}
        </div>
      </div>

      {/* Diff lines */}
      <div style={{ maxHeight: "400px", overflow: "auto" }}>
        {diff.map((line, i) => (
          <div
            key={i}
            onClick={() => line.type !== "context" && toggleLine(i)}
            style={{
              display: "flex",
              alignItems: "stretch",
              cursor: line.type !== "context" ? "pointer" : "default",
              ...LINE_STYLES[line.type],
              outline: selectedLines.has(i) ? "2px solid #818cf8" : "none",
              outlineOffset: "-2px",
            }}
          >
            <span
              style={{
                minWidth: "40px",
                padding: "1px 8px",
                textAlign: "right",
                opacity: 0.4,
                fontSize: "11px",
                borderRight: "1px solid rgba(128,128,128,0.1)",
                userSelect: "none",
              }}
            >
              {line.lineNumber.old ?? ""}
            </span>
            <span
              style={{
                minWidth: "40px",
                padding: "1px 8px",
                textAlign: "right",
                opacity: 0.4,
                fontSize: "11px",
                borderRight: "1px solid rgba(128,128,128,0.1)",
                userSelect: "none",
              }}
            >
              {line.lineNumber.new ?? ""}
            </span>
            <span style={{ padding: "1px 12px", flex: 1 }}>
              <span style={{ opacity: 0.5, marginRight: "8px" }}>
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              </span>
              {line.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buttonStyle(color: string): React.CSSProperties {
  return {
    padding: "4px 14px",
    borderRadius: "6px",
    border: `1px solid ${color}40`,
    backgroundColor: `${color}18`,
    color,
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
  };
}

export default CodeDiffView;
