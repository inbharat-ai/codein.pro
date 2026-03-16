import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

// Use vi.hoisted so the mock fn is available at vi.mock hoist time
const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn(),
}));

// Mock IdeMessengerContext
vi.mock("../context/IdeMessenger", () => ({
  IdeMessengerContext: {
    _currentValue: { post: mockPost, request: vi.fn() },
  },
}));

// Mock HeaderButtonWithToolTip to make testing easier
vi.mock("./gui/HeaderButtonWithToolTip", () => ({
  default: ({ text, onClick, children }: any) => (
    <button aria-label={text} onClick={onClick}>
      {children}
    </button>
  ),
}));

// Mock heroicons
vi.mock("@heroicons/react/24/outline", () => ({
  HandThumbUpIcon: ({ className }: any) => (
    <span data-testid="thumbs-up" className={className}>
      up
    </span>
  ),
  HandThumbDownIcon: ({ className }: any) => (
    <span data-testid="thumbs-down" className={className}>
      down
    </span>
  ),
}));

import { FeedbackButtons } from "./FeedbackButtons";

function createMockStore() {
  return configureStore({
    reducer: {
      session: () => ({ id: "test-session-id" }),
    },
  });
}

const mockItem = {
  message: { role: "assistant" as const, content: "Hello" },
  promptLogs: [
    {
      modelTitle: "gpt-4",
      modelProvider: "openai",
      prompt: "test",
      completion: "test",
    },
  ],
};

describe("FeedbackButtons", () => {
  beforeEach(() => {
    mockPost.mockClear();
  });

  it("renders without crashing", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <FeedbackButtons item={mockItem as any} />
      </Provider>,
    );
    expect(screen.getByTestId("thumbs-up")).toBeTruthy();
    expect(screen.getByTestId("thumbs-down")).toBeTruthy();
  });

  it("renders Helpful and Unhelpful buttons", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <FeedbackButtons item={mockItem as any} />
      </Provider>,
    );
    expect(screen.getByLabelText("Helpful")).toBeTruthy();
    expect(screen.getByLabelText("Unhelpful")).toBeTruthy();
  });

  it("sends positive feedback on thumbs up click", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <FeedbackButtons item={mockItem as any} />
      </Provider>,
    );
    fireEvent.click(screen.getByLabelText("Helpful"));
    expect(mockPost).toHaveBeenCalledWith(
      "devdata/log",
      expect.objectContaining({
        name: "chatFeedback",
        data: expect.objectContaining({ feedback: true }),
      }),
    );
  });

  it("sends negative feedback on thumbs down click", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <FeedbackButtons item={mockItem as any} />
      </Provider>,
    );
    fireEvent.click(screen.getByLabelText("Unhelpful"));
    expect(mockPost).toHaveBeenCalledWith(
      "devdata/log",
      expect.objectContaining({
        name: "chatFeedback",
        data: expect.objectContaining({ feedback: false }),
      }),
    );
  });

  it("does not send feedback when promptLogs is empty", () => {
    const store = createMockStore();
    const itemNoLogs = {
      message: { role: "assistant" as const, content: "Hello" },
      promptLogs: [],
    };
    render(
      <Provider store={store}>
        <FeedbackButtons item={itemNoLogs as any} />
      </Provider>,
    );
    fireEvent.click(screen.getByLabelText("Helpful"));
    expect(mockPost).not.toHaveBeenCalled();
  });
});
