import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAgentFetch = vi.fn();

vi.mock("../util/agentConfig", () => ({
  agentFetch: (...args: any[]) => mockAgentFetch(...args),
}));

vi.mock("../context/IdeMessenger", () => {
  const React = require("react");
  const ctx = React.createContext({ workspacePath: "." });
  return {
    IdeMessengerContext: ctx,
  };
});

import { EnhancedRunPanel } from "./EnhancedRunPanel";

describe("EnhancedRunPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing and shows detecting state", () => {
    mockAgentFetch.mockResolvedValue({
      json: () => Promise.resolve({ project: null }),
    });

    render(<EnhancedRunPanel />);
    expect(screen.getByText("Detecting project...")).toBeInTheDocument();
  });

  it("shows project info after detection", async () => {
    mockAgentFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          project: {
            root: "/workspace",
            type: "node",
            profile: {
              installCmd: "npm install",
              runCmd: "npm start",
              port: 3000,
              cwd: "/workspace",
              env: {},
            },
          },
        }),
    });

    render(<EnhancedRunPanel />);

    await waitFor(() => {
      expect(screen.getByText("Run & Preview")).toBeInTheDocument();
    });

    expect(screen.getByText(/Detected: node project/)).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText(/npm install/)).toBeInTheDocument();
    expect(screen.getByText(/npm start/)).toBeInTheDocument();
    expect(screen.getByText(/3000/)).toBeInTheDocument();
  });

  it("shows Start button when status is stopped", async () => {
    mockAgentFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          project: {
            root: ".",
            type: "python",
            profile: {
              installCmd: null,
              runCmd: "python app.py",
              port: 8000,
              cwd: ".",
              env: {},
            },
          },
        }),
    });

    render(<EnhancedRunPanel />);

    await waitFor(() => {
      expect(screen.getByText("Start")).toBeInTheDocument();
    });
  });

  it("shows Install Dependencies button when installCmd is present", async () => {
    mockAgentFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          project: {
            root: ".",
            type: "node",
            profile: {
              installCmd: "npm install",
              runCmd: "npm start",
              port: 3000,
              cwd: ".",
              env: {},
            },
          },
        }),
    });

    render(<EnhancedRunPanel />);

    await waitFor(() => {
      expect(screen.getByText("Install Dependencies")).toBeInTheDocument();
    });
  });

  it("handles failed project detection gracefully", async () => {
    mockAgentFetch.mockRejectedValue(new Error("Network error"));

    render(<EnhancedRunPanel />);

    // Should show the detection failed empty state
    await waitFor(() => {
      expect(screen.getByText("Detection Failed")).toBeInTheDocument();
    });
  });
});
