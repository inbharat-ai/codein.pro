import { fireEvent, render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

vi.mock("./VoicePanel.css", () => ({}));

import { VoicePanel } from "./VoicePanel";

function createMockStore() {
  return configureStore({
    reducer: {
      session: (
        state = {
          history: [],
          id: "test",
          lastSessionId: null,
          title: "test",
          mode: "chat",
          isInEdit: false,
        },
      ) => state,
    },
  });
}

function renderVoicePanel() {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      <VoicePanel />
    </Provider>,
  );
}

describe("VoicePanel", () => {
  it("renders without crashing", () => {
    renderVoicePanel();
    expect(screen.getByTitle("Voice Input")).toBeInTheDocument();
  });

  it("shows the voice trigger button with label", () => {
    renderVoicePanel();
    expect(screen.getByText("Voice")).toBeInTheDocument();
  });

  it("opens the panel when trigger button is clicked", () => {
    renderVoicePanel();
    fireEvent.click(screen.getByTitle("Voice Input"));
    expect(screen.getByText(/Voice Assistant/)).toBeInTheDocument();
  });

  it("shows language selector when panel is open", () => {
    renderVoicePanel();
    fireEvent.click(screen.getByTitle("Voice Input"));
    expect(screen.getByText("Language")).toBeInTheDocument();
    // Should show Indian language options
    expect(screen.getByText(/हिन्दी/)).toBeInTheDocument();
    expect(screen.getByText(/English \(India\)/)).toBeInTheDocument();
  });

  it("shows transcript placeholder when panel is open", () => {
    renderVoicePanel();
    fireEvent.click(screen.getByTitle("Voice Input"));
    expect(screen.getByText("Transcript")).toBeInTheDocument();
    expect(
      screen.getByText("Your speech will appear here..."),
    ).toBeInTheDocument();
  });

  it("shows Send to Chat button when panel is open", () => {
    renderVoicePanel();
    fireEvent.click(screen.getByTitle("Voice Input"));
    expect(screen.getByText(/Send to Chat/)).toBeInTheDocument();
  });

  it("Send to Chat button is disabled when no transcript", () => {
    renderVoicePanel();
    fireEvent.click(screen.getByTitle("Voice Input"));
    const sendBtn = screen.getByTitle("Send to chat");
    expect(sendBtn).toBeDisabled();
  });

  it("closes the panel when close button is clicked", () => {
    renderVoicePanel();
    fireEvent.click(screen.getByTitle("Voice Input"));
    expect(screen.getByText(/Voice Assistant/)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Close"));
    expect(screen.queryByText(/Voice Assistant/)).not.toBeInTheDocument();
  });

  it("closes the panel when backdrop is clicked", () => {
    renderVoicePanel();
    fireEvent.click(screen.getByTitle("Voice Input"));
    expect(screen.getByText(/Voice Assistant/)).toBeInTheDocument();

    // Backdrop click
    const backdrop = document.querySelector(".voice-panel-backdrop");
    if (backdrop) {
      fireEvent.click(backdrop);
    }
    expect(screen.queryByText(/Voice Assistant/)).not.toBeInTheDocument();
  });

  it("shows recording controls", () => {
    renderVoicePanel();
    fireEvent.click(screen.getByTitle("Voice Input"));
    // Either the Start Recording button or a warning about unsupported browser
    const hasRecordBtn = screen.queryByText("Start Recording");
    const hasWarning = screen.queryByText(/Speech recognition not available/);
    expect(hasRecordBtn || hasWarning).toBeTruthy();
  });
});
