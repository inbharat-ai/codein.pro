import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../util", () => ({
  getFontSize: () => 14,
}));

import { NewSessionButton } from "./NewSessionButton";

describe("NewSessionButton", () => {
  it("renders without crashing", () => {
    render(<NewSessionButton data-testid="btn">New Session</NewSessionButton>);
    expect(screen.getByTestId("btn")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(<NewSessionButton>Click me</NewSessionButton>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("applies codin-new-session-btn class", () => {
    render(<NewSessionButton data-testid="btn" />);
    expect(screen.getByTestId("btn").className).toContain(
      "codin-new-session-btn",
    );
  });

  it("merges custom className", () => {
    render(<NewSessionButton data-testid="btn" className="custom" />);
    const el = screen.getByTestId("btn");
    expect(el.className).toContain("codin-new-session-btn");
    expect(el.className).toContain("custom");
  });

  it("applies computed font size style", () => {
    render(<NewSessionButton data-testid="btn" />);
    expect(screen.getByTestId("btn").style.fontSize).toBe("12px"); // 14 - 2
  });

  it("handles click events", () => {
    const onClick = vi.fn();
    render(
      <NewSessionButton data-testid="btn" onClick={onClick}>
        Go
      </NewSessionButton>,
    );
    fireEvent.click(screen.getByTestId("btn"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
