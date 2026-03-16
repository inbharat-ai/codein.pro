import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  message?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  icon,
  title,
  message,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      {icon && (
        <div style={{ color: "var(--codin-fg-muted)", opacity: 0.7 }}>
          {icon}
        </div>
      )}
      <div>
        {title && (
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--codin-fg-primary)" }}
          >
            {title}
          </h3>
        )}
        {(message || description) && (
          <p
            className="mt-1 text-xs leading-relaxed"
            style={{ color: "var(--codin-fg-muted)" }}
          >
            {message ?? description}
          </p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="codin-btn codin-btn--primary mt-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
