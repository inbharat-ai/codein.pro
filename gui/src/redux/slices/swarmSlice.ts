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
    costUSD: number;
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
    costUSD: number;
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
  sessionTtl?: number; // milliseconds remaining in session
  idleTimeout?: number; // milliseconds before idle shutdown
  provider?: string; // e.g. "runpod", "lambda"
  connected: boolean;
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
  // Extended state for full dashboard
  budget: BudgetStatus | null;
  analytics: AnalyticsData | null;
  costSuggestions: CostSuggestion[];
  backgroundTasks: BackgroundTask[];
  plugins: PluginInfo[];
  skills: SkillInfo[];
  workspaceProfile: WorkspaceProfile | null;
  conventions: string[];
  // New endpoint state
  terminalSessions: any[];
  gitStatus: {
    branch: string;
    files: any[];
    ahead: number;
    behind: number;
    clean: boolean;
  } | null;
  sandboxAvailable: boolean;
  activePlans: any[];
  // Fetch tracking flags
  analyticsLoaded: boolean;
  workspaceLoaded: boolean;
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
  budget: null,
  analytics: null,
  costSuggestions: [],
  backgroundTasks: [],
  plugins: [],
  skills: [],
  workspaceProfile: null,
  conventions: [],
  terminalSessions: [],
  gitStatus: null,
  sandboxAvailable: false,
  activePlans: [],
  analyticsLoaded: false,
  workspaceLoaded: false,
};

// ─── Async Thunks ────────────────────────────────────────────

import { getAgentBaseUrl } from "../../util/agentConfig";
import { ensureAuth } from "../../util/authService";

export async function swarmFetch(path: string, opts?: RequestInit) {
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

  const res = await fetch(`${base}/swarm${path}`, { ...opts, headers });
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

// ─── Extended Thunks (previously orphaned endpoints) ────────

export interface BudgetStatus {
  budgetUSD: number;
  totalSpent: number;
  remaining: number;
  warningThreshold: number;
  isOverBudget: boolean;
}

export interface AnalyticsData {
  sessions: unknown[];
  costByAgent: Record<string, number>;
  costByModel: Record<string, number>;
  totalCost: number;
  totalTokens: number;
}

export interface BackgroundTask {
  id: string;
  goal: string;
  status: string;
  priority: string;
  createdAt: string;
  progress?: number;
}

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  status: string;
  toolCount: number;
}

export interface SkillInfo {
  name: string;
  description: string;
  category: string;
  requiredContext: string[];
}

export interface WorkspaceProfile {
  languages: Record<string, number>;
  frameworks: string[];
  testRunner?: string;
  packageManager?: string;
}

export interface CostSuggestion {
  suggestion: string;
  estimatedSavings: number;
  priority: string;
}

export const fetchBudgetStatus = createAsyncThunk<{ budget: BudgetStatus }>(
  "swarm/fetchBudget",
  async () => swarmFetch("/budget"),
);

export const fetchAnalytics = createAsyncThunk<
  { analytics: AnalyticsData },
  string | undefined
>("swarm/fetchAnalytics", async (sessionId) =>
  swarmFetch(sessionId ? `/analytics?sessionId=${sessionId}` : "/analytics"),
);

export const fetchCostSuggestions = createAsyncThunk<{
  suggestions: CostSuggestion[];
}>("swarm/fetchCostSuggestions", async () => swarmFetch("/cost-suggestions"));

export const fetchAgentMetrics = createAsyncThunk<
  { metrics: unknown },
  string | undefined
>("swarm/fetchAgentMetrics", async (agentId) =>
  swarmFetch(
    agentId ? `/agents/metrics?agentId=${agentId}` : "/agents/metrics",
  ),
);

export const fetchTaskResults = createAsyncThunk<unknown, string>(
  "swarm/fetchTaskResults",
  async (taskId) => swarmFetch(`/tasks/${taskId}/results`),
);

export const fetchEventLog = createAsyncThunk<
  { events: SwarmEvent[] },
  number | undefined
>("swarm/fetchEventLog", async (limit) =>
  swarmFetch(`/events/log${limit ? `?limit=${limit}` : ""}`),
);

export const submitBackgroundTask = createAsyncThunk<
  { taskId: string; position: number },
  { goal: string; priority?: string; mode?: string }
>("swarm/submitBackgroundTask", async (spec) =>
  swarmFetch("/background-tasks", {
    method: "POST",
    body: JSON.stringify(spec),
  }),
);

export const fetchBackgroundTasks = createAsyncThunk<
  { tasks: BackgroundTask[] },
  string | undefined
>("swarm/fetchBackgroundTasks", async (status) =>
  swarmFetch(
    status ? `/background-tasks?status=${status}` : "/background-tasks",
  ),
);

export const fetchBackgroundTaskStatus = createAsyncThunk<
  BackgroundTask,
  string
