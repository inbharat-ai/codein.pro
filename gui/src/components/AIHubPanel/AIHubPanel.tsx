import { memo, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { EmptyState } from "../ui/EmptyState";
import { LoadingPanel } from "../ui/LoadingState";
import {
  clearAIHubError,
  disableProvider,
  enableProvider,
  fetchProviderModels,
  fetchProviders,
  removeProviderKey,
  selectAIHubError,
  selectAIHubLoading,
  selectAIHubModels,
  selectConfiguredProviderCount,
  selectEnablingProvider,
  selectFetchingModels,
  selectHealthyProviderCount,
  selectProviders,
  selectRemovingKey,
  selectSavingKey,
  selectTestingProvider,
  selectTotalModelCount,
  setProviderKey,
  testProvider,
  type ProviderModel,
  type ProviderStatus,
} from "../../redux/slices/aiHubSlice";

// ─── Status Dot ──────────────────────────────────────────────

const StatusDot = memo(function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-green-500",
    untested: "bg-yellow-500",
    error: "bg-red-500",
    unknown: "bg-[var(--codin-fg-muted)]",
  };
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] || "bg-[var(--codin-fg-muted)]"}`}
      title={status}
    />
  );
});

// ─── Capability Badge ────────────────────────────────────────

const CapabilityBadge = memo(function CapabilityBadge({
  label,
}: {
  label: string;
}) {
  const capColors: Record<string, string> = {
    chat: "bg-blue-900/50 text-blue-300",
    completion: "bg-cyan-900/50 text-cyan-300",
    embedding: "bg-purple-900/50 text-purple-300",
    image: "bg-pink-900/50 text-pink-300",
    vision: "bg-emerald-900/50 text-emerald-300",
    "function-calling": "bg-orange-900/50 text-orange-300",
    streaming: "bg-teal-900/50 text-teal-300",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] ${capColors[label.toLowerCase()] || "bg-[var(--codin-bg-tertiary)] text-[var(--codin-fg-muted)]"}`}
    >
      {label}
    </span>
  );
});

// ─── Spinner ─────────────────────────────────────────────────

