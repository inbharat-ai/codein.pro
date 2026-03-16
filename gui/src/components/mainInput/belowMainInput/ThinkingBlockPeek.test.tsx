import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../AnimatedEllipsis", () => ({
  AnimatedEllipsis: () => <span data-testid="ellipsis">...</span>,
}));

vi.mock("../../StyledMarkdownPreview", () => ({
  default: ({ source }: any) => (
    <div data-testid="markdown-preview">{source}</div>
  ),
}));

vi.mock("../../ui", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

import ThinkingBlockPeek from "./ThinkingBlockPeek";

const baseProps = {
  content: "Analyzing the problem...",
  index: 0,
  prevItem: null,
  inProgress: false,
};

describe("ThinkingBlockPeek", () => {
  it("renders without crashing", () => {
    render(<ThinkingBlockPeek {...baseProps} />);
    expect(screen.getByTestId("thinking-block-peek")).toBeInTheDocument();
  });

  it('shows "Thought" when not in progress', () => {
    render(<ThinkingBlockPeek {...baseProps} />);
    expect(screen.getByTestId("thinking-block-peek").textContent).toContain(
      "Thought",
    );
  });

  it('shows "Thinking" with ellipsis when in progress', () => {
    render(<ThinkingBlockPeek {...baseProps} inProgress={true} />);
    expect(screen.getByTestId("thinking-block-peek").textContent).toContain(
      "Thinking",
    );
    expect(screen.getByTestId("ellipsis")).toBeInTheDocument();
  });

  it("toggles content visibility on click", () => {
    render(<ThinkingBlockPeek {...baseProps} />);
    const btn = screen.getByTestId("thinking-block-peek");

    // Initially collapsed (aria-expanded false)
    expect(btn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it('shows "Redacted Thinking" for redacted blocks', () => {
    render(
      <ThinkingBlockPeek {...baseProps} redactedThinking="redacted content" />,
    );
    expect(screen.getByText("Redacted Thinking")).toBeInTheDocument();
  });

  it("shows redaction notice instead of markdown when expanded", () => {
    render(
      <ThinkingBlockPeek {...baseProps} redactedThinking="redacted content" />,
    );
    fireEvent.click(screen.getByTestId("thinking-block-peek"));
    expect(
      screen.getByText("Thinking content redacted due to safety reasons."),
    ).toBeInTheDocument();
  });

  it("returns null for duplicate redacted thinking blocks", () => {
    const prevItem = {
      message: { role: "thinking", redactedThinking: "prev redacted" },
    } as any;
    const { container } = render(
      <ThinkingBlockPeek
        {...baseProps}
        redactedThinking="also redacted"
        prevItem={prevItem}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