>("swarm/fetchBackgroundTaskStatus", async (taskId) =>
  swarmFetch(`/background-tasks/${taskId}`),
);

export const fetchPlugins = createAsyncThunk<{ plugins: PluginInfo[] }>(
  "swarm/fetchPlugins",
  async () => swarmFetch("/plugins"),
);

export const fetchSkills = createAsyncThunk<
  { skills: SkillInfo[] },
  string | undefined
>("swarm/fetchSkills", async (category) =>
  swarmFetch(category ? `/skills?category=${category}` : "/skills"),
);

export const executeSkill = createAsyncThunk<
  unknown,
  { skillName: string; context: Record<string, unknown> }
>("swarm/executeSkill", async ({ skillName, context }) =>
  swarmFetch(`/skills/${skillName}/execute`, {
    method: "POST",
    body: JSON.stringify(context),
  }),
);

export const generateCommitMessage = createAsyncThunk<
  { suggestion: string },
  { diff: string }
>("swarm/generateCommitMessage", async ({ diff }) =>
  swarmFetch("/generate/commit-message", {
    method: "POST",
    body: JSON.stringify({ diff }),
  }),
);

export const generatePRDescription = createAsyncThunk<
  { title: string; body: string },
  { gitDiff: string; commitMessages: string[] }
>("swarm/generatePRDescription", async (params) =>
  swarmFetch("/generate/pr-description", {
    method: "POST",
    body: JSON.stringify(params),
  }),
);

export const generateChangelog = createAsyncThunk<
  { changelog: string },
  { commits: string[] }
>("swarm/generateChangelog", async (params) =>
  swarmFetch("/generate/changelog", {
    method: "POST",
    body: JSON.stringify(params),
  }),
);

export const fetchWorkspaceProfile = createAsyncThunk<{
  profile: WorkspaceProfile | null;
}>("swarm/fetchWorkspaceProfile", async () => swarmFetch("/workspace/profile"));

export const fetchConventions = createAsyncThunk<{ conventions: string[] }>(
  "swarm/fetchConventions",
  async () => swarmFetch("/workspace/conventions"),
);

export const fetchWorkspaceSummary = createAsyncThunk<
  { summary: string | null },
  string | undefined
>("swarm/fetchWorkspaceSummary", async (root) =>
  swarmFetch(
    root
      ? `/workspace/summary?root=${encodeURIComponent(root)}`
      : "/workspace/summary",
  ),
);

// ─── Terminal, Git, Autonomous, Sandbox Thunks ──────────────

export const fetchTerminalSessions = createAsyncThunk<{ sessions: any[] }>(
  "swarm/fetchTerminalSessions",
  async () => swarmFetch("/terminal/sessions"),
);

export const createTerminalSession = createAsyncThunk<
  any,
  { agentId?: string }
>("swarm/createTerminalSession", async (opts) =>
  swarmFetch("/terminal/sessions", {
    method: "POST",
    body: JSON.stringify(opts),
  }),
);

export const executeTerminalCommand = createAsyncThunk<
  { exitCode: number; stdout: string; stderr: string },
  { sessionId: string; command: string }
>("swarm/executeTerminalCommand", async ({ sessionId, command }) =>
  swarmFetch(`/terminal/sessions/${sessionId}/execute`, {
    method: "POST",
    body: JSON.stringify({ command }),
  }),
);

export const fetchGitStatus = createAsyncThunk<{
  branch: string;
  files: any[];
  ahead: number;
  behind: number;
  clean: boolean;
}>("swarm/fetchGitStatus", async () => swarmFetch("/git/status"));

export const fetchGitDiff = createAsyncThunk<string, { staged?: boolean }>(
  "swarm/fetchGitDiff",
  async (opts) => {
    const resp = await swarmFetch(
      `/git/diff${opts?.staged ? "?staged=true" : ""}`,
    );
    return resp.diff ?? resp;
  },
);

export const fetchGitLog = createAsyncThunk<
  { hash: string; message: string }[],
  number | undefined
>("swarm/fetchGitLog", async (count) => {
  const resp = await swarmFetch(`/git/log${count ? `?count=${count}` : ""}`);
  return resp.log ?? resp;
});

export const runAutonomousPlan = createAsyncThunk<
  { planId: string },
  { goal: string; context?: Record<string, any> }
>("swarm/runAutonomousPlan", async (params) =>
  swarmFetch("/autonomous/run", {
    method: "POST",
    body: JSON.stringify(params),
  }),
);

export const fetchActivePlans = createAsyncThunk<{ plans: any[] }>(
  "swarm/fetchActivePlans",
  async () => swarmFetch("/autonomous/plans"),
);

export const executeSandboxed = createAsyncThunk<
  { stdout: string; stderr: string; exitCode: number },
  { code: string; runtime: string }
