import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("./IdeShell.css", () => ({}));

import { IdeShell } from "./IdeShell";

function renderIdeShell(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <IdeShell>
        <div data-testid="child-content">Hello</div>
      </IdeShell>
    </MemoryRouter>,
  );
}

describe("IdeShell", () => {
  it("renders without crashing", () => {
    renderIdeShell();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("renders the activity bar with navigation buttons", () => {
    renderIdeShell();
    // Top activities include chat, history, search, swarm, gpu, git, ai-hub, computer
    const buttons = screen.getAllByRole("button");
    // 8 top + 1 bottom (settings) = 9 buttons
    expect(buttons.length).toBeGreaterThanOrEqual(9);
  });

  it("renders the CodeIn logo", () => {
    renderIdeShell();
    expect(screen.getByTitle("CodeIn")).toBeInTheDocument();
  });

  it("renders status bar with ready indicator", () => {
    renderIdeShell();
    expect(screen.getByText("statusBar.ready")).toBeInTheDocument();
  });

  it("renders status bar tagline and version", () => {
    renderIdeShell();
    expect(screen.getByText("statusBar.tagline")).toBeInTheDocument();
    expect(screen.getByText("statusBar.version")).toBeInTheDocument();
  });

  it("renders children in the main content area", () => {
    renderIdeShell();
    const child = screen.getByTestId("child-content");
    expect(child).toHaveTextContent("Hello");
  });

  it("highlights the chat button as active on home route", () => {
    renderIdeShell("/");
    const chatBtn = screen.getByLabelText("activityBar.chat");
    expect(chatBtn.className).toContain("active");
  });

  it("highlights the settings button as active on config route", () => {
    renderIdeShell("/config");
    const settingsBtn = screen.getByLabelText("activityBar.settings");
    expect(settingsBtn.className).toContain("active");
  });

  it("shows tooltip on hover", () => {
    renderIdeShell();
    // Hover a non-active button (history is not active on the home route "/")
    // Tooltips are suppressed on the currently active item, so we use history
    const historyBtn = screen.getByLabelText("activityBar.history");
    fireEvent.mouseEnter(historyBtn);
    // Tooltip should appear with the i18n key
    expect(
      screen.getAllByText("activityBar.history").length,
    ).toBeGreaterThanOrEqual(1);
  });
});
