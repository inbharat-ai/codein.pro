import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAgentFetch = vi.fn();

vi.mock("../util/agentConfig", () => ({
  agentFetch: (...args: any[]) => mockAgentFetch(...args),
}));

vi.mock("./panels.css", () => ({}));

import RepoIntelligencePanel from "./RepoIntelligencePanel";

describe("RepoIntelligencePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<RepoIntelligencePanel />);
    expect(screen.getByText("Code Search")).toBeInTheDocument();
  });

  it("renders the Scan Workspace button", () => {
    render(<RepoIntelligencePanel />);
    expect(screen.getByText("Scan Workspace")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<RepoIntelligencePanel />);
    expect(
      screen.getByPlaceholderText(
        "Search for functions, classes, variables...",
      ),
    ).toBeInTheDocument();
  });

  it("renders the Search button", () => {
    render(<RepoIntelligencePanel />);
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("shows scanning state when scan button is clicked", async () => {
    mockAgentFetch.mockImplementation(
      () => new Promise(() => {}), // never resolves to keep loading state
    );

    render(<RepoIntelligencePanel />);
    fireEvent.click(screen.getByText("Scan Workspace"));

    expect(screen.getByText("Scanning...")).toBeInTheDocument();
  });

  it("shows scan results after successful scan", async () => {
    mockAgentFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          fileCount: 150,
          symbolCount: 3200,
          edgeCount: 890,
        }),
    });

    render(<RepoIntelligencePanel />);
    fireEvent.click(screen.getByText("Scan Workspace"));

    await waitFor(() => {
      expect(screen.getByText(/Files indexed: 150/)).toBeInTheDocument();
      expect(screen.getByText(/Symbols found: 3200/)).toBeInTheDocument();
      expect(screen.getByText(/Dependencies: 890/)).toBeInTheDocument();
    });
  });

  it("shows error when scan fails", async () => {
    mockAgentFetch.mockRejectedValue(new Error("Network error"));

    render(<RepoIntelligencePanel />);
    fireEvent.click(screen.getByText("Scan Workspace"));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows error when searching with empty query", () => {
    render(<RepoIntelligencePanel />);
    fireEvent.click(screen.getByText("Search"));

    expect(screen.getByText("Enter a search term")).toBeInTheDocument();
  });

  it("shows searching state during search", async () => {
    mockAgentFetch.mockImplementation(() => new Promise(() => {}));

    render(<RepoIntelligencePanel />);
    const input = screen.getByPlaceholderText(
      "Search for functions, classes, variables...",
    );
    fireEvent.change(input, { target: { value: "handleClick" } });
    fireEvent.click(screen.getByText("Search"));

    expect(screen.getByText("Searching...")).toBeInTheDocument();
  });

  it("shows search results after successful search", async () => {
    mockAgentFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          results: [
            {
              file: "src/App.tsx",
              matches: 3,
              preview: "function handleClick() {",
            },
          ],
        }),
    });

    render(<RepoIntelligencePanel />);
    const input = screen.getByPlaceholderText(
      "Search for functions, classes, variables...",
    );
    fireEvent.change(input, { target: { value: "handleClick" } });
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => {
      expect(screen.getByText("src/App.tsx")).toBeInTheDocument();
      expect(screen.getByText("function handleClick() {")).toBeInTheDocument();
    });
  });

  it("triggers search on Enter key", async () => {
    mockAgentFetch.mockImplementation(() => new Promise(() => {}));

    render(<RepoIntelligencePanel />);
    const input = screen.getByPlaceholderText(
      "Search for functions, classes, variables...",
    );
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Searching...")).toBeInTheDocument();
  });
});