>("swarm/executeSandboxed", async (params) =>
  swarmFetch("/sandbox/execute", {
    method: "POST",
    body: JSON.stringify(params),
  }),
);

export const fetchSandboxStatus = createAsyncThunk<{ available: boolean }>(
  "swarm/fetchSandboxStatus",
  async () => swarmFetch("/sandbox/status"),
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

    // Extended thunk reducers
    builder.addCase(fetchBudgetStatus.fulfilled, (state, { payload }) => {
      state.budget = payload.budget;
    });
    builder.addCase(fetchAnalytics.fulfilled, (state, { payload }) => {
      state.analytics = payload.analytics;
      state.analyticsLoaded = true;
    });
    builder.addCase(fetchAnalytics.rejected, (state) => {
      state.analyticsLoaded = true;
    });
    builder.addCase(fetchCostSuggestions.fulfilled, (state, { payload }) => {
      state.costSuggestions = payload.suggestions;
    });
    builder.addCase(fetchBackgroundTasks.fulfilled, (state, { payload }) => {
      state.backgroundTasks = payload.tasks;
    });
    builder.addCase(
      submitBackgroundTask.fulfilled,
      (state, { payload, meta }) => {
        state.backgroundTasks.push({
          id: payload.taskId,
          goal: meta.arg.goal,
          status: "queued",
          priority: meta.arg.priority || "normal",
          createdAt: new Date().toISOString(),
        });
      },
    );
    builder.addCase(fetchPlugins.fulfilled, (state, { payload }) => {
      state.plugins = payload.plugins;
    });
    builder.addCase(fetchSkills.fulfilled, (state, { payload }) => {
      state.skills = payload.skills;
    });
    builder.addCase(fetchWorkspaceProfile.fulfilled, (state, { payload }) => {
      state.workspaceProfile = payload.profile;
      state.workspaceLoaded = true;
    });
    builder.addCase(fetchWorkspaceProfile.rejected, (state) => {
      state.workspaceLoaded = true;
    });
    builder.addCase(fetchConventions.fulfilled, (state, { payload }) => {
      state.conventions = payload.conventions;
    });

    // Terminal sessions
    builder.addCase(fetchTerminalSessions.fulfilled, (state, { payload }) => {
      state.terminalSessions = payload.sessions;
    });

    // Git status
    builder.addCase(fetchGitStatus.fulfilled, (state, { payload }) => {
      state.gitStatus = payload;
    });

    // Active plans
    builder.addCase(fetchActivePlans.fulfilled, (state, { payload }) => {
      state.activePlans = payload.plans;
    });

    // Sandbox status
    builder.addCase(fetchSandboxStatus.fulfilled, (state, { payload }) => {
      state.sandboxAvailable = payload.available;
    });

    // Background task status (single task polling)
    builder.addCase(fetchBackgroundTaskStatus.fulfilled, (state, action) => {
      const task = action.payload;
      if (task && state.backgroundTasks) {
        const idx = state.backgroundTasks.findIndex(
          (t: BackgroundTask) => t.id === task.id,
        );
        if (idx >= 0) {
          state.backgroundTasks[idx] = task;
        } else {
          state.backgroundTasks.push(task);
        }
      }
    });
    builder.addCase(fetchBackgroundTaskStatus.rejected, (state, action) => {
      console.warn(
        "Failed to fetch background task status:",
        action.error.message,
      );
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

// Extended selectors
export const selectSwarmBudget = (state: RootState) =>
  state.swarm?.budget ?? null;
export const selectSwarmAnalytics = (state: RootState) =>
  state.swarm?.analytics ?? null;
export const selectCostSuggestions = (state: RootState) =>
  state.swarm?.costSuggestions ?? [];
export const selectBackgroundTasks = (state: RootState) =>
  state.swarm?.backgroundTasks ?? [];
export const selectSwarmPlugins = (state: RootState) =>
  state.swarm?.plugins ?? [];
export const selectSwarmSkills = (state: RootState) =>
  state.swarm?.skills ?? [];
export const selectWorkspaceProfile = (state: RootState) =>
  state.swarm?.workspaceProfile ?? null;
export const selectConventions = (state: RootState) =>
  state.swarm?.conventions ?? [];
export const selectAnalyticsLoaded = (state: RootState) =>
  state.swarm?.analyticsLoaded ?? false;
export const selectWorkspaceLoaded = (state: RootState) =>
  state.swarm?.workspaceLoaded ?? false;

// New endpoint selectors
export const selectTerminalSessions = (state: RootState) =>
  state.swarm?.terminalSessions ?? [];
export const selectGitStatus = (state: RootState) =>
  state.swarm?.gitStatus ?? null;
export const selectSandboxAvailable = (state: RootState) =>
  state.swarm?.sandboxAvailable ?? false;
export const selectActivePlans = (state: RootState) =>
  state.swarm?.activePlans ?? [];

export default swarmSlice.reducer;
