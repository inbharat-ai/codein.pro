import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TimelineItem from "./TimelineItem";

// Mock heroicons
vi.mock("@heroicons/react/24/outline", () => ({
  ChatBubbleOvalLeftIcon: (props: any) => (
    <span data-testid="chat-icon" {...props}>
      icon
    </span>
  ),
}));

// Mock styled-components and parent index
vi.mock("..", () => ({
  lightGray: "#8b88ad",
}));

// Mock getFontSize
vi.mock("../../util", () => ({
  getFontSize: () => 14,
}));

const mockItem = {
  message: { role: "assistant" as const, content: "Hello world" },
};

describe("TimelineItem", () => {
  const defaultProps = {
    item: mockItem as any,
    open: false,
    onToggle: vi.fn(),
    children: <div data-testid="child-content">Expanded content</div>,
  };

  it("renders without crashing", () => {
    render(<TimelineItem {...defaultProps} />);
    // Should show collapsed view
    expect(screen.getByText("assistant Message")).toBeTruthy();
  });

  it("shows children when open is true", () => {
    render(<TimelineItem {...defaultProps} open={true} />);
    expect(screen.getByTestId("child-content")).toBeTruthy();
    expect(screen.getByText("Expanded content")).toBeTruthy();
  });

  it("shows collapsed state with role label when open is false", () => {
    render(<TimelineItem {...defaultProps} open={false} />);
    expect(screen.getByText("assistant Message")).toBeTruthy();
    expect(screen.queryByTestId("child-content")).toBeNull();
  });

  it("shows default chat icon in collapsed state", () => {
    render(<TimelineItem {...defaultProps} open={false} />);
    expect(screen.getByTestId("chat-icon")).toBeTruthy();
  });

  it("uses custom icon when iconElement is provided", () => {
    render(
      <TimelineItem
        {...defaultProps}
        open={false}
        iconElement={<span data-testid="custom-icon">custom</span>}
      />,
    );
    expect(screen.getByTestId("custom-icon")).toBeTruthy();
    expect(screen.queryByTestId("chat-icon")).toBeNull();
  });

  it("calls onToggle when collapse button is clicked", () => {
    const onToggle = vi.fn();
    render(<TimelineItem {...defaultProps} onToggle={onToggle} />);
    // Click on the collapse/expand button area (the div wrapping the icon)
    const icon = screen.getByTestId("chat-icon");
    fireEvent.click(icon.parentElement!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
