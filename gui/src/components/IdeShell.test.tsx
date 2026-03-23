import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("./IdeShell.css", () => ({}));

import { IdeShell } from "./IdeShell";

function createMockStore() {
  return configureStore({
    reducer: {
      session: () => ({
        mode: "ask",
        isStreaming: false,
      }),
      config: () => ({
        config: {
          selectedModelByRole: {
            chat: { title: "Claude", model: "claude-3-opus" },
          },
        },
      }),
    },
  });
}

function renderIdeShell(route = "/") {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <IdeShell>
          <div data-testid="child-content">Hello</div>
        </IdeShell>
      </MemoryRouter>
    </Provider>,
  );
}

describe("IdeShell", () => {
  it("renders without crashing", () => {
    renderIdeShell();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("renders the activity bar with navigation buttons", () => {
    renderIdeShell();
    // Core (2) + Tools (3) + More toggle (1) + Settings (1) = 7 visible buttons minimum
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(7);
  });

  it("renders the CodeIn logo", () => {
    renderIdeShell();
    expect(document.querySelector(".ide-logo")).toBeInTheDocument();
  });

  it("renders live status bar with Ready indicator and mode", () => {
    renderIdeShell();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Ask")).toBeInTheDocument();
  });

  it("renders status bar version", () => {
    renderIdeShell();
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

  it("shows tooltip on hover for non-active button", () => {
    renderIdeShell();
    const historyBtn = screen.getByLabelText("activityBar.history");
    fireEvent.mouseEnter(historyBtn);
    expect(
      screen.getAllByText("activityBar.history").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("expands advanced section when More button is clicked", () => {
    renderIdeShell();
    // GPU should not be visible initially
    expect(screen.queryByLabelText("activityBar.gpu")).not.toBeInTheDocument();

    // Click the "More panels" toggle
    const moreBtn = screen.getByLabelText("Show more panels");
    fireEvent.click(moreBtn);

    // GPU should now be visible
    expect(screen.getByLabelText("activityBar.gpu")).toBeInTheDocument();
  });
});
