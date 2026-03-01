/**
 * LanguageHeader — Contextual language indicator bar
 * Shows a language flag + label above code blocks or multilingual content.
 * Uses .codin-lang-header from codin-theme.css.
 */

interface LanguageHeaderProps {
  /** Programming language or natural language code, e.g. "python", "hi", "ta" */
  language: string;
  /** Optional label override (otherwise auto-detected) */
  label?: string;
  /** Optional filename context */
  filename?: string;
}

const LANG_META: Record<string, { flag: string; label: string }> = {
  // Programming languages
  python: { flag: "🐍", label: "Python" },
  javascript: { flag: "JS", label: "JavaScript" },
  typescript: { flag: "TS", label: "TypeScript" },
  rust: { flag: "🦀", label: "Rust" },
  go: { flag: "Go", label: "Go" },
  java: { flag: "☕", label: "Java" },
  cpp: { flag: "C+", label: "C++" },
  c: { flag: "C", label: "C" },
  html: { flag: "◇", label: "HTML" },
  css: { flag: "◆", label: "CSS" },
  json: { flag: "{}", label: "JSON" },
  yaml: { flag: "⚙", label: "YAML" },
  markdown: { flag: "M↓", label: "Markdown" },
  shell: { flag: "$_", label: "Shell" },
  bash: { flag: "$_", label: "Bash" },
  sql: { flag: "⊞", label: "SQL" },
  // Indian languages
  hi: { flag: "🇮🇳", label: "हिन्दी" },
  ta: { flag: "🇮🇳", label: "தமிழ்" },
  bn: { flag: "🇮🇳", label: "বাংলা" },
  te: { flag: "🇮🇳", label: "తెలుగు" },
  kn: { flag: "🇮🇳", label: "ಕನ್ನಡ" },
  ml: { flag: "🇮🇳", label: "മലയാളം" },
  gu: { flag: "🇮🇳", label: "ગુજરાતી" },
  pa: { flag: "🇮🇳", label: "ਪੰਜਾਬੀ" },
  or: { flag: "🇮🇳", label: "ଓଡ଼ିଆ" },
  mr: { flag: "🇮🇳", label: "मराठी" },
  // Common international
  en: { flag: "🇬🇧", label: "English" },
  es: { flag: "🇪🇸", label: "Español" },
  fr: { flag: "🇫🇷", label: "Français" },
  de: { flag: "🇩🇪", label: "Deutsch" },
  zh: { flag: "🇨🇳", label: "中文" },
  ja: { flag: "🇯🇵", label: "日本語" },
  ko: { flag: "🇰🇷", label: "한국어" },
};

function getMeta(language: string): { flag: string; label: string } {
  const key = language.toLowerCase().trim();
  if (LANG_META[key]) return LANG_META[key];
  // Try partial match for aliases like "py" → "python"
  if (key === "py") return LANG_META.python;
  if (key === "js" || key === "jsx") return LANG_META.javascript;
  if (key === "ts" || key === "tsx") return LANG_META.typescript;
  if (key === "rb" || key === "ruby") return { flag: "💎", label: "Ruby" };
  if (key === "sh" || key === "zsh") return LANG_META.shell;
  if (key === "md") return LANG_META.markdown;
  if (key === "yml") return LANG_META.yaml;
  // Fallback
  return {
    flag: "📄",
    label: language.charAt(0).toUpperCase() + language.slice(1),
  };
}

export function LanguageHeader({
  language,
  label,
  filename,
}: LanguageHeaderProps) {
  const meta = getMeta(language);

  return (
    <div className="codin-lang-header codin-animate-in">
      <span className="codin-lang-header__flag">{meta.flag}</span>
      <span className="codin-lang-header__label">{label || meta.label}</span>
      {filename && (
        <span
          style={{
            opacity: 0.5,
            fontSize: "var(--codin-font-size-xs)",
            marginLeft: "auto",
          }}
        >
          {filename}
        </span>
      )}
    </div>
  );
}

export default LanguageHeader;
