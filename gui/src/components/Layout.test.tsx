import { render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// Mock heavy dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("./IdeShell.css", () => ({}));

vi.mock("../context/IdeMessenger", () => {
  const React = require("react");
  const mockMessenger = {
    post: vi.fn(),
    request: vi.fn().mockResolvedValue({
      status: "success",
      content: { AUTH_TYPE: "local" },
    }),
    ide: { subprocess: vi.fn() },
    llmStreamChat: vi.fn(),
    respond: vi.fn(),
    send: vi.fn(),
  };
  return {
    IdeMessengerContext: React.createContext(mockMessenger),
  };
});

vi.mock("../context/Auth", () => ({
  AuthProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock("../context/LocalStorage", () => ({
  LocalStorageProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock("../hooks/TelemetryProviders", () => ({
  default: ({ children }: any) => <>{children}</>,
}));

vi.mock("../hooks/useWebviewListener", () => ({
  useWebviewListener: vi.fn(),
}));

vi.mock("./mainInput/TipTapEditor", () => ({
  useMainEditor: () => ({ mainEditor: null }),
}));

vi.mock("./OnboardingCard", () => ({
  isNewUserOnboarding: () => false,
  OnboardingCard: () => null,
  useOnboardingCard: () => ({
    open: vi.fn(),
    setActiveTab: vi.fn(),
  }),
  defaultOnboardingCardState: {
    open: false,
    activeTab: undefined,
  },
}));

vi.mock("./OSRContextMenu", () => ({
  default: () => null,
}));

vi.mock("./PosthogPageView", () => ({
  default: () => null,
}));

vi.mock("./config/FatalErrorNotice", () => ({
  FatalErrorIndicator: () => null,
}));

vi.mock("./dialogs", () => ({
  default: () => null,
}));

vi.mock("./GenerateRuleDialog", () => ({
  GenerateRuleDialog: () => null,
}));

vi.mock("../redux/thunks/edit", () => ({
  enterEdit: vi.fn(),
  exitEdit: vi.fn(),
}));

vi.mock("../redux/thunks/session", () => ({
  saveCurrentSession: vi.fn(),
}));

import Layout from "./Layout";

function createMockStore() {
  return configureStore({
    reducer: {
      session: (
        state = {
          history: [],
          id: "test",
          lastSessionId: null,
          title: "test",
          mode: "chat",
          isStreaming: false,
          isInEdit: false,
        },
      ) => state,
      ui: (
        state = {
          dialogMessage: null,
          showDialog: false,
        },
      ) => state,
      editModeState: (state = { codeToEdit: [] }) => state,
      config: (
        state = {
          config: {
            selectedModelByRole: {
              chat: { title: "Claude", model: "claude-3-opus" },
            },
          },
        },
      ) => state,
      indexing: (state = {}) => state,
      tabs: (state = {}) => state,
      profiles: (state = {}) => state,
      swarm: (state = {}) => state,
      aiHub: (
        state = {
          providers: [],
          models: {},
          loading: false,
          error: null,
        },
      ) => state,
      computer: (state = {}) => state,
      workspace: (
        state = {
          workspacePath: null,
          expandedDirs: [],
          openFiles: [],
          activeFilePath: null,
          terminalVisible: false,
          sidebarVisible: false,
          chatPanelVisible: false,
        },
      ) => state,
    },
  });
}

function renderLayout(route = "/") {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<div data-testid="home-page">Home</div>} />
            <Route
              path="/config"
              element={<div data-testid="config-page">Config</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("Layout", () => {
  it("renders without crashing", () => {
    renderLayout();
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });

  it("renders the IdeShell wrapper", () => {
    renderLayout();
    // IdeShell renders a div with class ide-shell
    const ideShell = document.querySelector(".ide-shell");
    expect(ideShell).toBeInTheDocument();
  });

  it("renders child routes via Outlet", () => {
    renderLayout("/");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders config route correctly", () => {
    renderLayout("/config");
    expect(screen.getByText("Config")).toBeInTheDocument();
  });

  it("renders the tooltip portal div", () => {
    renderLayout();
    const portal = document.getElementById("tooltip-portal-div");
    expect(portal).toBeInTheDocument();
  });
});
