import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title when provided", () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByText("No items found")).toBeTruthy();
  });

  it("renders message when provided", () => {
    render(<EmptyState message="Try a different search." />);
    expect(screen.getByText("Try a different search.")).toBeTruthy();
  });

  it("renders description as fallback for message", () => {
    render(<EmptyState description="This is a description." />);
    expect(screen.getByText("This is a description.")).toBeTruthy();
  });

  it("prefers message over description", () => {
    render(
      <EmptyState message="Message text" description="Description text" />,
    );
    expect(screen.getByText("Message text")).toBeTruthy();
    expect(screen.queryByText("Description text")).toBeNull();
  });

  it("renders action button when provided", () => {
    const onClick = vi.fn();
    render(<EmptyState title="Empty" action={{ label: "Retry", onClick }} />);

    const button = screen.getByText("Retry");
    expect(button).toBeTruthy();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders icon when provided", () => {
    render(
      <EmptyState
        icon={<span data-testid="test-icon">icon</span>}
        title="Empty"
      />,
    );
    expect(screen.getByTestId("test-icon")).toBeTruthy();
  });

  it("renders without crashing when no props are provided", () => {
    const { container } = render(<EmptyState />);
    expect(container.firstChild).toBeTruthy();
  });
});
