/**
 * ExternalProviderSettings — Configure cloud API providers (GPT-4, Claude, Gemini)
 * Premium settings panel for managing API keys and model preferences.
 */

import { useCallback, useEffect, useState } from "react";
import { agentFetch } from "../util/agentConfig";
import "./ExternalProviderSettings.css";

interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  models: Array<{
    id: string;
    contextWindow: number;
    costInputPerMTok: number;
    costOutputPerMTok: number;
    latencyTier: string;
    qualityScore: number;
  }>;
  defaultModel: string;
}

interface TestResult {
  success: boolean;
  provider: string;
  model?: string;
  response?: string;
  latencyMs?: number;
  error?: string;
}

async function agentJson(path: string, options?: RequestInit) {
  const res = await agentFetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  return res.json();
}

const PROVIDER_META: Record<
  string,
  { icon: string; color: string; description: string }
> = {
  openai: {
    icon: "🟢",
    color: "#10a37f",
    description: "GPT-4o, GPT-4 Turbo, o1 — industry-leading accuracy",
  },
  anthropic: {
    icon: "🟣",
    color: "#b668e3",
    description:
      "Claude 4 Opus, Claude Sonnet — excellent for reasoning & code",
  },
  gemini: {
    icon: "🔵",
    color: "#4285f4",
    description: "Gemini 2.5 Pro, Flash — massive context windows (1M tokens)",
  },
};

export function ExternalProviderSettings() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await agentJson("/external-providers");
      setProviders(data.providers || []);
    } catch (err) {
      setError("Cannot connect to CodIn Agent. Is it running?");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConfigure = async (providerId: string) => {
    if (!apiKey.trim()) return;
    setIsConfiguring(true);
    setError(null);
    try {
      const result = await agentJson("/external-providers/configure", {
        method: "POST",
        body: JSON.stringify({ provider: providerId, apiKey }),
      });
      if (result.success) {
        setApiKey("");
        await refresh();
      } else {
        setError(result.error || "Configuration failed");
      }
    } catch (err) {
      setError("Failed to configure provider");
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleRemove = async (providerId: string) => {
    try {
      await agentJson("/external-providers/remove", {
        method: "POST",
        body: JSON.stringify({ provider: providerId }),
      });
      await refresh();
      setTestResult(null);
    } catch (err) {
      setError("Failed to remove provider");
    }
  };

  const handleTest = async (providerId: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await agentJson("/external-providers/test", {
        method: "POST",
        body: JSON.stringify({ provider: providerId }),
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        provider: providerId,
        error: "Connection failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="ext-provider-settings">
      <div className="ext-header">
        <h3 className="ext-title">☁️ Cloud API Providers</h3>
        <p className="ext-subtitle">
          Connect external AI providers for maximum accuracy. Your API keys are
          stored locally — never sent to CodIn servers.
        </p>
      </div>

      {error && (
        <div className="ext-error">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="provider-list">
        {providers.map((provider) => {
          const meta = PROVIDER_META[provider.id] || {
            icon: "🔧",
            color: "#888",
            description: "",
          };
          const isExpanded = expandedProvider === provider.id;

          return (
            <div
              key={provider.id}
              className={`provider-card ${provider.configured ? "configured" : ""} ${isExpanded ? "expanded" : ""}`}
            >
              <div
                className="provider-card-header"
                onClick={() =>
                  setExpandedProvider(isExpanded ? null : provider.id)
                }
              >
                <div className="provider-left">
                  <span className="provider-icon">{meta.icon}</span>
                  <div>
                    <span className="provider-name">{provider.name}</span>
                    <span className="provider-desc">{meta.description}</span>
                  </div>
                </div>
                <div className="provider-right">
                  {provider.configured ? (
                    <span className="status-badge configured">✓ Connected</span>
                  ) : (
                    <span className="status-badge unconfigured">
                      Not Connected
                    </span>
                  )}
                  <span className="expand-arrow">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="provider-details">
                  {!provider.configured ? (
                    <div className="configure-section">
                      <div className="api-input-row">
                        <input
                          type="password"
                          className="api-input"
                          placeholder={`Paste your ${provider.name} API key`}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                        />
                        <button
                          className="btn-configure"
                          disabled={!apiKey.trim() || isConfiguring}
                          onClick={() => handleConfigure(provider.id)}
                        >
                          {isConfiguring ? "⏳" : "🔗"} Connect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="connected-section">
                      <div className="connected-actions">
                        <button
                          className="btn-test"
                          disabled={isTesting}
                          onClick={() => handleTest(provider.id)}
                        >
                          {isTesting ? "⏳ Testing..." : "🧪 Test Connection"}
                        </button>
                        <button
                          className="btn-remove"
                          onClick={() => handleRemove(provider.id)}
                        >
                          🗑️ Remove
                        </button>
                      </div>

                      {testResult && testResult.provider === provider.id && (
                        <div
                          className={`test-result ${testResult.success ? "success" : "failure"}`}
                        >
                          {testResult.success ? (
                            <>
                              <span className="test-status">
                                ✅ Connection successful
                              </span>
                              <span className="test-detail">
                                Model: {testResult.model} · Latency:{" "}
                                {testResult.latencyMs}ms
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="test-status">
                                ❌ Connection failed
                              </span>
                              <span className="test-detail">
                                {testResult.error}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="models-table">
                    <h4 className="table-title">Available Models</h4>
                    <div className="model-rows">
                      {provider.models.map((model) => (
                        <div key={model.id} className="model-row">
                          <span className="model-id">{model.id}</span>
                          <span className="model-ctx">
                            {(model.contextWindow / 1000).toFixed(0)}K ctx
                          </span>
                          <span className="model-quality">
                            {model.qualityScore >= 0.95
                              ? "⭐⭐⭐"
                              : model.qualityScore >= 0.9
                                ? "⭐⭐"
                                : "⭐"}
                          </span>
                          <span className="model-speed">
                            {model.latencyTier}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
