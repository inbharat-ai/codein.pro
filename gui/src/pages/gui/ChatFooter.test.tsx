import { render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

// Mock child components to isolate ChatFooter
vi.mock("../../components/BackgroundMode/BackgroundModeView", () => ({
  BackgroundModeView: ({ isCreatingAgent }: any) => (
    <div data-testid="background-mode">
      {isCreatingAgent ? "creating" : "idle"}
    </div>
  ),
}));

vi.mock("../../components/CliInstallBanner", () => ({
  CliInstallBanner: () => <div data-testid="cli-banner" />,
}));

vi.mock("../../components/config/FatalErrorNotice", () => ({
  FatalErrorIndicator: () => <div data-testid="fatal-error" />,
}));

vi.mock("../../components/mainInput/ContinueInputBox", () => ({
  default: () => <div data-testid="input-box" />,
}));

vi.mock("../../components/mainInput/belowMainInput/NewSessionButton", () => ({
  NewSessionButton: ({ children, ...props }: any) => (
    <div data-testid="new-session-btn" {...props}>
      {children}
    </div>
  ),
}));

vi.mock("../../components/VibeModeView", () => ({
  VibeModeView: () => <div data-testid="vibe-mode" />,
}));

vi.mock("../../components/VoicePanel", () => ({
  VoicePanel: () => <div data-testid="voice-panel" />,
}));

vi.mock("./EmptyChatBody", () => ({
  EmptyChatBody: () => <div data-testid="empty-chat-body" />,
}));

vi.mock("./ExploreDialogWatcher", () => ({
  ExploreDialogWatcher: () => <div data-testid="explore-dialog" />,
}));

vi.mock("../../redux/thunks/session", () => ({
  loadLastSession: vi.fn(),
}));

vi.mock("../../context/IdeMessenger", () => {
  const React = require("react");
  return {
    IdeMessengerContext: React.createContext({
      post: vi.fn(),
      request: vi.fn().mockResolvedValue({ status: "success", content: {} }),
    }),
  };
});

import { ChatFooter } from "./ChatFooter";

function createMockStore() {
  return configureStore({
    reducer: {
      session: (
        state = { history: [], mode: "chat", isInEdit: false, id: "s1" },
      ) => state,
      config: (state = {}) => state,
      ui: (state = { showDialog: false }) => state,
      editModeState: (state = { codeToEdit: [] }) => state,
    },
  });
}

const defaultProps = {
  sendInput: vi.fn(),
  allSessionMetadata: [],
  isStreaming: false,
  history: [] as any[],
  lastSessionId: undefined as string | undefined,
  isInEdit: false,
  hasDismissedExploreDialog: true,
  mode: "chat",
  isCreatingAgent: false,
  onboardingCard: { show: false },
};

function renderChatFooter(overrides = {}) {
  const store = createMockStore();
  const props = { ...defaultProps, ...overrides };
  return render(
    <Provider store={store}>
      <ChatFooter {...props} />
    </Provider>,
  );
}

describe("ChatFooter", () => {
  it("renders without crashing", () => {
    renderChatFooter();
    expect(screen.getByTestId("input-box")).toBeInTheDocument();
  });

  it("renders the CLI install banner", () => {
    renderChatFooter();
    expect(screen.getByTestId("cli-banner")).toBeInTheDocument();
  });

  it("shows empty chat body when history is empty and mode is chat", () => {
    renderChatFooter({ history: [], mode: "chat" });
    expect(screen.getByTestId("empty-chat-body")).toBeInTheDocument();
  });

  it("shows BackgroundModeView when mode is background", () => {
    renderChatFooter({ mode: "background", history: [{ id: "1" }] });
    expect(screen.getByTestId("background-mode")).toBeInTheDocument();
  });

  it("shows VibeModeView when mode is vibe", () => {
    renderChatFooter({ mode: "vibe", history: [{ id: "1" }] });
    expect(screen.getByTestId("vibe-mode")).toBeInTheDocument();
  });

  it("disables pointer events when streaming", () => {
    renderChatFooter({ isStreaming: true });
    const voicePanel = screen.getByTestId("voice-panel");
    const wrapper = voicePanel.closest("div[style]") as HTMLElement;
    expect(wrapper?.style.pointerEvents).toBe("none");
  });
});
