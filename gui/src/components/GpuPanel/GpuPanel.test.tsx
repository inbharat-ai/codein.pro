import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock useGpuSession before importing GpuPanel
const mockSession = {
  connected: false,
  status: null,
  gpuTypes: [],
  pods: [],
  isOffline: false,
  loading: false,
  error: null as string | null,
  setError: vi.fn(),
  connect: vi.fn(),
  stop: vi.fn().mockResolvedValue(true),
  loadGpuTypes: vi.fn(),
  loadPods: vi.fn(),
  createPod: vi.fn(),
  submitJob: vi.fn(),
  checkJob: vi.fn(),
  refreshStatus: vi.fn(),
};

vi.mock("./useGpuSession", () => ({
  useGpuSession: () => mockSession,
}));

// Mock child components
vi.mock("./GpuHeader", () => ({
  GpuHeader: ({ connected, onStop }: any) => (
    <div data-testid="gpu-header">
      GpuHeader {connected ? "connected" : "disconnected"}
      <button data-testid="stop-btn" onClick={onStop}>
        Stop
      </button>
    </div>
  ),
}));
vi.mock("./GpuBudgetBar", () => ({
  GpuBudgetBar: () => <div data-testid="gpu-budget-bar">BudgetBar</div>,
}));
vi.mock("./GpuConnectTab", () => ({
  GpuConnectTab: () => <div data-testid="gpu-connect-tab">ConnectTab</div>,
}));
vi.mock("./GpuTypesTab", () => ({
  GpuTypesTab: () => <div data-testid="gpu-types-tab">TypesTab</div>,
}));
vi.mock("./GpuCreatePodForm", () => ({
  GpuCreatePodForm: () => <div data-testid="gpu-create-pod">CreatePod</div>,
}));
vi.mock("./GpuPodsTab", () => ({
  GpuPodsTab: () => <div data-testid="gpu-pods-tab">PodsTab</div>,
}));
vi.mock("./GpuJobsTab", () => ({
  GpuJobsTab: () => <div data-testid="gpu-jobs-tab">JobsTab</div>,
}));
vi.mock("./GpuPanel.css", () => ({}));

import GpuPanel from "./GpuPanel";

describe("GpuPanel", () => {
  beforeEach(() => {
    mockSession.connected = false;
    mockSession.status = null;
    mockSession.isOffline = false;
    mockSession.error = null;
  });

  it("renders without crashing", () => {
    render(<GpuPanel />);
    expect(screen.getByTestId("gpu-header")).toBeTruthy();
  });

  it("shows Connect tab by default", () => {
    render(<GpuPanel />);
    expect(screen.getByTestId("gpu-connect-tab")).toBeTruthy();
  });

  it("shows all tab buttons", () => {
    render(<GpuPanel />);
    expect(screen.getByText("Connect")).toBeTruthy();
    expect(screen.getByText("GPU Types")).toBeTruthy();
    expect(screen.getByText("Pods")).toBeTruthy();
    expect(screen.getByText("Jobs")).toBeTruthy();
  });

  it("disables GPU Types, Pods, Jobs tabs when not connected", () => {
    render(<GpuPanel />);
    expect(screen.getByText("GPU Types").closest("button")?.disabled).toBe(
      true,
    );
    expect(screen.getByText("Pods").closest("button")?.disabled).toBe(true);
    expect(screen.getByText("Jobs").closest("button")?.disabled).toBe(true);
  });

  it("shows offline banner when agent is offline", () => {
    mockSession.isOffline = true;
    render(<GpuPanel />);
    expect(
      screen.getByText(
        "Agent is not running. Start the CodeIn agent to use GPU compute.",
      ),
    ).toBeTruthy();
  });

  it("shows error banner and dismiss button when error exists", () => {
    mockSession.error = "Connection failed";
    render(<GpuPanel />);
    expect(screen.getByText("Connection failed")).toBeTruthy();
    expect(screen.getByLabelText("Dismiss")).toBeTruthy();
  });
});
