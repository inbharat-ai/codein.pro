/**
 * ConfidenceBadge — Displays verification confidence level
 * Uses CSS classes from codin-theme.css:
 *   .codin-confidence-badge--high (green)
 *   .codin-confidence-badge--medium (saffron)
 *   .codin-confidence-badge--low (red)
 */

interface ConfidenceBadgeProps {
  score: number; // 0–1
  level: "high" | "medium" | "low";
  checks?: Array<{ name: string; passed: boolean; icon: string }>;
  compact?: boolean;
  onClick?: () => void;
}

const LEVEL_ICONS: Record<string, string> = {
  high: "●",
  medium: "●",
  low: "●",
};

export function ConfidenceBadge({
  score,
  level,
  checks,
  compact,
  onClick,
}: ConfidenceBadgeProps) {
  const percentage = Math.round(score * 100);
  const icon = LEVEL_ICONS[level] || LEVEL_ICONS.medium;

  return (
    <div
      className={`codin-confidence-badge codin-confidence-badge--${level} codin-animate-in`}
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
      }}
      title={`Confidence: ${percentage}% (${level})\n${checks?.map((c) => `${c.icon} ${c.name}`).join("\n") || ""}`}
    >
      <span>{icon}</span>
      <span style={{ fontWeight: 600 }}>{percentage}%</span>
      {!compact && checks && checks.length > 0 && (
        <span style={{ fontSize: "10px", opacity: 0.7, marginLeft: "2px" }}>
          {checks.filter((c) => c.passed).length}/{checks.length} checks
        </span>
      )}
    </div>
  );
}

export default ConfidenceBadge;
