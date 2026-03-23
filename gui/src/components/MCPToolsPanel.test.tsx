import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MCPToolsPanel } from "./MCPToolsPanel";

// Mock agentFetch
const mockAgentFetch = vi.fn();
vi.mock("../util/agentConfig", () => ({
  agentFetch: (...args: any[]) => mockAgentFetch(...args),
}));

// Mock IdeMessengerContext
vi.mock("../context/IdeMessenger", () => ({
  IdeMessengerContext: {
    _currentValue: { post: vi.fn(), request: vi.fn() },
  },
}));

function mockFetchResponses(responses: Record<string, any>) {
  mockAgentFetch.mockImplementation((url: string) => {
    for (const [pattern, data] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return Promise.resolve({ json: () => Promise.resolve(data) });
      }
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("MCPToolsPanel", () => {
  beforeEach(() => {
    mockAgentFetch.mockReset();
    mockFetchResponses({
      "/mcp/servers": { servers: [] },
      "/mcp/tools": { tools: [] },
      "/mcp/activity": { activity: [] },
    });
  });

  it("renders without crashing", async () => {
    render(<MCPToolsPanel />);
    expect(screen.getByText("MCP Servers")).toBeTruthy();
  });

  it("shows empty state when no servers are configured", async () => {
    render(<MCPToolsPanel />);
    await waitFor(() => {
      expect(screen.getByText("No MCP servers configured")).toBeTruthy();
    });
  });

  it("shows Add Server button", () => {
    render(<MCPToolsPanel />);
    expect(screen.getByText("Add Server")).toBeTruthy();
  });

  it("toggles add server form on button click", () => {
    render(<MCPToolsPanel />);
    fireEvent.click(screen.getByText("Add Server"));
    expect(screen.getByPlaceholderText("Server name")).toBeTruthy();
    expect(
      screen.getByPlaceholderText(
        "Command (e.g., npx @modelcontextprotocol/server-filesystem)",
      ),
    ).toBeTruthy();
  });

  it("renders servers when returned from API", async () => {
    mockFetchResponses({
      "/mcp/servers": {
        servers: [
          {
            name: "test-server",
            status: "connected",
            toolsCount: 3,
            config: {},
          },
        ],
      },
      "/mcp/tools": { tools: [] },
      "/mcp/activity": { activity: [] },
    });

    render(<MCPToolsPanel />);
    await waitFor(() => {
      expect(screen.getByText("test-server")).toBeTruthy();
      expect(screen.getByText("connected • 3 tools")).toBeTruthy();
    });
  });

  it("toggles activity panel visibility", () => {
    render(<MCPToolsPanel />);
    const btn = screen.getByText("Show Activity");
    fireEvent.click(btn);
    expect(screen.getByText("Recent Activity")).toBeTruthy();
    expect(screen.getByText("Hide Activity")).toBeTruthy();
  });
});
