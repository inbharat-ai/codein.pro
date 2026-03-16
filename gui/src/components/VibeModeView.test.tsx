import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { VibeModeView } from "./VibeModeView";

// Mock streamSwarmTask thunk
vi.mock("../redux/thunks/streamSwarmTask", () => ({
  streamSwarmTask: vi.fn(() => ({ type: "swarm/streamTask" })),
}));

function createMockStore() {
  return configureStore({
    reducer: {
      swarm: () => ({
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
        gitStatus: { branch: "" },
      }),
    },
  });
}

describe("VibeModeView", () => {
  it("renders without crashing", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <VibeModeView />
      </Provider>,
    );
    expect(screen.getByText("Vibe Builder")).toBeTruthy();
  });

  it("shows descriptive text", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <VibeModeView />
      </Provider>,
    );
    expect(
      screen.getByText("Drop a screenshot or describe what you want to build"),
    ).toBeTruthy();
  });

  it("shows drop zone with upload instructions", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <VibeModeView />
      </Provider>,
    );
    expect(screen.getByText("Drop a screenshot here")).toBeTruthy();
    expect(screen.getByText("or click to upload")).toBeTruthy();
  });

  it("has a textarea for description input", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <VibeModeView />
      </Provider>,
    );
    const textarea = screen.getByPlaceholderText(
      "Describe what you want to build...",
    );
    expect(textarea).toBeTruthy();
  });

  it("has a disabled Generate button when no input is provided", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <VibeModeView />
      </Provider>,
    );
    const btn = screen.getByText("Generate");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Generate button when description is entered", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <VibeModeView />
      </Provider>,
    );
    const textarea = screen.getByPlaceholderText(
      "Describe what you want to build...",
    );
    fireEvent.change(textarea, { target: { value: "Build a landing page" } });
    const btn = screen.getByText("Generate");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
