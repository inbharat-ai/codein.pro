import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { SwarmPanel } from "./SwarmPanel";

// Mock all child components to isolate SwarmPanel logic
vi.mock("./SwarmHeader", () => ({
  SwarmHeader: () => <div data-testid="swarm-header">SwarmHeader</div>,
}));
vi.mock("./SwarmAgents", () => ({
  SwarmAgents: () => <div data-testid="swarm-agents">SwarmAgents</div>,
}));
vi.mock("./SwarmTaskView", () => ({
  SwarmTaskView: () => <div data-testid="swarm-task-view">SwarmTaskView</div>,
}));
vi.mock("./SwarmPermissions", () => ({
  SwarmPermissions: () => <div>SwarmPermissions</div>,
}));
vi.mock("./SwarmBudget", () => ({
  SwarmBudget: () => <div>SwarmBudget</div>,
}));
vi.mock("./SwarmGpu", () => ({
  SwarmGpu: () => <div>SwarmGpu</div>,
}));
vi.mock("./SwarmBackgroundTasks", () => ({
  SwarmBackgroundTasks: () => <div>SwarmBackgroundTasks</div>,
}));
vi.mock("./SwarmTimeline", () => ({
  SwarmTimeline: () => <div>SwarmTimeline</div>,
}));
vi.mock("./SwarmMemory", () => ({
  SwarmMemory: () => <div>SwarmMemory</div>,
}));
vi.mock("./SwarmAnalytics", () => ({
  SwarmAnalytics: () => <div data-testid="swarm-analytics">SwarmAnalytics</div>,
}));
vi.mock("./SwarmPlugins", () => ({
  SwarmPlugins: () => <div data-testid="swarm-plugins">SwarmPlugins</div>,
}));
vi.mock("./SwarmWorkspaceIntel", () => ({
  SwarmWorkspaceIntel: () => (
    <div data-testid="swarm-workspace">SwarmWorkspaceIntel</div>
  ),
}));
vi.mock("../ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("../../util/agentConfig", () => ({
  getAgentV1BaseUrl: () => "http://localhost:43120/v1",
}));

// Mock EventSource globally
const mockEventSource = {
  onopen: null as any,
  onmessage: null as any,
  onerror: null as any,
  close: vi.fn(),
};
vi.stubGlobal(
  "EventSource",
  vi.fn(() => mockEventSource),
);

function createMockStore(
  overrides: {
    isActive?: boolean;
    sseConnected?: boolean;
  } = {},
) {
  const { isActive = false, sseConnected = false } = overrides;
  return configureStore({
    reducer: {
      swarm: () => ({
        status: isActive ? { state: "active" } : null,
        sseConnected,
        agents: [],
        tasks: [],
        events: [],
        pendingPermissions: [],
        memory: null,
        activeTaskId: null,
        loading: false,
        error: null,
        budget: null,
        analytics: null,
        costSuggestions: [],
        backgroundTasks: [],
        plugins: [],
        skills: [],
        workspaceProfile: null,
        conventions: [],
        terminalSessions: [],
        gitStatus: { branch: "" },
      }),
    },
  });
}

describe("SwarmPanel", () => {
  it("renders without crashing", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <SwarmPanel />
      </Provider>,
    );
    expect(screen.getByTestId("swarm-header")).toBeTruthy();
  });

  it("shows inactive message when swarm is not active", () => {
    const store = createMockStore({ isActive: false });
    render(
      <Provider store={store}>
        <SwarmPanel />
      </Provider>,
    );
    expect(
      screen.getByText("Swarm not active. Initialize to begin."),
    ).toBeTruthy();
  });

  it("shows tab bar when swarm is active", () => {
    const store = createMockStore({ isActive: true });
    render(
      <Provider store={store}>
        <SwarmPanel />
      </Provider>,
    );
    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Analytics")).toBeTruthy();
    expect(screen.getByText("Extensions")).toBeTruthy();
    expect(screen.getByText("Workspace")).toBeTruthy();
  });

  it("shows overview tab content by default when active", () => {
    const store = createMockStore({ isActive: true });
    render(
      <Provider store={store}>
        <SwarmPanel />
      </Provider>,
    );
    expect(screen.getByTestId("swarm-agents")).toBeTruthy();
    expect(screen.getByTestId("swarm-task-view")).toBeTruthy();
  });

  it("switches to analytics tab on click", () => {
    const store = createMockStore({ isActive: true });
    render(
      <Provider store={store}>
        <SwarmPanel />
      </Provider>,
    );
    fireEvent.click(screen.getByText("Analytics"));
    expect(screen.getByTestId("swarm-analytics")).toBeTruthy();
    expect(screen.queryByTestId("swarm-agents")).toBeNull();
  });

  it("shows SSE disconnected banner when not connected and active", () => {
    const store = createMockStore({ isActive: true, sseConnected: false });
    render(
      <Provider store={store}>
        <SwarmPanel />
      </Provider>,
    );
    expect(
      screen.getByText("SSE disconnected — events may be delayed"),
    ).toBeTruthy();
  });
});
