import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import { RootState } from "../store";
import { getAgentBaseUrl } from "../../util/agentConfig";
import { ensureAuth } from "../../util/authService";

// ─── Hub Fetch Helper ────────────────────────────────────────

async function hubFetch(path: string, opts?: RequestInit) {
  const base = getAgentBaseUrl();

  let token: string | null = null;
  try {
    token = await ensureAuth();
  } catch {
    // Proceed without token
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${base}/ai-hub${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// ─── Types ───────────────────────────────────────────────────

export interface ProviderHealth {
  status: "unknown" | "healthy" | "error" | "untested";
  lastCheck: number | null;
  latencyMs: number | null;
  error: string | null;
}

export interface ProviderModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number | null;
  capabilities: string[];
}

export interface ProviderStatus {
  id: string;
  displayName: string;
  description: string;
  hasKey: boolean;
  keyHint: string | null;
  enabled: boolean;
  health: ProviderHealth;
  capabilities: string[];
  modelCount: number;
}

interface AIHubState {
  providers: ProviderStatus[];
  models: Record<string, ProviderModel[]>; // providerId -> models
  loading: boolean;
  testingProvider: string | null;
  fetchingModels: string | null;
  savingKey: string | null;
  removingKey: string | null;
  enablingProvider: string | null;
  error: string | null;
}

const initialState: AIHubState = {
  providers: [],
  models: {},
  loading: false,
  testingProvider: null,
  fetchingModels: null,
  savingKey: null,
  removingKey: null,
  enablingProvider: null,
  error: null,
};

// ─── Async Thunks ────────────────────────────────────────────

export const fetchProviders = createAsyncThunk<{ providers: ProviderStatus[] }>(
  "aiHub/fetchProviders",
  async () => hubFetch("/providers"),
);

export const setProviderKey = createAsyncThunk<
  { success: boolean; keyHint: string },
  { providerId: string; key: string }
>("aiHub/setProviderKey", async ({ providerId, key }) =>
  hubFetch(`/providers/${providerId}/key`, {
    method: "POST",
    body: JSON.stringify({ key }),
  }),
);

export const removeProviderKey = createAsyncThunk<{ success: boolean }, string>(
  "aiHub/removeProviderKey",
  async (providerId) =>
    hubFetch(`/providers/${providerId}/key`, { method: "DELETE" }),
);

export const testProvider = createAsyncThunk<
  { status: string; latencyMs: number; error: string | null },
  string
>("aiHub/testProvider", async (providerId) =>
  hubFetch(`/providers/${providerId}/test`, { method: "POST" }),
);

export const fetchProviderModels = createAsyncThunk<
  { providerId: string; models: ProviderModel[] },
  string
>("aiHub/fetchProviderModels", async (providerId) => {
  const result = await hubFetch(`/providers/${providerId}/models`);
  return { providerId, models: result.models || result };
});

export const enableProvider = createAsyncThunk<{ success: boolean }, string>(
  "aiHub/enableProvider",
  async (providerId) =>
    hubFetch(`/providers/${providerId}/enable`, { method: "POST" }),
);

export const disableProvider = createAsyncThunk<{ success: boolean }, string>(
  "aiHub/disableProvider",
  async (providerId) =>
    hubFetch(`/providers/${providerId}/disable`, { method: "POST" }),
);

// ─── Slice ───────────────────────────────────────────────────

export const aiHubSlice = createSlice({
  name: "aiHub",
  initialState,
  reducers: {
    clearAIHubError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // fetchProviders
    builder.addCase(fetchProviders.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchProviders.fulfilled, (state, { payload }) => {
      state.loading = false;
      state.providers = payload.providers;
    });
    builder.addCase(fetchProviders.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || "Failed to fetch providers";
    });

    // setProviderKey
    builder.addCase(setProviderKey.pending, (state, { meta }) => {
      state.savingKey = meta.arg.providerId;
      state.error = null;
    });
    builder.addCase(setProviderKey.fulfilled, (state, { meta, payload }) => {
      state.savingKey = null;
      const provider = state.providers.find(
        (p) => p.id === meta.arg.providerId,
      );
      if (provider) {
        provider.hasKey = true;
        provider.keyHint = payload.keyHint || null;
      }
    });
    builder.addCase(setProviderKey.rejected, (state, action) => {
      state.savingKey = null;
      state.error = action.error.message || "Failed to save key";
    });

    // removeProviderKey
    builder.addCase(removeProviderKey.pending, (state, { meta }) => {
      state.removingKey = meta.arg;
      state.error = null;
    });
    builder.addCase(removeProviderKey.fulfilled, (state, { meta }) => {
      state.removingKey = null;
      const provider = state.providers.find((p) => p.id === meta.arg);
      if (provider) {
        provider.hasKey = false;
        provider.keyHint = null;
        provider.health = {
          status: "untested",
          lastCheck: null,
          latencyMs: null,
          error: null,
        };
      }
    });
    builder.addCase(removeProviderKey.rejected, (state, action) => {
      state.removingKey = null;
      state.error = action.error.message || "Failed to remove key";
    });

    // testProvider
    builder.addCase(testProvider.pending, (state, { meta }) => {
      state.testingProvider = meta.arg;
      state.error = null;
    });
    builder.addCase(testProvider.fulfilled, (state, { meta, payload }) => {
      state.testingProvider = null;
      const provider = state.providers.find((p) => p.id === meta.arg);
      if (provider) {
        provider.health = {
          status: payload.status as ProviderHealth["status"],
          lastCheck: Date.now(),
          latencyMs: payload.latencyMs,
          error: payload.error,
        };
      }
    });
    builder.addCase(testProvider.rejected, (state, { meta, error }) => {
      state.testingProvider = null;
      const provider = state.providers.find((p) => p.id === meta.arg);
      if (provider) {
        provider.health = {
          status: "error",
          lastCheck: Date.now(),
          latencyMs: null,
          error: error.message || "Test failed",
        };
      }
    });

    // fetchProviderModels
    builder.addCase(fetchProviderModels.pending, (state, { meta }) => {
      state.fetchingModels = meta.arg;
    });
    builder.addCase(fetchProviderModels.fulfilled, (state, { payload }) => {
      state.fetchingModels = null;
      state.models[payload.providerId] = payload.models;
      const provider = state.providers.find((p) => p.id === payload.providerId);
      if (provider) {
        provider.modelCount = payload.models.length;
      }
    });
    builder.addCase(fetchProviderModels.rejected, (state, action) => {
      state.fetchingModels = null;
      state.error = action.error.message || "Failed to fetch models";
    });

    // enableProvider
    builder.addCase(enableProvider.pending, (state, { meta }) => {
      state.enablingProvider = meta.arg;
    });
    builder.addCase(enableProvider.fulfilled, (state, { meta }) => {
      state.enablingProvider = null;
      const provider = state.providers.find((p) => p.id === meta.arg);
      if (provider) provider.enabled = true;
    });
    builder.addCase(enableProvider.rejected, (state, action) => {
      state.enablingProvider = null;
      state.error = action.error.message || "Failed to enable provider";
    });

    // disableProvider
    builder.addCase(disableProvider.pending, (state, { meta }) => {
      state.enablingProvider = meta.arg;
    });
    builder.addCase(disableProvider.fulfilled, (state, { meta }) => {
      state.enablingProvider = null;
      const provider = state.providers.find((p) => p.id === meta.arg);
      if (provider) provider.enabled = false;
    });
    builder.addCase(disableProvider.rejected, (state, action) => {
      state.enablingProvider = null;
      state.error = action.error.message || "Failed to disable provider";
    });
  },
});

export const { clearAIHubError } = aiHubSlice.actions;

// ─── Selectors ───────────────────────────────────────────────

export const selectProviders = (state: RootState) =>
  state.aiHub?.providers ?? [];
export const selectAIHubModels = (state: RootState) =>
  state.aiHub?.models ?? {};
export const selectAIHubLoading = (state: RootState) =>
  state.aiHub?.loading ?? false;
export const selectTestingProvider = (state: RootState) =>
  state.aiHub?.testingProvider ?? null;
export const selectFetchingModels = (state: RootState) =>
  state.aiHub?.fetchingModels ?? null;
export const selectSavingKey = (state: RootState) =>
  state.aiHub?.savingKey ?? null;
export const selectRemovingKey = (state: RootState) =>
  state.aiHub?.removingKey ?? null;
export const selectEnablingProvider = (state: RootState) =>
  state.aiHub?.enablingProvider ?? null;
export const selectAIHubError = (state: RootState) =>
  state.aiHub?.error ?? null;

export const selectProviderModels = createSelector(
  [selectAIHubModels, (_state: RootState, providerId: string) => providerId],
  (models, providerId) => models[providerId] ?? [],
);

export const selectHealthyProviderCount = createSelector(
  [selectProviders],
  (providers) => providers.filter((p) => p.health.status === "healthy").length,
);

export const selectConfiguredProviderCount = createSelector(
  [selectProviders],
  (providers) => providers.filter((p) => p.hasKey).length,
);

export const selectTotalModelCount = createSelector(
  [selectAIHubModels],
  (models) => Object.values(models).reduce((sum, arr) => sum + arr.length, 0),
);

export default aiHubSlice.reducer;
