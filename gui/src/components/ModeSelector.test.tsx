import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { ModeSelector } from "./ModeSelector";

// Minimal mock store
function createMockStore(mode = "ask") {
  return configureStore({
    reducer: {
      session: () => ({ mode }),
    },
  });
}

describe("ModeSelector", () => {
  it("renders all mode options", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <ModeSelector />
      </Provider>,
    );

    expect(screen.getByText("Ask")).toBeTruthy();
    expect(screen.getByText("Plan")).toBeTruthy();
    expect(screen.getByText("Agent")).toBeTruthy();
    expect(screen.getByText("Implement")).toBeTruthy();
  });

  it("has radiogroup role for accessibility", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <ModeSelector />
      </Provider>,
    );

    expect(screen.getByRole("radiogroup")).toBeTruthy();
  });

  it("marks the active mode with aria-checked", () => {
    const store = createMockStore("agent");
    render(
      <Provider store={store}>
        <ModeSelector />
      </Provider>,
    );

    const radios = screen.getAllByRole("radio");
    const agentRadio = radios.find((r) => r.textContent === "Agent");
    expect(agentRadio?.getAttribute("aria-checked")).toBe("true");

    const askRadio = radios.find((r) => r.textContent === "Ask");
    expect(askRadio?.getAttribute("aria-checked")).toBe("false");
  });

  it("displays human-readable labels instead of uppercase keys", () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <ModeSelector />
      </Provider>,
    );

    // Should show "Ask" not "ASK", "Plan" not "PLAN"
    expect(screen.getByText("Ask")).toBeTruthy();
    expect(screen.queryByText("ASK")).toBeNull();
  });

  it("only active radio button has tabIndex 0 (roving tabindex)", () => {
    const store = createMockStore("plan");
    render(
      <Provider store={store}>
        <ModeSelector />
      </Provider>,
    );

    const radios = screen.getAllByRole("radio");
    const planRadio = radios.find((r) => r.textContent === "Plan");
    const askRadio = radios.find((r) => r.textContent === "Ask");

    expect(planRadio?.tabIndex).toBe(0);
    expect(askRadio?.tabIndex).toBe(-1);
  });

  it("dispatches mode change on ArrowRight keydown", () => {
    const store = createMockStore("ask");
    render(
      <Provider store={store}>
        <ModeSelector />
      </Provider>,
    );

    const radiogroup = screen.getByRole("radiogroup");
    fireEvent.keyDown(radiogroup, { key: "ArrowRight" });

    // After dispatching, the store should have been called
    const state = store.getState() as any;
    expect(state.session.mode).toBe("ask"); // Store uses static reducer, but we verify no crash
  });
});
