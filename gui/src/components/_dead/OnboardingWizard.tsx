/**
 * OnboardingWizard — First-run setup for CodIn
 * Guides users through model selection, API key setup, and preferences.
 * Provides a premium, Cursor-level onboarding experience.
 */

import { useCallback, useState } from "react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to CodIn",
    description: "Your world-class AI coding assistant",
    icon: "🚀",
  },
  {
    id: "mode",
    title: "Choose Your Mode",
    description: "Local-first or cloud-powered?",
    icon: "⚡",
  },
  {
    id: "model",
    title: "Set Up Models",
    description: "Download local models or connect APIs",
    icon: "🤖",
  },
  {
    id: "language",
    title: "Language & Voice",
    description: "Configure multilingual preferences",
    icon: "🌐",
  },
  {
    id: "ready",
    title: "You're All Set!",
    description: "Start coding with AI assistance",
    icon: "✨",
  },
];

const LANGUAGES = [
  { code: "en", name: "English", native: "English", flag: "🇺🇸" },
  { code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "bn", name: "Bengali", native: "বাংলা", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", native: "தமிழ்", flag: "🇮🇳" },
  { code: "te", name: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
  { code: "mr", name: "Marathi", native: "मराठी", flag: "🇮🇳" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", flag: "🇮🇳" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { code: "as", name: "Assamese", native: "অসমীয়া", flag: "🇮🇳" },
];

interface Props {
  onComplete: (preferences: OnboardingPreferences) => void;
}

export interface OnboardingPreferences {
  mode: "local" | "cloud" | "hybrid";
  provider?: string;
  apiKey?: string;
  localModel?: string;
  language: string;
  voiceEnabled: boolean;
}

export function OnboardingWizard({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [preferences, setPreferences] = useState<OnboardingPreferences>({
    mode: "hybrid",
    language: "en",
    voiceEnabled: false,
  });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [providerChoice, setProviderChoice] = useState<string>("");

  const step = STEPS[currentStep];

  const next = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      // Persist preferences to localStorage so they survive reloads
      try {
        localStorage.setItem(
          "codin_onboarding_preferences",
          JSON.stringify(preferences),
        );
        localStorage.setItem("codin_onboarding_complete", "true");
      } catch {
        // localStorage may be unavailable in some contexts
      }
      onComplete(preferences);
    }
  }, [currentStep, onComplete, preferences]);

  const prev = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  const renderContent = () => {
    switch (step.id) {
      case "welcome":
        return (
          <div className="onboarding-welcome">
            <div className="welcome-logo">
              <span className="logo-gradient">CodIn</span>
            </div>
            <p className="welcome-tagline">
              AI-powered coding that works offline, speaks your language, and
              respects your privacy.
            </p>
            <div className="feature-highlights">
              {[
                {
                  icon: "🔒",
                  text: "Local-first: your code never leaves your machine",
                },
                { icon: "🌐", text: "18+ Indian languages supported" },
                {
                  icon: "⚡",
                  text: "Seamlessly connect GPT-4, Claude, or Gemini",
                },
                {
                  icon: "🧠",
                  text: "Multi-file reasoning & context awareness",
                },
              ].map((f, i) => (
                <div key={i} className="highlight-item">
                  <span className="highlight-icon">{f.icon}</span>
                  <span className="highlight-text">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case "mode":
        return (
          <div className="onboarding-mode">
            <div className="mode-grid">
              {(
                [
                  {
                    id: "local",
                    icon: "💻",
                    title: "Local Only",
                    desc: "Fully offline. Uses local models via llama.cpp. Best for privacy-sensitive work.",
                    badge: "Private",
                  },
                  {
                    id: "cloud",
                    icon: "☁️",
                    title: "Cloud APIs",
                    desc: "Connect GPT-4, Claude, or Gemini. Maximum accuracy and intelligence.",
                    badge: "Powerful",
                  },
                  {
                    id: "hybrid",
                    icon: "⚡",
                    title: "Hybrid (Recommended)",
                    desc: "Local models for fast tasks, cloud for complex reasoning. Best of both worlds.",
                    badge: "Recommended",
                  },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  className={`mode-card ${preferences.mode === mode.id ? "selected" : ""}`}
                  onClick={() =>
                    setPreferences((p) => ({ ...p, mode: mode.id }))
                  }
                >
                  <span className="mode-icon">{mode.icon}</span>
                  <span className="mode-title">{mode.title}</span>
                  <span className="mode-desc">{mode.desc}</span>
                  <span className="mode-badge">{mode.badge}</span>
                </button>
              ))}
            </div>
          </div>
        );

      case "model":
        return (
          <div className="onboarding-model">
            {(preferences.mode === "cloud" ||
              preferences.mode === "hybrid") && (
              <div className="cloud-setup">
                <h4 className="setup-subtitle">Connect a Cloud Provider</h4>
                <div className="provider-buttons">
                  {[
                    { id: "openai", name: "OpenAI (GPT-4)", icon: "🟢" },
                    { id: "anthropic", name: "Anthropic (Claude)", icon: "🟣" },
                    { id: "gemini", name: "Google (Gemini)", icon: "🔵" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      className={`provider-btn ${providerChoice === p.id ? "selected" : ""}`}
                      onClick={() => {
                        setProviderChoice(p.id);
                        setPreferences((prev) => ({ ...prev, provider: p.id }));
                      }}
                    >
                      <span>{p.icon}</span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
                {providerChoice && (
                  <div className="api-key-section">
                    <label className="input-label">API Key</label>
                    <input
                      type="password"
                      className="api-key-input"
                      placeholder={`Enter your ${providerChoice} API key`}
                      value={apiKeyInput}
                      onChange={(e) => {
                        setApiKeyInput(e.target.value);
                        setPreferences((prev) => ({
                          ...prev,
                          apiKey: e.target.value,
                        }));
                      }}
                    />
                    <p className="input-hint">
                      Your key is stored locally and never sent to CodIn
                      servers.
                    </p>
                  </div>
                )}
              </div>
            )}
            {(preferences.mode === "local" ||
              preferences.mode === "hybrid") && (
              <div className="local-setup">
                <h4 className="setup-subtitle">Local Models</h4>
                <p className="setup-hint">
                  Local models will be downloaded automatically when you first
                  use CodIn. Recommended: Qwen2.5 Coder 7B (~4GB).
                </p>
                <div className="model-options">
                  {[
                    {
                      id: "qwen2.5-coder-7b",
                      name: "Qwen2.5 Coder 7B",
                      size: "4.3 GB",
                      desc: "Best balance of speed & quality",
                    },
                    {
                      id: "qwen2.5-coder-1.5b",
                      name: "Qwen2.5 Coder 1.5B",
                      size: "1.6 GB",
                      desc: "Fast, lightweight",
                    },
                    {
                      id: "deepseek-r1-7b",
                      name: "DeepSeek R1 7B",
                      size: "4.5 GB",
                      desc: "Advanced reasoning",
                    },
                  ].map((m) => (
                    <button
                      key={m.id}
                      className={`model-option ${preferences.localModel === m.id ? "selected" : ""}`}
                      onClick={() =>
                        setPreferences((p) => ({ ...p, localModel: m.id }))
                      }
                    >
                      <span className="model-name">{m.name}</span>
                      <span className="model-size">{m.size}</span>
                      <span className="model-desc">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "language":
        return (
          <div className="onboarding-language">
            <div className="language-grid-onboard">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  className={`lang-option ${preferences.language === lang.code ? "selected" : ""}`}
                  onClick={() =>
                    setPreferences((p) => ({ ...p, language: lang.code }))
                  }
                >
                  <span className="lang-flag">{lang.flag}</span>
                  <span className="lang-native">{lang.native}</span>
                  <span className="lang-name">{lang.name}</span>
                </button>
              ))}
            </div>
            <div className="voice-toggle">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={preferences.voiceEnabled}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      voiceEnabled: e.target.checked,
                    }))
                  }
                />
                <span className="toggle-text">
                  🎤 Enable voice input/output
                </span>
              </label>
            </div>
          </div>
        );

      case "ready":
        return (
          <div className="onboarding-ready">
            <div className="ready-icon">🎉</div>
            <h3 className="ready-title">CodIn is ready!</h3>
            <div className="summary-card">
              <div className="summary-row">
                <span>Mode:</span>
                <strong>
                  {preferences.mode === "hybrid"
                    ? "⚡ Hybrid"
                    : preferences.mode === "local"
                      ? "💻 Local"
                      : "☁️ Cloud"}
                </strong>
              </div>
              {preferences.provider && (
                <div className="summary-row">
                  <span>Cloud Provider:</span>
                  <strong>{preferences.provider}</strong>
                </div>
              )}
              {preferences.localModel && (
                <div className="summary-row">
                  <span>Local Model:</span>
                  <strong>{preferences.localModel}</strong>
                </div>
              )}
              <div className="summary-row">
                <span>Language:</span>
                <strong>
                  {LANGUAGES.find((l) => l.code === preferences.language)
                    ?.native || "English"}
                </strong>
              </div>
              <div className="summary-row">
                <span>Voice:</span>
                <strong>
                  {preferences.voiceEnabled ? "Enabled 🎤" : "Disabled"}
                </strong>
              </div>
            </div>
            <p className="ready-hint">
              You can change these settings anytime in the configuration panel.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-wizard">
        {/* Progress bar */}
        <div className="progress-track">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`progress-step ${i <= currentStep ? "active" : ""} ${i === currentStep ? "current" : ""}`}
            >
              <span className="step-dot" />
              <span className="step-label">{s.title}</span>
            </div>
          ))}
          <div
            className="progress-fill-bar"
            style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="wizard-header">
          <span className="wizard-icon">{step.icon}</span>
          <div>
            <h2 className="wizard-title">{step.title}</h2>
            <p className="wizard-desc">{step.description}</p>
          </div>
        </div>

        {/* Content */}
        <div className="wizard-content">{renderContent()}</div>

        {/* Navigation */}
        <div className="wizard-nav">
          {currentStep > 0 && (
            <button className="nav-btn secondary" onClick={prev}>
              ← Back
            </button>
          )}
          <div className="nav-spacer" />
          <button className="nav-btn primary" onClick={next}>
            {currentStep === STEPS.length - 1 ? "Get Started →" : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
