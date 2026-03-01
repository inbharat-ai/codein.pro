/**
 * ModelBadge — Shows which model generated the current response
 *
 * Visual identity per provider:
 *   Local (indigo) | OpenAI (green) | Anthropic (amber) | Gemini (blue)
 * Uses CSS classes from codin-theme.css for consistent styling.
 */

interface ModelBadgeProps {
  model: string;
  escalated?: boolean;
  provider?: string;
  latencyMs?: number;
  compact?: boolean;
}

const PROVIDER_META: Record<
  string,
  { label: string; css: string; icon: string }
> = {
  local: { label: "Local", css: "codin-model-badge--local", icon: "🖥" },
  openai: { label: "OpenAI", css: "codin-model-badge--openai", icon: "◈" },
  anthropic: {
    label: "Anthropic",
    css: "codin-model-badge--anthropic",
    icon: "◆",
  },
  gemini: { label: "Google", css: "codin-model-badge--gemini", icon: "◇" },
};

function getProviderFromModel(model: string): string {
  if (/openai\/|gpt-|o1-|o3-/.test(model)) return "openai";
  if (/anthropic\/|claude/.test(model)) return "anthropic";
  if (/gemini/.test(model)) return "gemini";
  return "local";
}

function getShortModelName(model: string): string {
  const short = model.replace(/^(openai|anthropic|gemini)\//, "");
  return short.length > 22 ? short.slice(0, 20) + "…" : short;
}

export function ModelBadge({
  model,
  escalated,
  provider,
  latencyMs,
  compact,
}: ModelBadgeProps) {
  const detected = provider || getProviderFromModel(model);
  const meta = PROVIDER_META[detected] || PROVIDER_META.local;
  const shortName = getShortModelName(model);

  return (
    <div
      className={`codin-model-badge ${meta.css} codin-animate-in`}
      title={`Model: ${model}${latencyMs ? ` · ${latencyMs}ms` : ""}${escalated ? " · Escalated" : ""}`}
    >
      {escalated && <span className="codin-model-badge__escalated">⚡</span>}
      <span style={{ fontSize: "11px", opacity: 0.7 }}>{meta.icon}</span>
      <span style={{ fontWeight: 600 }}>{meta.label}</span>
      {!compact && (
        <span style={{ opacity: 0.7, fontWeight: 400 }}>{shortName}</span>
      )}
      {latencyMs != null && !compact && (
        <span style={{ fontSize: "10px", opacity: 0.45, marginLeft: "2px" }}>
          {latencyMs}ms
        </span>
      )}
    </div>
  );
}

export default ModelBadge;
