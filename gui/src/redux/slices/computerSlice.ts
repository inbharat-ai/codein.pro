import {
  PayloadAction,
  createAsyncThunk,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import { RootState } from "../store";
import { getAgentV1BaseUrl } from "../../util/agentConfig";
import { ensureAuth } from "../../util/authService";

// ─── Types ───────────────────────────────────────────────────

export interface PlanStep {
  id: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  durationMs?: number;
  error?: string;
}

export interface PlanProgress {
  completed: number;
  total: number;
  costUSD: number;
}

export interface ActivePlan {
  id: string;
  goal: string;
  status:
    | "planning"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";
  steps: PlanStep[];
  progress: PlanProgress;
}

export interface SkillInfo {
  name: string;
  description: string;
  category: string;
  trustLevel: "low" | "medium" | "high";
  usageCount: number;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requiredPermissions?: string[];
  estimatedCostUSD?: number;
}

export interface WorkflowTemplate {
  name: string;
  description: string;
  stepCount: number;
  avgDurationMs: number;
  variables: WorkflowVariable[];
}

export interface WorkflowVariable {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
  defaultValue?: string | number | boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: "execute" | "approve" | "deny" | "error" | "cost" | "plan";
  skill: string;
  agent: string;
  durationMs: number;
  costUSD: number;
  details?: string;
}

// ─── Fetch Helper ────────────────────────────────────────────

async function computerFetch(path: string, opts?: RequestInit) {
  const base = getAgentV1BaseUrl();

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

  const res = await fetch(`${base}/computer${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// ─── State ───────────────────────────────────────────────────

export type ComputerTab = "run" | "skills" | "workflows" | "audit";

interface ComputerState {
  activePlan: ActivePlan | null;
  skills: { items: SkillInfo[]; loading: boolean };
  workflows: { items: WorkflowTemplate[]; loading: boolean };
  auditEntries: AuditEntry[];
  goalInput: string;
  activeTab: ComputerTab;
  error: string | null;
}

const initialState: ComputerState = {
  activePlan: null,
  skills: { items: [], loading: false },
  workflows: { items: [], loading: false },
  auditEntries: [],
  goalInput: "",
  activeTab: "run",
  error: null,
};

// ─── Async Thunks ────────────────────────────────────────────

export const submitGoal = createAsyncThunk<ActivePlan, string>(
  "computer/submitGoal",
  async (goal) =>
    computerFetch("/run", {
      method: "POST",
      body: JSON.stringify({ goal }),
    }),
);

export const fetchPlanStatus = createAsyncThunk<ActivePlan, string>(
  "computer/fetchPlanStatus",
  async (planId) => computerFetch(`/run/${planId}`),
);

export const pausePlan = createAsyncThunk<{ success: boolean }, string>(
  "computer/pausePlan",
  async (planId) => computerFetch(`/run/${planId}/pause`, { method: "POST" }),
);

export const resumePlan = createAsyncThunk<{ success: boolean }, string>(
  "computer/resumePlan",
  async (planId) => computerFetch(`/run/${planId}/resume`, { method: "POST" }),
);

export const cancelPlan = createAsyncThunk<{ success: boolean }, string>(
  "computer/cancelPlan",
  async (planId) => computerFetch(`/run/${planId}/cancel`, { method: "POST" }),
);

export const fetchSkills = createAsyncThunk<
  { skills: SkillInfo[] },
  { category?: string; search?: string } | undefined
>("computer/fetchSkills", async (filters) => {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();
  return computerFetch(`/skills${qs ? `?${qs}` : ""}`);
});

export const findSkillsForTask = createAsyncThunk<
  { skills: SkillInfo[] },
  string
>("computer/findSkillsForTask", async (description) =>
  computerFetch("/skills/find", {
    method: "POST",
    body: JSON.stringify({ description }),
  }),
);

export const fetchWorkflows = createAsyncThunk<{
  workflows: WorkflowTemplate[];
}>("computer/fetchWorkflows", async () => computerFetch("/workflows"));

export const runWorkflow = createAsyncThunk<
  ActivePlan,
  { name: string; variables: Record<string, unknown> }
>("computer/runWorkflow", async ({ name, variables }) =>
  computerFetch(`/workflows/${encodeURIComponent(name)}/run`, {
    method: "POST",
    body: JSON.stringify({ variables }),
  }),
);

export const fetchAudit = createAsyncThunk<
  { entries: AuditEntry[] },
  { action?: string } | undefined
>("computer/fetchAudit", async (filters) => {
  const params = new URLSearchParams();
  if (filters?.action) params.set("action", filters.action);
  const qs = params.toString();
  return computerFetch(`/audit${qs ? `?${qs}` : ""}`);
});

// ─── Slice ───────────────────────────────────────────────────

export const computerSlice = createSlice({
  name: "computer",
  initialState,
  reducers: {
    setGoalInput: (state, { payload }: PayloadAction<string>) => {
      state.goalInput = payload;
    },
    setActiveTab: (state, { payload }: PayloadAction<ComputerTab>) => {
      state.activeTab = payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearActivePlan: (state) => {
      state.activePlan = null;
    },
  },
  extraReducers: (builder) => {
    // submitGoal
    builder.addCase(submitGoal.pending, (state) => {
      state.error = null;
    });
    builder.addCase(submitGoal.fulfilled, (state, { payload }) => {
      state.activePlan = payload;
      state.goalInput = "";
    });
    builder.addCase(submitGoal.rejected, (state, action) => {
      state.error = action.error.message || "Failed to submit goal";
    });

    // fetchPlanStatus
    builder.addCase(fetchPlanStatus.fulfilled, (state, { payload }) => {
      state.activePlan = payload;
    });

    // pausePlan
    builder.addCase(pausePlan.fulfilled, (state) => {
      if (state.activePlan) {
        state.activePlan.status = "paused";
      }
    });

    // resumePlan
    builder.addCase(resumePlan.fulfilled, (state) => {
      if (state.activePlan) {
        state.activePlan.status = "running";
      }
    });

    // cancelPlan
    builder.addCase(cancelPlan.fulfilled, (state) => {
      if (state.activePlan) {
        state.activePlan.status = "cancelled";
      }
    });

    // fetchSkills
    builder.addCase(fetchSkills.pending, (state) => {
      state.skills.loading = true;
    });
    builder.addCase(fetchSkills.fulfilled, (state, { payload }) => {
      state.skills.items = payload.skills;
      state.skills.loading = false;
    });
    builder.addCase(fetchSkills.rejected, (state) => {
      state.skills.loading = false;
    });

    // findSkillsForTask
    builder.addCase(findSkillsForTask.fulfilled, (state, { payload }) => {
      state.skills.items = payload.skills;
    });

    // fetchWorkflows
    builder.addCase(fetchWorkflows.pending, (state) => {
      state.workflows.loading = true;
    });
    builder.addCase(fetchWorkflows.fulfilled, (state, { payload }) => {
      state.workflows.items = payload.workflows;
      state.workflows.loading = false;
    });
    builder.addCase(fetchWorkflows.rejected, (state) => {
      state.workflows.loading = false;
    });

    // runWorkflow
    builder.addCase(runWorkflow.fulfilled, (state, { payload }) => {
      state.activePlan = payload;
      state.activeTab = "run";
    });

    // fetchAudit
    builder.addCase(fetchAudit.fulfilled, (state, { payload }) => {
      state.auditEntries = payload.entries;
    });
  },
});

export const { setGoalInput, setActiveTab, clearError, clearActivePlan } =
  computerSlice.actions;

// ─── Selectors ───────────────────────────────────────────────

export const selectActivePlan = (state: RootState) =>
  state.computer?.activePlan ?? null;
export const selectSkills = (state: RootState) =>
  state.computer?.skills ?? { items: [], loading: false };
export const selectWorkflows = (state: RootState) =>
  state.computer?.workflows ?? { items: [], loading: false };
export const selectAudit = (state: RootState) =>
  state.computer?.auditEntries ?? [];
export const selectActiveTab = (state: RootState) =>
  state.computer?.activeTab ?? "run";
export const selectGoalInput = (state: RootState) =>
  state.computer?.goalInput ?? "";
export const selectComputerError = (state: RootState) =>
  state.computer?.error ?? null;

export const selectPlanIsActive = createSelector(
  [selectActivePlan],
  (plan) =>
    plan !== null &&
    (plan.status === "running" ||
      plan.status === "planning" ||
      plan.status === "paused"),
);

export default computerSlice.reducer;
