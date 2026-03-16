import { render, screen, act } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../hooks/useWebviewListener", () => ({
  useWebviewListener: vi.fn(),
}));

const mockPost = vi.fn();
const mockRequest = vi.fn().mockResolvedValue({
  status: "success",
  content: { accessToken: "test-token", account: { id: "1", label: "Test" } },
});

vi.mock("./IdeMessenger", () => {
  const React = require("react");
  const mockMessenger = {
    post: (...args: any[]) => mockPost(...args),
    request: (...args: any[]) => mockRequest(...args),
    ide: { showToast: vi.fn() },
  };
  return {
    IdeMessengerContext: React.createContext(mockMessenger),
  };
});

import { AuthProvider, useAuth } from "./Auth";

function createMockStore(overrides: Record<string, any> = {}) {
  return configureStore({
    reducer: {
      profiles: (
        state = {
          organizations: [{ id: "personal", name: "Personal", profiles: [] }],
          selectedOrgId: "personal",
          ...overrides.profiles,
        },
      ) => state,
      config: (state = { configLoading: false, ...overrides.config }) => state,
    },
  });
}

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="session">
        {auth.session ? "logged-in" : "logged-out"}
      </span>
      <button data-testid="login" onClick={() => auth.login(false)}>
        Login
      </button>
      <button data-testid="logout" onClick={() => auth.logout()}>
        Logout
      </button>
      <button
        data-testid="refresh"
        onClick={() => auth.refreshProfiles("test")}
      >
        Refresh
      </button>
    </div>
  );
}

function renderWithAuth(storeOverrides: Record<string, any> = {}) {
  const store = createMockStore(storeOverrides);
  return render(
    <Provider store={store}>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </Provider>,
  );
}

describe("Auth context", () => {
  it("renders children and provides context", () => {
    renderWithAuth();
    expect(screen.getByTestId("session")).toBeInTheDocument();
  });

  it("starts with no session (logged out)", () => {
    mockRequest.mockResolvedValueOnce({ status: "error" });
    renderWithAuth();
    expect(screen.getByTestId("session").textContent).toBe("logged-out");
  });

  it("login calls ideMessenger.request and sets session on success", async () => {
    mockRequest.mockResolvedValue({
      status: "success",
      content: { accessToken: "tok" },
    });
    renderWithAuth();

    await act(async () => {
      screen.getByTestId("login").click();
    });

    expect(mockRequest).toHaveBeenCalledWith(
      "getControlPlaneSessionInfo",
      expect.objectContaining({ silent: false, useOnboarding: false }),
    );
  });

  it("logout posts logoutOfControlPlane and clears session", async () => {
    renderWithAuth();

    await act(async () => {
      screen.getByTestId("logout").click();
    });

    expect(mockPost).toHaveBeenCalledWith("logoutOfControlPlane", undefined);
  });

  it("refreshProfiles calls config/refreshProfiles and shows toast", async () => {
    mockRequest.mockResolvedValue({ status: "success", content: {} });
    renderWithAuth();

    await act(async () => {
      screen.getByTestId("refresh").click();
    });

    expect(mockRequest).toHaveBeenCalledWith("config/refreshProfiles", {
      reason: "test",
    });
    expect(mockPost).toHaveBeenCalledWith("showToast", [
      "info",
      "Config refreshed",
    ]);
  });

  it("useAuth throws when used outside AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );
    spy.mockRestore();
  });
});
