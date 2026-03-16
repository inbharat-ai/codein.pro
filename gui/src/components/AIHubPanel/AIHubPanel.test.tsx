import { render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { AIHubPanel } from "./AIHubPanel";

// Mock the auth service used by aiHubSlice
vi.mock("../../util/authService", () => ({
  ensureAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../util/agentConfig", () => ({
  getAgentBaseUrl: () => "http://localhost:43120",
  agentFetch: vi.fn().mockRejectedValue(new Error("mocked")),
}));

// Minimal aiHub slice mock matching the real slice shape
function createMockStore(overrides: Record<string, any> = {}) {
  return configureStore({
    reducer: {
      aiHub: (
        state = {
          providers: [],
          models: {},
          loading: false,
          error: null,
          testingProvider: null,
          fetchingModels: null,
          savingKey: null,
          removingKey: null,
          enablingProvider: null,
          ...overrides,
        },
      ) => state,
    },
  });
}

describe("AIHubPanel", () => {
  it("renders without crashing", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <AIHubPanel />
      </Provider>,
    );
    expect(screen.getByText("AI API Hub")).toBeInTheDocument();
  });

  it("shows loading state when loading with no providers", () => {
    const store = createMockStore({ loading: true, providers: [] });
    render(
      <Provider store={store}>
        <AIHubPanel />
      </Provider>,
    );
    expect(screen.getByText("Loading providers...")).toBeInTheDocument();
  });

  it("shows empty state when not loading and no providers", () => {
    const store = createMockStore({
      loading: false,
      providers: [],
      error: null,
    });
    render(
      <Provider store={store}>
        <AIHubPanel />
      </Provider>,
    );
    expect(screen.getByText("No Providers Available")).toBeInTheDocument();
  });

  it("shows error banner when error is set", () => {
    const store = createMockStore({
      loading: false,
      providers: [],
      error: "Connection refused",
    });
    render(
      <Provider store={store}>
        <AIHubPanel />
      </Provider>,
    );
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
    expect(screen.getByText("dismiss")).toBeInTheDocument();
  });

  it("renders provider cards when providers are available", () => {
    const store = createMockStore({
      loading: false,
      providers: [
        {
          id: "openai",
          displayName: "OpenAI",
          description: "GPT models",
          enabled: true,
          hasKey: true,
          keyHint: "sk-1234",
          health: {
            status: "healthy",
            lastCheck: Date.now(),
            latencyMs: 42,
            error: null,
          },
          capabilities: ["chat", "completion"],
        },
      ],
    });
    render(
      <Provider store={store}>
        <AIHubPanel />
      </Provider>,
    );
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("GPT models")).toBeInTheDocument();
  });

  it("shows the Refresh button", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <AIHubPanel />
      </Provider>,
    );
    // There may be multiple "Refresh" texts (header button + empty state action)
    const refreshElements = screen.getAllByText("Refresh");
    expect(refreshElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Refreshing text when loading with existing providers", () => {
    const store = createMockStore({
      loading: true,
      providers: [
        {
          id: "openai",
          displayName: "OpenAI",
          description: "GPT models",
          enabled: true,
          hasKey: false,
          keyHint: null,
          health: {
            status: "untested",
            lastCheck: null,
            latencyMs: null,
            error: null,
          },
          capabilities: [],
        },
      ],
    });
    render(
      <Provider store={store}>
        <AIHubPanel />
      </Provider>,
    );
    expect(screen.getByText("Refreshing...")).toBeInTheDocument();
  });
});
