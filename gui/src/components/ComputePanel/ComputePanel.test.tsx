/**
 * ComputePanel behavioral tests.
 *
 * Strategy:
 *  - Mock `useComputeJob` so we own all job state and never touch the network.
 *  - Mock heavyweight child panels (xterm, monaco, etc.) with lightweight stubs.
 *  - All assertions target what a real user would see or interact with.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Silence CSS imports that jsdom cannot handle ──────────────────────────────
vi.mock("./ComputePanel.css", () => ({}));

// ── Lightweight stubs for heavy child panels ──────────────────────────────────
vi.mock("./ComputeWorkflows", () => ({
  ComputeWorkflows: () => <div data-testid="compute-workflows" />,
}));
vi.mock("./ComputeJobView", () => ({
  ComputeJobView: () => <div data-testid="compute-job-view" />,
}));
vi.mock("./ComputeArtifacts", () => ({
  ComputeArtifacts: () => <div data-testid="compute-artifacts" />,
}));
vi.mock("./ComputeSSEFeed", () => ({
  ComputeSSEFeed: () => <div data-testid="compute-sse-feed" />,
}));
vi.mock("./ComputeMetrics", () => ({
  ComputeMetrics: () => <div data-testid="compute-metrics" />,
}));
vi.mock("./ComputeHistory", () => ({
  ComputeHistory: ({ jobs }: { jobs: Array<{ id: string; goal: string }> }) => (
    <div data-testid="compute-history">
      {jobs.length === 0 ? (
        <span>No compute jobs yet. Submit a goal to get started.</span>
      ) : (
        jobs.map((j) => <div key={j.id}>{j.goal}</div>)
      )}
    </div>
  ),
}));

// ── Mutable mock returned by useComputeJob ────────────────────────────────────
const mockJob = {
  activeJob: null as any,
  setActiveJob: vi.fn(),
  jobs: [] as any[],
  isSubmitting: false,
  isOffline: false,
  error: null as string | null,
  setError: vi.fn(),
  allowNetwork: false,
  setAllowNetwork: vi.fn(),
  allowEscalation: false,
  setAllowEscalation: vi.fn(),
  allowFSWrite: true,
  setAllowFSWrite: vi.fn(),
  useIpcCompute: false,
  logsEndRef: { current: null },
  isTerminal: false,
  loadJobs: vi.fn(),
  submitJob: vi.fn(),
  runWorkflow: vi.fn(),
  pauseJob: vi.fn(),
  resumeJob: vi.fn(),
  cancelJob: vi.fn(),
  viewJob: vi.fn(),
};

vi.mock("./useComputeJob", () => ({
  useComputeJob: () => mockJob,
}));

import ComputePanel from "./ComputePanel";

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("ComputePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJob.activeJob = null;
    mockJob.jobs = [];
    mockJob.isSubmitting = false;
    mockJob.isOffline = false;
    mockJob.error = null;
    mockJob.isTerminal = false;
  });

  // ── Renders ─────────────────────────────────────────────────────────────────

  it("renders without crashing", () => {
    render(<ComputePanel />);
    expect(screen.getByText("CodeIn Compute")).toBeInTheDocument();
  });

  it("shows the panel header with product name and BETA badge", () => {
    render(<ComputePanel />);
    expect(screen.getByText("CodeIn Compute")).toBeInTheDocument();
    expect(screen.getByText("BETA")).toBeInTheDocument();
  });

  // ── Goal input view (default) ─────────────────────────────────────────────

  it("shows the goal input area by default", () => {
    render(<ComputePanel />);
    expect(
      screen.getByText("What should CodeIn Compute do?"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Describe your goal/i),
    ).toBeInTheDocument();
  });

  it("shows New and History navigation buttons", () => {
    render(<ComputePanel />);
    expect(screen.getByText("+ New")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("submit button is disabled when goal textarea is empty", () => {
    render(<ComputePanel />);
    const runBtn = screen.getByRole("button", { name: /^run$/i });
    expect(runBtn).toBeDisabled();
  });

  it("submit button becomes enabled once a goal is typed", async () => {
    render(<ComputePanel />);
    const textarea = screen.getByPlaceholderText(/Describe your goal/i);
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: "Refactor the auth module" },
      });
    });
    expect(screen.getByRole("button", { name: /^run$/i })).not.toBeDisabled();
  });

  it("submit button shows 'Starting...' when a job is being submitted", () => {
    mockJob.isSubmitting = true;
    render(<ComputePanel />);
    expect(screen.getByText("Starting...")).toBeInTheDocument();
  });

  // ── Error banner ──────────────────────────────────────────────────────────

  it("does not show an error banner when job.error is null", () => {
    render(<ComputePanel />);
    // The dismiss button "x" should not be present.
    expect(
      screen.queryByRole("button", { name: /dismiss/i }),
    ).not.toBeInTheDocument();
  });

  it("shows an error banner when job.error is set", () => {
    mockJob.error = "Something went wrong";
    render(<ComputePanel />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("error banner has a dismiss (×) button", () => {
    mockJob.error = "Network failure";
    render(<ComputePanel />);
    // The dismiss button is labelled "x".
    expect(
      screen.getByRole("button", { name: /dismiss/i }),
    ).toBeInTheDocument();
  });

  it("clicking the dismiss button calls job.setError(null)", () => {
    mockJob.error = "Timeout";
    render(<ComputePanel />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(mockJob.setError).toHaveBeenCalledWith(null);
  });

  it("renders the raw error string from the hook verbatim", () => {
    mockJob.error =
      "Unable to reach the compute server. Please check your connection and try again.";
    render(<ComputePanel />);
    expect(
      screen.getByText(
        "Unable to reach the compute server. Please check your connection and try again.",
      ),
    ).toBeInTheDocument();
  });

  // ── Offline indicator ─────────────────────────────────────────────────────

  it("shows 'Offline' in the header when the agent is unreachable", () => {
    mockJob.isOffline = true;
    render(<ComputePanel />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("does not show 'Offline' when the agent is reachable", () => {
    mockJob.isOffline = false;
    render(<ComputePanel />);
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
  });

  // ── History view ──────────────────────────────────────────────────────────

  it("clicking History switches to the history panel", async () => {
    render(<ComputePanel />);
    await act(async () => {
      fireEvent.click(screen.getByText("History"));
    });
    expect(screen.getByTestId("compute-history")).toBeInTheDocument();
    // Goal input should no longer be rendered.
    expect(
      screen.queryByText("What should CodeIn Compute do?"),
    ).not.toBeInTheDocument();
  });

  it("history view shows empty-state when no past jobs exist", async () => {
    mockJob.jobs = [];
    render(<ComputePanel />);
    await act(async () => {
      fireEvent.click(screen.getByText("History"));
    });
    expect(
      screen.getByText("No compute jobs yet. Submit a goal to get started."),
    ).toBeInTheDocument();
  });

  it("history view lists goal descriptions for each past job", async () => {
    mockJob.jobs = [
      {
        id: "job-1",
        status: "completed",
        goal: "Build a REST API",
        createdAt: new Date().toISOString(),
      },
      {
        id: "job-2",
        status: "failed",
        goal: "Fix the failing tests",
        createdAt: new Date().toISOString(),
      },
    ];
    render(<ComputePanel />);
    await act(async () => {
      fireEvent.click(screen.getByText("History"));
    });
    expect(screen.getByText("Build a REST API")).toBeInTheDocument();
    expect(screen.getByText("Fix the failing tests")).toBeInTheDocument();
  });

  it("calls job.loadJobs when History is clicked", async () => {
    render(<ComputePanel />);
    await act(async () => {
      fireEvent.click(screen.getByText("History"));
    });
    expect(mockJob.loadJobs).toHaveBeenCalled();
  });

  it("clicking '+ New' returns to the goal input view from history", async () => {
    render(<ComputePanel />);
    await act(async () => {
      fireEvent.click(screen.getByText("History"));
    });
    expect(screen.getByTestId("compute-history")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("+ New"));
    });
    expect(
      screen.getByText("What should CodeIn Compute do?"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("compute-history")).not.toBeInTheDocument();
  });
});
