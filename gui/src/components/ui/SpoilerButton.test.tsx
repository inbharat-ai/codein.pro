import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../util", () => ({
  getFontSize: () => 16,
}));

import { SpoilerButton, ButtonContent } from "./SpoilerButton";

describe("SpoilerButton", () => {
  it("renders without crashing", () => {
    render(<SpoilerButton data-testid="spoiler">Reveal</SpoilerButton>);
    expect(screen.getByTestId("spoiler")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(<SpoilerButton>Hidden text</SpoilerButton>);
    expect(screen.getByText("Hidden text")).toBeInTheDocument();
  });

  it("applies codin-spoiler-button class", () => {
    render(<SpoilerButton data-testid="spoiler" />);
    expect(screen.getByTestId("spoiler").className).toContain(
      "codin-spoiler-button",
    );
  });

  it("merges custom className", () => {
    render(<SpoilerButton data-testid="spoiler" className="extra" />);
    const el = screen.getByTestId("spoiler");
    expect(el.className).toContain("codin-spoiler-button");
    expect(el.className).toContain("extra");
  });

  it("applies computed font size (getFontSize - 2)", () => {
    render(<SpoilerButton data-testid="spoiler" />);
    expect(screen.getByTestId("spoiler").style.fontSize).toBe("14px");
  });

  it("handles click events", () => {
    const onClick = vi.fn();
    render(
      <SpoilerButton data-testid="spoiler" onClick={onClick}>
        Click
      </SpoilerButton>,
    );
    fireEvent.click(screen.getByTestId("spoiler"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("ButtonContent", () => {
  it("renders with codin-button-content class", () => {
    render(<ButtonContent data-testid="content">Inner</ButtonContent>);
    const el = screen.getByTestId("content");
    expect(el.className).toContain("codin-button-content");
    expect(el.textContent).toBe("Inner");
  });
});
