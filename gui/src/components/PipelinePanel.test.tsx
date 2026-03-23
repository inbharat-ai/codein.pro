/**
 * PipelinePanel behavioral tests.
 *
 * Strategy:
 *  - Mock `agentFetch` from `../util/agentConfig` to prevent real HTTP calls.
 *  - Use fake timers to stop the 5-second polling interval from running during
 *    tests that don't need it.
 *  - Assert only on what a user sees or can interact with.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock agentFetch ───────────────────────────────────────────────────────────
const mockAgentFetch = vi.fn();
vi.mock("../util/agentConfig", () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
  getAgentBaseUrl: () => "http://localhost:43120",
  getAgentV1BaseUrl: () => "http://localhost:43120/v1",
}));

import PipelinePanel from "./PipelinePanel";

// ── Helper: build a minimal Response-shaped object ────────────────────────────
function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Render the component with the initial loadPipelines call resolving to an
 * empty list. Fake timers prevent the polling interval from firing.
 */
async function renderPanel() {
  mockAgentFetch.mockResolvedValue(makeResponse({ pipelines: [] }));
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<PipelinePanel />);
  });
  return result!;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("PipelinePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Only fake setInterval so the polling loop does not fire during tests.
    // Leave setTimeout real so that RTL's waitFor retry loop still works.
    vi.useFakeTimers({ toFake: ["setInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Renders ────────────────────────────────────────────────────────────────

  it("renders without crashing", async () => {
    await renderPanel();
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
  });

  it("shows the goal textarea and Create button", async () => {
    await renderPanel();
    expect(
      screen.getByPlaceholderText("Describe what you want to build..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it("shows empty state when no pipelines exist", async () => {
    await renderPanel();
    await waitFor(() =>
      expect(screen.getByText("No pipelines yet")).toBeInTheDocument(),
    );
  });

  // ── Create button disabled/enabled ────────────────────────────────────────

  it("Create button is disabled when goal textarea is empty", async () => {
    await renderPanel();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("Create button becomes enabled when the user types a goal", async () => {
    await renderPanel();
    await act(async () => {
      fireEvent.change(
        screen.getByPlaceholderText("Describe what you want to build..."),
        { target: { value: "Build a CRUD API for users" } },
      );
    });
    expect(screen.getByRole("button", { name: "Create" })).not.toBeDisabled();
  });

  it("Create button is disabled when goal is only whitespace", async () => {
    await renderPanel();
    await act(async () => {
      fireEvent.change(
        screen.getByPlaceholderText("Describe what you want to build..."),
        { target: { value: "   " } },
      );
    });
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  // ── Error messages ─────────────────────────────────────────────────────────

  it("shows an error message when pipeline creation fails with a server error", async () => {
    // Initial load — empty.
    mockAgentFetch.mockResolvedValueOnce(makeResponse({ pipelines: [] }));
    // POST /pipeline/create — server error.
    mockAgentFetch.mockResolvedValueOnce(
      makeResponse({ error: "Quota exceeded" }, false),
    );
    // loadPipelines after failed create — empty.
    mockAgentFetch.mockResolvedValue(makeResponse({ pipelines: [] }));

    await renderPanel();

    await act(async () => {
      fireEvent.change(
        screen.getByPlaceholderText("Describe what you want to build..."),
        { target: { value: "Build a payment service" } },
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    await waitFor(() =>
      expect(screen.getByText("Quota exceeded")).toBeInTheDocument(),
    );
  });

  it("shows an error message when the fetch rejects (network error)", async () => {
    mockAgentFetch.mockResolvedValueOnce(makeResponse({ pipelines: [] }));
    mockAgentFetch.mockRejectedValueOnce(new Error("Failed to fetch"));

    await renderPanel();

    await act(async () => {
      fireEvent.change(
        screen.getByPlaceholderText("Describe what you want to build..."),
        { target: { value: "Scaffold a React app" } },
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    await waitFor(() =>
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument(),
    );
  });

  // ── Pipeline list ──────────────────────────────────────────────────────────

  it("shows pipeline goal text after pipelines are loaded", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        pipelines: [
          { id: "p-1", status: "completed", goal: "Build a user auth service" },
          {
            id: "p-2",
            status: "executing",
            goal: "Create payment integration",
          },
        ],
      }),
    );

    await act(async () => {
      render(<PipelinePanel />);
    });

    await waitFor(() =>
      expect(screen.getByText("Build a user auth service")).toBeInTheDocument(),
    );
    expect(screen.getByText("Create payment integration")).toBeInTheDocument();
  });

  it("shows the raw status string for each pipeline", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        pipelines: [
          { id: "p-1", status: "completed", goal: "Task A" },
          { id: "p-2", status: "failed", goal: "Task B" },
        ],
      }),
    );

    await act(async () => {
      render(<PipelinePanel />);
    });

    await waitFor(() =>
      expect(screen.getByText("completed")).toBeInTheDocument(),
    );
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("shows language and framework metadata when provided", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        pipelines: [
          {
            id: "p-1",
            status: "planning",
            goal: "Build API",
            language: "TypeScript",
            framework: "Express",
          },
        ],
      }),
    );

    await act(async () => {
      render(<PipelinePanel />);
    });

    await waitFor(() =>
      expect(screen.getByText("Lang: TypeScript")).toBeInTheDocument(),
    );
    expect(screen.getByText("Framework: Express")).toBeInTheDocument();
  });

  // ── Cancel button visibility ───────────────────────────────────────────────

  it("shows a Cancel button only for active (non-terminal) pipelines", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        pipelines: [
          { id: "p-running", status: "executing", goal: "Active task" },
          { id: "p-done", status: "completed", goal: "Done task" },
          { id: "p-failed", status: "failed", goal: "Failed task" },
        ],
      }),
    );

    await act(async () => {
      render(<PipelinePanel />);
    });

    await waitFor(() =>
      expect(screen.getByText("Active task")).toBeInTheDocument(),
    );

    // Only one Cancel button: for the executing pipeline.
    const cancelBtns = screen.getAllByRole("button", { name: "Cancel" });
    expect(cancelBtns).toHaveLength(1);
  });

  it("does not show a Cancel button for completed pipelines", async () => {
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        pipelines: [
          { id: "p-done", status: "completed", goal: "Finished task" },
        ],
      }),
    );

    await act(async () => {
      render(<PipelinePanel />);
    });

    await waitFor(() =>
      expect(screen.getByText("Finished task")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  // ── Creating… label ────────────────────────────────────────────────────────

  it("shows 'Creating...' on the button while a pipeline is being submitted", async () => {
    let resolveCreate!: (v: unknown) => void;
    mockAgentFetch
      .mockResolvedValueOnce(makeResponse({ pipelines: [] })) // initial load
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
      ); // create — pending

    await renderPanel();

    await act(async () => {
      fireEvent.change(
        screen.getByPlaceholderText("Describe what you want to build..."),
        { target: { value: "Build something" } },
      );
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    await waitFor(() =>
      expect(screen.getByText("Creating...")).toBeInTheDocument(),
    );

    // Clean up the pending promise.
    await act(async () => {
      resolveCreate(makeResponse({ pipelines: [] }));
    });
  });

  // ── Truncation ────────────────────────────────────────────────────────────

  it("truncates goal text that exceeds 120 characters", async () => {
    const longGoal = "A".repeat(130);
    mockAgentFetch.mockResolvedValue(
      makeResponse({
        pipelines: [{ id: "p-1", status: "completed", goal: longGoal }],
      }),
    );

    await act(async () => {
      render(<PipelinePanel />);
    });

    await waitFor(() =>
      expect(screen.getByText(`${"A".repeat(120)}...`)).toBeInTheDocument(),
    );
  });
});
