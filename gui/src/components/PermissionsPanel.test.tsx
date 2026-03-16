import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAgentFetch = vi.fn();

vi.mock("../util/agentConfig", () => ({
  agentFetch: (...args: any[]) => mockAgentFetch(...args),
}));

vi.mock("./panels.css", () => ({}));

import PermissionsPanel from "./PermissionsPanel";

function mockSuccessfulLoad(
  queue: any[] = [],
  summary: Record<string, any> = {},
) {
  mockAgentFetch.mockImplementation((url: string) => {
    if (url.includes("/permissions/queue")) {
      return Promise.resolve({
        json: () => Promise.resolve({ queue }),
      });
    }
    if (url.includes("/permissions/summary")) {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            workspace: ".",
            extendedAccess: false,
            allowedTools: [],
            deniedTools: [],
            ...summary,
          }),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("PermissionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    mockAgentFetch.mockImplementation(() => new Promise(() => {}));
    render(<PermissionsPanel />);
    expect(screen.getByText("System Permissions")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockAgentFetch.mockImplementation(() => new Promise(() => {}));
    render(<PermissionsPanel />);
    expect(screen.getByText("Loading permissions...")).toBeInTheDocument();
  });

  it("shows workspace input and refresh button", () => {
    mockAgentFetch.mockImplementation(() => new Promise(() => {}));
    render(<PermissionsPanel />);
    expect(screen.getByPlaceholderText("Workspace path")).toBeInTheDocument();
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  it("shows empty queue message when no pending requests", async () => {
    mockSuccessfulLoad([], { extendedAccess: false });

    render(<PermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByText("No pending permissions")).toBeInTheDocument();
    });
  });

  it("shows policy summary after loading", async () => {
    mockSuccessfulLoad([], {
      workspace: "/my-project",
      extendedAccess: true,
      allowedTools: ["readFile", "writeFile"],
      deniedTools: ["execCommand"],
    });

    render(<PermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Policy Summary")).toBeInTheDocument();
      expect(screen.getByText(/Extended Access: Enabled/)).toBeInTheDocument();
      expect(screen.getByText(/Always Allowed Tools: 2/)).toBeInTheDocument();
      expect(screen.getByText(/Denied Tools: 1/)).toBeInTheDocument();
    });
  });

  it("shows error state when loading fails", async () => {
    mockAgentFetch.mockRejectedValue(new Error("Connection refused"));

    render(<PermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Connection refused")).toBeInTheDocument();
    });
  });

  it("renders pending permission requests", async () => {
    mockSuccessfulLoad([
      {
        requestId: "req-1",
        toolName: "writeFile",
        category: "filesystem",
        intent: "Write to config.json",
        risk: "medium",
      },
    ]);

    render(<PermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByText("writeFile")).toBeInTheDocument();
      expect(screen.getByText("Pending Consent")).toBeInTheDocument();
      expect(screen.getByText("Write to config.json")).toBeInTheDocument();
      expect(screen.getByText("Allow")).toBeInTheDocument();
      expect(screen.getByText("Deny")).toBeInTheDocument();
    });
  });

  it("shows Grant and Revoke Extended Access buttons", async () => {
    mockSuccessfulLoad();

    render(<PermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Grant Extended Access")).toBeInTheDocument();
      expect(screen.getByText("Revoke Extended Access")).toBeInTheDocument();
    });
  });

  it("shows Reset Policy button", async () => {
    mockSuccessfulLoad();

    render(<PermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Reset Policy")).toBeInTheDocument();
    });
  });

  it("calls API when Allow button is clicked", async () => {
    mockSuccessfulLoad([
      {
        requestId: "req-1",
        toolName: "readFile",
        intent: "Read package.json",
      },
    ]);

    render(<PermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Allow")).toBeInTheDocument();
    });

    mockAgentFetch.mockClear();
    mockSuccessfulLoad(); // for the refresh after respond

    fireEvent.click(screen.getByText("Allow"));

    await waitFor(() => {
      expect(mockAgentFetch).toHaveBeenCalledWith(
        "/permissions/respond",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ requestId: "req-1", response: true }),
        }),
      );
    });
  });

  it("calls API when Deny button is clicked", async () => {
    mockSuccessfulLoad([
      {
        requestId: "req-2",
        toolName: "execCommand",
        intent: "Run rm -rf",
      },
    ]);

    render(<PermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Deny")).toBeInTheDocument();
    });

    mockAgentFetch.mockClear();
    mockSuccessfulLoad();

    fireEvent.click(screen.getByText("Deny"));

    await waitFor(() => {
      expect(mockAgentFetch).toHaveBeenCalledWith(
        "/permissions/respond",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ requestId: "req-2", response: false }),
        }),
      );
    });
  });
});
