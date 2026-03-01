/**
 * ErrorClarity — User-friendly error panel replacing cryptic model failures
 * Uses CSS classes from codin-theme.css:
 *   .codin-error-panel--warning (escalation) / --error (failures)
 *   .codin-btn--primary (retry button)
 */

interface ErrorClarityProps {
  type:
    | "verification-failed"
    | "model-timeout"
    | "budget-exceeded"
    | "escalation"
    | "generic";
  originalError?: string;
  modelUsed?: string;
  escalatingTo?: string;
  suggestion?: string;
  retryable?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const ERROR_MESSAGES: Record<
  string,
  { icon: string; title: string; description: string }
> = {
  "verification-failed": {
    icon: "🔍",
    title: "Response Verification Failed",
    description:
      "The generated code didn't pass our quality checks. We're escalating to a more capable model for better accuracy.",
  },
  "model-timeout": {
    icon: "⏱",
    title: "Model Response Timeout",
    description:
      "The model took too long to respond. This may be due to high demand or a complex query.",
  },
  "budget-exceeded": {
    icon: "💰",
    title: "Premium Budget Limit Reached",
    description:
      "You've reached your API spending limit. Local models will continue to handle requests.",
  },
  escalation: {
    icon: "⚡",
    title: "Escalating to Premium Model",
    description:
      "Local model confidence was below threshold. Routing to a premium provider for higher accuracy.",
  },
  generic: {
    icon: "⚠",
    title: "Something Went Wrong",
    description: "An unexpected error occurred while processing your request.",
  },
};

export function ErrorClarity({
  type,
  originalError,
  modelUsed,
  escalatingTo,
  suggestion,
  retryable,
  onRetry,
  onDismiss,
}: ErrorClarityProps) {
  const msg = ERROR_MESSAGES[type] || ERROR_MESSAGES.generic;
  const isEscalation = type === "escalation" || type === "verification-failed";
  const panelClass = isEscalation
    ? "codin-error-panel--warning"
    : "codin-error-panel--error";

  return (
    <div className={`codin-error-panel ${panelClass} codin-animate-slide-up`}>
      {/* Header */}
      <div className="codin-error-panel__header">
        <span style={{ fontSize: "16px" }}>{msg.icon}</span>
        <span>{msg.title}</span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="codin-btn codin-btn--ghost codin-focus-ring"
            style={{
              marginLeft: "auto",
              padding: "2px 6px",
              fontSize: "14px",
              opacity: 0.5,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Description */}
      <div style={{ opacity: 0.85, marginBottom: "8px" }}>
        {msg.description}
      </div>

      {/* Details */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          fontSize: "var(--codin-font-size-sm)",
          opacity: 0.7,
        }}
      >
        {modelUsed && <span>Model: {modelUsed}</span>}
        {escalatingTo && (
          <span style={{ color: "var(--codin-indigo-400)" }}>
            → Escalating to: {escalatingTo}
          </span>
        )}
        {originalError && (
          <details style={{ marginTop: "4px" }}>
            <summary style={{ cursor: "pointer" }}>Technical details</summary>
            <pre
              style={{
                fontSize: "var(--codin-font-size-xs)",
                padding: "8px",
                marginTop: "4px",
                borderRadius: "var(--codin-radius-sm)",
                backgroundColor: "rgba(0,0,0,0.15)",
                overflow: "auto",
                maxHeight: "120px",
                fontFamily: "var(--codin-font-mono)",
              }}
            >
              {originalError}
            </pre>
          </details>
        )}
      </div>

      {/* Actions */}
      {(suggestion || retryable) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "10px",
          }}
        >
          {suggestion && (
            <span
              style={{ fontSize: "var(--codin-font-size-sm)", opacity: 0.8 }}
            >
              💡 {suggestion}
            </span>
          )}
          {retryable && onRetry && (
            <button
              onClick={onRetry}
              className="codin-btn codin-btn--primary codin-focus-ring"
              style={{ marginLeft: "auto" }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ErrorClarity;
