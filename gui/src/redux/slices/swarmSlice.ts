import {
  PayloadAction,
  createAsyncThunk,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import { RootState } from "../store";

// ─── Types ───────────────────────────────────────────────────

export interface SwarmConfig {
  topology: string;
  strategy: string;
  maxAgents: number;
  concurrency: number;
}

export interface AgentDescriptor {
  id: string;
  type: string;
  status: string;
  modelHint: string | null;
  metrics: {
    tasksCompleted: number;
    toolCalls: number;
    totalTimeMs: number;
    totalCostUSD: number;
  };
}

export interface TaskNodeStatus {
  id: string;
  goal: string;
  status: string;
  agentType: string;
  retryCount: number;
}

export interface TaskStatus {
  id: string;
  goal: string;
  status: string;
  topology: string;
  nodes: TaskNodeStatus[];
  metadata: {
    nodesCompleted: number;
    nodesFailed: number;
    totalCostUSD: number;
  };
}

export interface PermissionRequest {
  id: string;
  nodeId: string;
  agentId: string;
  permissionType: string;
  action: string;
  costEstimate: number;
  createdAt: string;
}

export interface SwarmEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface MemoryUsage {
  shortTerm: { entries: number };
  working: {
    entries: number;
    decisions: number;
    budget: { spent: number; cap: number };
    language: string;
  };
  longTerm: { entries: number; enabled: boolean };
}

export interface GpuStatus {
  budget: number;
  spent: number;
  remaining: number;
  sessionExpired: boolean;
  idleExpired: boolean;
}

export interface SwarmStatus {
  state: string;
  config: SwarmConfig | null;
  agents: AgentDescriptor[];
  activeTasks: number;
  tasks: string[];
  memory: MemoryUsage | null;
  gpu: GpuStatus | null;
  pendingPermissions: number;
  eventCount: number;
}

// ─── State ───────────────────────────────────────────────────

interface SwarmState {
  status: SwarmStatus | null;
  agents: AgentDescriptor[];
  tasks: TaskStatus[];
  events: SwarmEvent[];
  pendingPermissions: PermissionRequest[];
  memory: MemoryUsage | null;
  activeTaskId: string | null;
  loading: boolean;
  error: string | null;
  sseConnected: boolean;
}

const initialState: SwarmState = {
  status: null,
  agents: [],
  tasks: [],
  events: [],
  pendingPermissions: [],
  memory: null,
  activeTaskId: null,
  loading: false,
  error: null,
  sseConnected: false,
};

// ─── Async Thunks ────────────────────────────────────────────

import { getAgentBaseUrl } from "../../util/agentConfig";

async function swarmFetch(path: string, opts?: RequestInit) {
  const base = getAgentBaseUrl();
  const res = await fetch(`${base}/swarm${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const initSwarm = createAsyncThunk<SwarmStatus, Partial<SwarmConfig>>(
  "swarm/init",
  async (config) => {
    const result = await swarmFetch("/init", {
      method: "POST",
      body: JSON.stringify(config),
    });
    return result;
  },
);

export const fetchSwarmStatus = createAsyncThunk<SwarmStatus>(
  "swarm/fetchStatus",
  async () => swarmFetch("/status"),
);

export const shutdownSwarm = createAsyncThunk<{ status: string }>(
  "swarm/shutdown",
  async () => swarmFetch("/shutdown", { method: "POST" }),
);

export const spawnAgent = createAsyncThunk<AgentDescriptor, { type: string }>(
  "swarm/spawnAgent",
  async ({ type }) =>
    swarmFetch("/agents", { method: "POST", body: JSON.stringify({ type }) }),
);

export const fetchAgents = createAsyncThunk<{ agents: AgentDescriptor[] }>(
  "swarm/fetchAgents",
  async () => swarmFetch("/agents"),
);

export const orchestrateTask = createAsyncThunk<
  { taskId: string; status: string; nodes: number },
  {
    goal: string;
    mode?: string;
    topology?: string;
    acceptanceCriteria?: string;
  }
>("swarm/orchestrateTask", async (params) =>
  swarmFetch("/tasks", { method: "POST", body: JSON.stringify(params) }),
);

export const fetchTaskStatus = createAsyncThunk<TaskStatus, string>(
  "swarm/fetchTaskStatus",
  async (taskId) => swarmFetch(`/tasks/${taskId}`),
);

export const cancelTask = createAsyncThunk<{ success: boolean }, string>(
  "swarm/cancelTask",
  async (taskId) => swarmFetch(`/tasks/${taskId}/cancel`, { method: "POST" }),
);

export const fetchPermissions = createAsyncThunk<{
  pending: PermissionRequest[];
}>("swarm/fetchPermissions", async () => swarmFetch("/permissions"));

export const respondToPermission = createAsyncThunk<
  { success: boolean },
  { requestId: string; response: string }
>("swarm/respondToPermission", async ({ requestId, response }) =>
  swarmFetch(`/permissions/${requestId}`, {
    method: "POST",
    body: JSON.stringify({ response }),
  }),
);

export const fetchMemoryUsage = createAsyncThunk<MemoryUsage>(
  "swarm/fetchMemory",
  async () => swarmFetch("/memory"),
);

// ─── Slice ───────────────────────────────────────────────────

export const swarmSlice = createSlice({
  name: "swarm",
  initialState,
  reducers: {
    addEvent: (state, { payload }: PayloadAction<SwarmEvent>) => {
      state.events.push(payload);
      if (state.events.length > 500) {
        state.events = state.events.slice(-500);
      }
    },
    setSseConnected: (state, { payload }: PayloadAction<boolean>) => {
      state.sseConnected = payload;
    },
    setActiveTask: (state, { payload }: PayloadAction<string | null>) => {
      state.activeTaskId = payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearEvents: (state) => {
      state.events = [];
    },
  },
  extraReducers: (builder) => {
    // initSwarm
    builder.addCase(initSwarm.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(initSwarm.fulfilled, (state, { payload }) => {
      state.loading = false;
      state.status = payload;
    });
    builder.addCase(initSwarm.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || "Init failed";
    });

    // fetchSwarmStatus
    builder.addCase(fetchSwarmStatus.fulfilled, (state, { payload }) => {
      state.status = payload;
      state.agents = payload.agents;
    });

    // shutdownSwarm
    builder.addCase(shutdownSwarm.fulfilled, (state) => {
      state.status = null;
      state.agents = [];
      state.tasks = [];
      state.events = [];
      state.pendingPermissions = [];
      state.memory = null;
      state.activeTaskId = null;
    });

    // spawnAgent
    builder.addCase(spawnAgent.fulfilled, (state, { payload }) => {
      state.agents.push(payload);
    });

    // fetchAgents
    builder.addCase(fetchAgents.fulfilled, (state, { payload }) => {
      state.agents = payload.agents;
    });

    // orchestrateTask
    builder.addCase(orchestrateTask.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(orchestrateTask.fulfilled, (state, { payload }) => {
      state.loading = false;
      state.activeTaskId = payload.taskId;
    });
    builder.addCase(orchestrateTask.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || "Task failed";
    });

    // fetchTaskStatus
    builder.addCase(fetchTaskStatus.fulfilled, (state, { payload }) => {
      const idx = state.tasks.findIndex((t) => t.id === payload.id);
      if (idx >= 0) state.tasks[idx] = payload;
      else state.tasks.push(payload);
    });

    // cancelTask
    builder.addCase(cancelTask.fulfilled, (state) => {
      state.activeTaskId = null;
    });

    // fetchPermissions
    builder.addCase(fetchPermissions.fulfilled, (state, { payload }) => {
      state.pendingPermissions = payload.pending;
    });

    // respondToPermission
    builder.addCase(respondToPermission.fulfilled, (state, { meta }) => {
      state.pendingPermissions = state.pendingPermissions.filter(
        (p) => p.id !== meta.arg.requestId,
      );
    });

    // fetchMemoryUsage
    builder.addCase(fetchMemoryUsage.fulfilled, (state, { payload }) => {
      state.memory = payload;
    });
  },
});

export const {
  addEvent,
  setSseConnected,
  setActiveTask,
  clearError,
  clearEvents,
} = swarmSlice.actions;

// ─── Selectors ───────────────────────────────────────────────

export const selectSwarmStatus = (state: RootState) => state.swarm?.status;
export const selectSwarmAgents = (state: RootState) =>
  state.swarm?.agents ?? [];
export const selectSwarmTasks = (state: RootState) => state.swarm?.tasks ?? [];
export const selectSwarmEvents = (state: RootState) =>
  state.swarm?.events ?? [];
export const selectPendingPermissions = (state: RootState) =>
  state.swarm?.pendingPermissions ?? [];
export const selectMemoryUsage = (state: RootState) => state.swarm?.memory;
export const selectActiveTaskId = (state: RootState) =>
  state.swarm?.activeTaskId;
export const selectSwarmLoading = (state: RootState) =>
  state.swarm?.loading ?? false;
export const selectSwarmError = (state: RootState) => state.swarm?.error;
export const selectSseConnected = (state: RootState) =>
  state.swarm?.sseConnected ?? false;

export const selectActiveTask = createSelector(
  [selectSwarmTasks, selectActiveTaskId],
  (tasks, activeId) =>
    activeId ? (tasks.find((t) => t.id === activeId) ?? null) : null,
);

export const selectSwarmIsActive = createSelector(
  [selectSwarmStatus],
  (status) => status?.state === "active",
);

export default swarmSlice.reducer;
