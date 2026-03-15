import React from "react";

/** Small spinning indicator */
export const LoadingSpinner: React.FC<{ className?: string }> = ({
  className = "",
}) => (
  <span
    className={`border-codin-indigo-400 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent ${className}`}
    role="status"
    aria-label="Loading"
  />
);

/** Full panel loading state with spinner + message */
export const LoadingPanel: React.FC<{
  message?: string;
  className?: string;
}> = ({ message = "Loading...", className = "" }) => (
  <div
    className={`text-codin-fg-muted flex flex-col items-center justify-center gap-2 py-6 ${className}`}
  >
    <LoadingSpinner className="h-5 w-5" />
    <span className="text-xs">{message}</span>
  </div>
);

/** Animated skeleton placeholder line */
export const LoadingSkeleton: React.FC<{
  lines?: number;
  className?: string;
}> = ({ lines = 3, className = "" }) => (
  <div className={`space-y-2 ${className}`} role="status" aria-label="Loading">
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className="bg-codin-bg-surface h-3 animate-pulse rounded-md"
        style={{ width: `${85 - i * 12}%` }}
      />
    ))}
  </div>
);
