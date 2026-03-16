import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

function TestToastTrigger() {
  const { toast, dismissAll } = useToast();
  return (
    <div>
      <button onClick={() => toast.success("Success message")}>
        Show Success
      </button>
      <button onClick={() => toast.error("Error message")}>Show Error</button>
      <button onClick={() => toast.warning("Warning message")}>
        Show Warning
      </button>
      <button onClick={() => toast.info("Info message")}>Show Info</button>
      <button onClick={dismissAll}>Dismiss All</button>
    </div>
  );
}

describe("Toast System", () => {
  it("renders success toast", () => {
    render(
      <ToastProvider>
        <TestToastTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Success"));
    expect(screen.getByText("Success message")).toBeTruthy();
  });

  it("renders error toast", () => {
    render(
      <ToastProvider>
        <TestToastTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Error"));
    expect(screen.getByText("Error message")).toBeTruthy();
  });

  it("renders warning toast", () => {
    render(
      <ToastProvider>
        <TestToastTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Warning"));
    expect(screen.getByText("Warning message")).toBeTruthy();
  });

  it("renders info toast", () => {
    render(
      <ToastProvider>
        <TestToastTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Info"));
    expect(screen.getByText("Info message")).toBeTruthy();
  });

  it("error toast has role=alert, others have role=status", () => {
    render(
      <ToastProvider>
        <TestToastTrigger />
      </ToastProvider>,
    );

    // Non-error toasts use role="status"
    fireEvent.click(screen.getByText("Show Success"));
    const statuses = screen.getAllByRole("status");
    expect(statuses.length).toBeGreaterThan(0);

    // Error toasts use role="alert"
    fireEvent.click(screen.getByText("Show Error"));
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("toast has dismiss button with aria-label", () => {
    render(
      <ToastProvider>
        <TestToastTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Success"));
    const dismissBtn = screen.getByLabelText("Dismiss notification");
    expect(dismissBtn).toBeTruthy();
  });

  it("limits visible toasts to MAX_TOASTS", () => {
    render(
      <ToastProvider>
        <TestToastTrigger />
      </ToastProvider>,
    );

    // Fire 7 toasts, only 5 should be visible (MAX_TOASTS = 5)
    for (let i = 0; i < 7; i++) {
      fireEvent.click(screen.getByText("Show Info"));
    }

    // Info toasts use role="status"
    const statuses = screen.getAllByRole("status");
    expect(statuses.length).toBeLessThanOrEqual(5);
  });

  it("throws when useToast is used outside ToastProvider", () => {
    function BadComponent() {
      useToast();
      return null;
    }

    expect(() => render(<BadComponent />)).toThrow(
      "useToast must be used within a <ToastProvider>",
    );
  });
});
