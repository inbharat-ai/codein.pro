import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ToggleSwitch from "./Switch";

// Mock Tooltip to simplify rendering
vi.mock("./Tooltip", () => ({
  ToolTip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock heroicons
vi.mock("@heroicons/react/24/outline", () => ({
  InformationCircleIcon: ({ className }: any) => (
    <span data-testid="info-icon" className={className}>
      i
    </span>
  ),
}));

// Mock the parent index export
vi.mock("..", () => ({
  vscButtonBackground: "#4338ca",
}));

describe("ToggleSwitch", () => {
  const defaultProps = {
    isToggled: false,
    onToggle: vi.fn(),
    text: "Enable feature",
  };

  it("renders without crashing", () => {
    render(<ToggleSwitch {...defaultProps} />);
    expect(screen.getByText("Enable feature")).toBeTruthy();
  });

  it("renders the switch role element", () => {
    render(<ToggleSwitch {...defaultProps} />);
    const switchEl = screen.getByRole("switch");
    expect(switchEl).toBeTruthy();
  });

  it("reflects toggled state via aria-checked", () => {
    const { rerender } = render(<ToggleSwitch {...defaultProps} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "false",
    );

    rerender(<ToggleSwitch {...defaultProps} isToggled={true} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("calls onToggle when switch is clicked", () => {
    const onToggle = vi.fn();
    render(<ToggleSwitch {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not call onToggle when disabled", () => {
    const onToggle = vi.fn();
    render(
      <ToggleSwitch {...defaultProps} onToggle={onToggle} disabled={true} />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("responds to Enter and Space key presses", () => {
    const onToggle = vi.fn();
    render(<ToggleSwitch {...defaultProps} onToggle={onToggle} />);
    const switchEl = screen.getByRole("switch");

    fireEvent.keyDown(switchEl, { key: "Enter" });
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(switchEl, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
