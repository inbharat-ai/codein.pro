import { render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

// Mock child components
vi.mock("../../components/gui/TimelineItem", () => ({
  default: ({ children }: any) => (
    <div data-testid="timeline-item">{children}</div>
  ),
}));

vi.mock("../../components/mainInput/belowMainInput/ThinkingBlockPeek", () => ({
  default: ({ content }: any) => (
    <div data-testid="thinking-block">{content}</div>
  ),
}));

vi.mock("../../components/mainInput/ContinueInputBox", () => ({
  default: (props: any) => <div data-testid="input-box" />,
}));

vi.mock("../../components/StepContainer", () => ({
  default: ({ index }: any) => <div data-testid={`step-container-${index}`} />,
}));

vi.mock("./ToolCallDiv", () => ({
  ToolCallDiv: ({ historyIndex }: any) => (
    <div data-testid={`tool-call-${historyIndex}`} />
  ),
}));

vi.mock("core/util/messageContent", () => ({
  renderChatMessage: (msg: any) =>
    typeof msg.content === "string" ? msg.content : "rendered",
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

import { ChatHistoryItemRenderer } from "./ChatHistoryItemRenderer";

function createMockStore() {
  return configureStore({
    reducer: {
      session: (state = { history: [], mode: "chat", id: "s1" }) => state,
      config: (state = {}) => state,
      ui: (state = {}) => state,
      editModeState: (state = { codeToEdit: [] }) => state,
    },
  });
}

function makeItem(
  role: string,
  content = "hello",
  extras: Record<string, any> = {},
) {
  return {
    message: { role, content, id: `msg-${role}` },
    editorState: null,
    contextItems: [],
    appliedRules: [],
    toolCallStates: undefined,
    ...extras,
  } as any;
}

const baseProps = {
  history: [] as any[],
  stepsOpen: [] as (boolean | undefined)[],
  isStreaming: false,
  sendInput: vi.fn(),
  isLastUserInput: () => false,
};

function renderItem(item: any, index = 0, overrides: Record<string, any> = {}) {
  const history = overrides.history ?? [item];
  const store = createMockStore();
  return render(
    <Provider store={store}>
      <ChatHistoryItemRenderer
        item={item}
        index={index}
        {...baseProps}
        history={history}
        {...overrides}
      />
    </Provider>,
  );
}

describe("ChatHistoryItemRenderer", () => {
  it("renders user message as ContinueInputBox", () => {
    renderItem(makeItem("user"));
    expect(screen.getByTestId("input-box")).toBeInTheDocument();
  });

  it("renders assistant message with TimelineItem and StepContainer", () => {
    renderItem(makeItem("assistant"));
    expect(screen.getByTestId("timeline-item")).toBeInTheDocument();
    expect(screen.getByTestId("step-container-0")).toBeInTheDocument();
  });

  it("returns null for tool messages", () => {
    const { container } = renderItem(makeItem("tool"));
    expect(container.innerHTML).toBe("");
  });

  it("renders thinking message as ThinkingBlockPeek", () => {
    renderItem(makeItem("thinking", "pondering..."));
    expect(screen.getByTestId("thinking-block")).toBeInTheDocument();
    expect(screen.getByText("pondering...")).toBeInTheDocument();
  });

  it("renders ToolCallDiv when toolCallStates exist on assistant", () => {
    const item = makeItem("assistant", "hi", {
      toolCallStates: [{ id: "tc1" }],
    });
    renderItem(item);
    expect(screen.getByTestId("tool-call-0")).toBeInTheDocument();
  });

  it("applies opacity to thinking blocks before latest summary", () => {
    const summary = makeItem("assistant", "summary", {
      conversationSummary: true,
    });
    const thinking = makeItem("thinking", "old thought");
    const history = [thinking, summary];

    const { container } = renderItem(thinking, 0, { history });
    const opacityDiv = container.querySelector(".opacity-50");
    expect(opacityDiv).toBeInTheDocument();
  });
});
