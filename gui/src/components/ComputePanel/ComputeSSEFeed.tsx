/** Scrollable live-streaming event log for a compute job (SSE feed). */
import React from "react";

import { formatTime } from "./compute-utils";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  stepId?: string;
}

interface ComputeSSEFeedProps {
  logs: LogEntry[];
  logsEndRef: React.RefObject<HTMLDivElement>;
}

export const ComputeSSEFeed: React.FC<ComputeSSEFeedProps> = ({
  logs,
  logsEndRef,
}) => {
  if (logs.length === 0) return null;

  return (
    <div className="compute-logs codin-scrollbar">
      {logs.slice(-30).map((log, i) => (
        <div key={i} className={`compute-log compute-log--${log.level}`}>
          <span className="compute-log__time">{formatTime(log.timestamp)}</span>
          <span>{log.message}</span>
        </div>
      ))}
      <div ref={logsEndRef} />
    </div>
  );
};
