/**
 * GitPanel behavioral tests.
 *
 * Strategy:
 *  - Mock `agentFetch` from `../util/agentConfig` to intercept all HTTP calls.
 *  - Drive each test by controlling what the mock resolves to.
 *  - Assert only on what a user sees (visible text, button state) — never on
 *    implementation details like state variables or internal functions.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Silence plain CSS imports ─────────────────────────────────────────────────
vi.mock("./panels.css", () => ({}));

// ── Mock agentFetch so no real HTTP calls are made ───────────────────────────
const mockAgentFetch = vi.fn();
vi.mock("../util/agentConfig", () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
  getAgentBaseUrl: () => "http://localhost:43120",
  getAgentV1BaseUrl: () => "http://localhost:43120/v1",
}));

import GitPanel from "./GitPanel";

// ── Helper: minimal Response-shaped object ────────────────────────────────────
function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("GitPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial render ─────────────────────────────────────────────────────────

  it("renders without crashing", () => {
    render(<GitPanel />);
    expect(screen.getByText("Git")).toBeInTheDocument();
  });

  it("shows the repository path input and Check Status button on first render", () => {
    render(<GitPanel />);
    expect(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check Status" }),
    ).toBeInTheDocument();
  });

  it("does not show file-list sections or commit form before fetching status", () => {
    render(<GitPanel />);
    // These headings only appear after a successful status fetch.
    expect(screen.queryByText(/Commit Changes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Create Branch/i)).not.toBeInTheDocument();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it("shows 'Loading...' on the button while the status request is in-flight", async () => {
    let resolveFetch!: (v: unknown) => void;
    mockAgentFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<GitPanel />);
    const input = screen.getByPlaceholderText(
      "Repository path (e.g., . for current)",
    );
    fireEvent.change(input, { target: { value: "/home/user/project" } });
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    expect(await screen.findByText("Loading...")).toBeInTheDocument();

    // Resolve to clean up any pending promises.
    await act(async () => {
      resolveFetch(
        makeResponse({
          branch: "main",
          modified: [],
          staged: [],
          untracked: [],
        }),
      );
    });
  });

  it("Check Status button is disabled while loading", async () => {
    let resolveFetch!: (v: unknown) => void;
    mockAgentFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<GitPanel />);
    fireEvent.change(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
      {
        target: { value: "/repo" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await screen.findByText("Loading...");
    expect(screen.getByText("Loading...").closest("button")).toBeDisabled();

    await act(async () => {
      resolveFetch(
        makeResponse({
          branch: "main",
          modified: [],
          staged: [],
          untracked: [],
        }),
      );
    });
  });

  // ── Status loaded — clean working tree ────────────────────────────────────

  it("shows branch name after fetching status", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        branch: "feature/login",
        modified: [],
        staged: [],
        untracked: [],
      }),
    );

    render(<GitPanel />);
    fireEvent.change(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
      {
        target: { value: "/repo" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await waitFor(() =>
      expect(screen.getByText(/Status: feature\/login/)).toBeInTheDocument(),
    );
  });

  it("shows modified file list when status contains modifications", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        branch: "main",
        modified: ["src/auth.ts", "src/utils.ts"],
        staged: [],
        untracked: [],
      }),
    );

    render(<GitPanel />);
    fireEvent.change(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
      {
        target: { value: "/repo" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await waitFor(() =>
      expect(screen.getByText("src/auth.ts")).toBeInTheDocument(),
    );
    expect(screen.getByText("src/utils.ts")).toBeInTheDocument();
    // Section heading includes the count.
    expect(screen.getByText(/Modified \(2\)/)).toBeInTheDocument();
  });

  it("shows untracked file list when status contains untracked files", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        branch: "main",
        modified: [],
        staged: [],
        untracked: ["new-component.tsx"],
      }),
    );

    render(<GitPanel />);
    fireEvent.change(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
      {
        target: { value: "/repo" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await waitFor(() =>
      expect(screen.getByText("new-component.tsx")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Untracked \(1\)/)).toBeInTheDocument();
  });

  it("shows the commit form after status is loaded", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        branch: "main",
        modified: ["index.ts"],
        staged: [],
        untracked: [],
      }),
    );

    render(<GitPanel />);
    fireEvent.change(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
      {
        target: { value: "/repo" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await waitFor(() =>
      expect(screen.getByText("Commit Changes")).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText("Commit message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit" })).toBeInTheDocument();
  });

  it("shows the create branch section after status is loaded", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        branch: "main",
        modified: [],
        staged: [],
        untracked: [],
      }),
    );

    render(<GitPanel />);
    fireEvent.change(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
      {
        target: { value: "/repo" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await waitFor(() =>
      expect(screen.getByText("Create Branch")).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText("Branch name")).toBeInTheDocument();
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it("shows an error message when no repo path is entered before clicking Check Status", async () => {
    render(<GitPanel />);
    // Leave path empty, click the button.
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await waitFor(() =>
      expect(screen.getByText("Enter repository path")).toBeInTheDocument(),
    );
    // The fetch should never have been called.
    expect(mockAgentFetch).not.toHaveBeenCalled();
  });

  it("shows an error message when the fetch throws", async () => {
    mockAgentFetch.mockRejectedValue(new Error("ENOENT: no such directory"));

    render(<GitPanel />);
    fireEvent.change(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
      {
        target: { value: "/nonexistent" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await waitFor(() =>
      expect(screen.getByText("ENOENT: no such directory")).toBeInTheDocument(),
    );
  });

  it("shows a validation error when commit is attempted with an empty message", async () => {
    mockAgentFetch.mockResolvedValueOnce(
      makeResponse({
        branch: "main",
        modified: ["src/app.ts"],
        staged: [],
        untracked: [],
      }),
    );

    render(<GitPanel />);
    fireEvent.change(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
      {
        target: { value: "/repo" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await waitFor(() =>
      expect(screen.getByText("Commit Changes")).toBeInTheDocument(),
    );

    // Click commit with empty message.
    fireEvent.click(screen.getByRole("button", { name: "Commit" }));

    await waitFor(() =>
      expect(screen.getByText("Enter commit message")).toBeInTheDocument(),
    );
  });

  it("shows a validation error when branch creation is attempted with an empty name", async () => {
    mockAgentFetch.mockResolvedValueOnce(
      makeResponse({
        branch: "main",
        modified: [],
        staged: [],
        untracked: [],
      }),
    );

    render(<GitPanel />);
    fireEvent.change(
      screen.getByPlaceholderText("Repository path (e.g., . for current)"),
      {
        target: { value: "/repo" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Check Status" }));

    await waitFor(() =>
      expect(screen.getByText("Create Branch")).toBeInTheDocument(),
    );

    // Click create branch with empty name.
    fireEvent.click(screen.getByRole("button", { name: "Create & Checkout" }));

    await waitFor(() =>
      expect(screen.getByText("Enter branch name")).toBeInTheDocument(),
    );
  });
});