function Spinner({ size = "h-4 w-4" }: { size?: string }) {
  return (
    <svg
      className={`${size} animate-spin text-blue-400`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ─── Model List ──────────────────────────────────────────────

const ModelList = memo(function ModelList({
  models,
}: {
  models: ProviderModel[];
}) {
  if (models.length === 0) {
    return (
      <p className="text-codin-fg-muted py-2 text-center text-[10px]">
        Click "Fetch Models" to load available models
      </p>
    );
  }

  return (
    <div className="scrollbar-thin max-h-48 space-y-1 overflow-y-auto pr-1">
      {models.map((model) => (
        <div
          key={model.id}
          className="bg-codin-bg flex items-center gap-2 rounded px-2 py-1.5 text-[10px]"
        >
          <div className="min-w-0 flex-1">
            <div className="text-codin-fg truncate text-xs font-medium">
              {model.name}
            </div>
            <div className="text-codin-fg-muted flex items-center gap-2">
              <span className="font-mono">{model.id}</span>
              {model.contextWindow && (
                <span>
                  {model.contextWindow >= 1000
                    ? `${(model.contextWindow / 1000).toFixed(0)}K ctx`
                    : `${model.contextWindow} ctx`}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1">
            {model.capabilities.map((cap) => (
              <CapabilityBadge key={cap} label={cap} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

// ─── Provider Card ───────────────────────────────────────────

function ProviderCard({ provider }: { provider: ProviderStatus }) {
  const dispatch = useAppDispatch();
  const testingProvider = useAppSelector(selectTestingProvider);
  const fetchingModels = useAppSelector(selectFetchingModels);
  const savingKey = useAppSelector(selectSavingKey);
  const removingKey = useAppSelector(selectRemovingKey);
  const enablingProvider = useAppSelector(selectEnablingProvider);
  const allModels = useAppSelector(selectAIHubModels);
  const models = allModels[provider.id] ?? [];

  const [expanded, setExpanded] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isTesting = testingProvider === provider.id;
  const isFetchingModels = fetchingModels === provider.id;
  const isSavingKey = savingKey === provider.id;
  const isRemovingKey = removingKey === provider.id;
  const isTogglingEnabled = enablingProvider === provider.id;

  const handleSaveKey = () => {
    if (!keyInput.trim()) return;
    dispatch(setProviderKey({ providerId: provider.id, key: keyInput.trim() }));
    setKeyInput("");
    setShowKeyInput(false);
  };

  const handleRemoveKey = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    dispatch(removeProviderKey(provider.id));
    setConfirmRemove(false);
  };

  const handleToggleEnabled = () => {
    if (provider.enabled) {
      dispatch(disableProvider(provider.id));
    } else {
      dispatch(enableProvider(provider.id));
    }
  };

  return (
    <div className="border-codin-border bg-codin-bg-surface overflow-hidden rounded-lg border">
      {/* Card Header */}
      <div className="flex items-center gap-3 p-3">
        <StatusDot
          status={provider.enabled ? provider.health.status : "unknown"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-codin-fg text-sm font-semibold">
              {provider.displayName}
            </h4>
            {!provider.enabled && (
              <span className="rounded bg-[var(--codin-bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--codin-fg-muted)]">
                disabled
              </span>
            )}
          </div>
          <p className="text-codin-fg-muted text-[10px]">
            {provider.description}
          </p>
        </div>

        {/* Enable/Disable Toggle */}
        <button
          onClick={handleToggleEnabled}
          disabled={isTogglingEnabled}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            provider.enabled ? "bg-blue-600" : "bg-[var(--codin-bg-surface)]"
          } ${isTogglingEnabled ? "opacity-50" : ""}`}
          title={provider.enabled ? "Disable provider" : "Enable provider"}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              provider.enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* Key & Actions Row */}
      <div className="border-codin-border border-t px-3 py-2">
        <div className="flex items-center gap-2 text-[10px]">
          {/* Key Status */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="text-codin-fg-muted">API Key:</span>
            {provider.hasKey ? (
              <span className="font-mono text-green-400">
                {provider.keyHint ? `****${provider.keyHint}` : "configured"}
              </span>
            ) : (
              <span className="text-codin-fg-muted">No key</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="rounded bg-[var(--codin-bg-surface)] px-2 py-0.5 text-[10px] text-[var(--codin-fg-secondary)] hover:bg-[var(--codin-bg-hover)]"
            >
              {provider.hasKey ? "Update Key" : "Add Key"}
            </button>
            {provider.hasKey && (
              <button
                onClick={handleRemoveKey}
                disabled={isRemovingKey}
                className={`rounded px-2 py-0.5 text-[10px] ${
                  confirmRemove
                    ? "bg-red-700 text-white"
                    : "bg-[var(--codin-bg-surface)] text-[var(--codin-fg-secondary)] hover:bg-[var(--codin-bg-hover)]"
                }`}
              >
                {isRemovingKey ? "..." : confirmRemove ? "Confirm" : "Remove"}
              </button>
            )}
            <button
              onClick={() => dispatch(testProvider(provider.id))}
              disabled={isTesting || !provider.hasKey}
              className="rounded bg-blue-800 px-2 py-0.5 text-[10px] text-blue-200 hover:bg-blue-700 disabled:opacity-40"
            >
              {isTesting ? <Spinner size="h-3 w-3" /> : "Test"}
            </button>
            <button
              onClick={() => {
                setExpanded(!expanded);
                if (!expanded && models.length === 0) {
                  dispatch(fetchProviderModels(provider.id));
                }
              }}
              className="rounded bg-[var(--codin-bg-surface)] px-2 py-0.5 text-[10px] text-[var(--codin-fg-secondary)] hover:bg-[var(--codin-bg-hover)]"
            >
              {expanded ? "Hide Models" : "Models"}
            </button>
          </div>
        </div>

        {/* Health Result Inline */}
        {provider.health.lastCheck && (
          <div className="mt-1 text-[10px]">
            {provider.health.status === "healthy" ? (
              <span className="text-green-400">
                Healthy - {provider.health.latencyMs}ms latency
              </span>
            ) : provider.health.status === "error" ? (
              <span className="text-red-400">
                Error: {provider.health.error || "Connection failed"}
              </span>
            ) : null}
          </div>
        )}

        {/* Key Input Field */}
        {showKeyInput && (
          <div className="mt-2 flex gap-1">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                placeholder={`Enter ${provider.displayName} API key...`}
                className="bg-codin-bg border-codin-border w-full rounded border px-2 py-1 pr-12 text-xs"
                autoFocus
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-codin-fg-muted hover:text-codin-fg-secondary absolute right-1 top-1/2 -translate-y-1/2 px-1 text-[10px]"
              >
                {showKey ? "hide" : "show"}
              </button>
            </div>
            <button
              onClick={handleSaveKey}
              disabled={!keyInput.trim() || isSavingKey}
              className="rounded bg-green-800 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isSavingKey ? "..." : "Save"}
            </button>
            <button
              onClick={() => {
                setShowKeyInput(false);
                setKeyInput("");
                setConfirmRemove(false);
              }}
              className="rounded bg-[var(--codin-bg-surface)] px-2 py-1 text-xs text-[var(--codin-fg-secondary)] hover:bg-[var(--codin-bg-hover)]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Capabilities */}
      {provider.capabilities.length > 0 && (
        <div className="border-codin-border flex flex-wrap gap-1 border-t px-3 py-1.5">
          {provider.capabilities.map((cap) => (
            <CapabilityBadge key={cap} label={cap} />
          ))}
        </div>
      )}

      {/* Expanded Model Browser */}
      {expanded && (
        <div className="border-codin-border border-t px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <h5 className="text-codin-fg-secondary text-[10px] font-semibold">
              Models ({models.length})
            </h5>
            <button
              onClick={() => dispatch(fetchProviderModels(provider.id))}
              disabled={isFetchingModels}
              className="text-[10px] text-blue-400 hover:underline disabled:opacity-50"
            >
              {isFetchingModels ? (
                <span className="flex items-center gap-1">
                  <Spinner size="h-3 w-3" /> Fetching...
                </span>
              ) : (
                "Fetch Models"
              )}
            </button>
          </div>
          <ModelList models={models} />
        </div>
      )}
    </div>
  );
}

// ─── Health Dashboard ────────────────────────────────────────

function HealthDashboard() {
  const providers = useAppSelector(selectProviders);
  const configured = useAppSelector(selectConfiguredProviderCount);
  const healthy = useAppSelector(selectHealthyProviderCount);
  const totalModels = useAppSelector(selectTotalModelCount);

  return (
    <div className="grid grid-cols-4 gap-3">
      <DashboardCard
        label="Providers"
        value={String(providers.length)}
        sub="total"
        color="text-codin-fg"
      />
      <DashboardCard
        label="Configured"
        value={String(configured)}
        sub="with keys"
        color="text-blue-400"
      />
      <DashboardCard
        label="Healthy"
        value={String(healthy)}
        sub="connected"
        color="text-green-400"
      />
      <DashboardCard
        label="Models"
        value={String(totalModels)}
        sub="discovered"
        color="text-purple-400"
      />
    </div>
  );
}

const DashboardCard = memo(function DashboardCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-codin-bg-surface border-codin-border rounded-lg border p-3 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-codin-fg-secondary text-[10px] font-medium">
        {label}
      </div>
      <div className="text-codin-fg-muted text-[9px]">{sub}</div>
    </div>
  );
});

// ─── Main Panel ──────────────────────────────────────────────

export function AIHubPanel() {
  const dispatch = useAppDispatch();
  const providers = useAppSelector(selectProviders);
  const loading = useAppSelector(selectAIHubLoading);
  const error = useAppSelector(selectAIHubError);

  useEffect(() => {
    dispatch(fetchProviders());
  }, [dispatch]);

  return (
    <div className="bg-codin-bg flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-codin-border flex items-center justify-between border-b p-3">
        <div>
          <h2 className="text-codin-fg text-sm font-semibold">AI API Hub</h2>
          <p className="text-codin-fg-muted text-[10px]">
            Manage provider keys, test connections, and browse models
          </p>
        </div>
        <button
          onClick={() => dispatch(fetchProviders())}
          disabled={loading}
          className="flex items-center gap-1 rounded bg-[var(--codin-bg-surface)] px-2.5 py-1 text-xs text-[var(--codin-fg-secondary)] hover:bg-[var(--codin-bg-hover)] disabled:opacity-50"
        >
          {loading ? <Spinner size="h-3 w-3" /> : null}
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* Error Banner */}
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
            <span>{error}</span>
            <button
              onClick={() => dispatch(clearAIHubError())}
              className="ml-2 underline hover:no-underline"
            >
              dismiss
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && providers.length === 0 && (
          <LoadingPanel message="Loading providers..." className="py-12" />
        )}

        {/* Empty State */}
        {!loading && providers.length === 0 && !error && (
          <EmptyState
            icon={
              <svg
                className="h-10 w-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            }
            title="No Providers Available"
            message="Make sure the agent server is running on port 43120."
            action={{
              label: "Refresh",
              onClick: () => dispatch(fetchProviders()),
            }}
          />
        )}

        {/* Dashboard + Providers */}
        {providers.length > 0 && (
          <>
            <HealthDashboard />
            <div className="space-y-3">
              <h3 className="text-codin-fg-secondary text-xs font-semibold">
                Providers ({providers.length})
              </h3>
              {providers.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
