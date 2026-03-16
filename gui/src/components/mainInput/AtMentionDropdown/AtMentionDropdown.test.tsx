import { render, screen, fireEvent } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../context/IdeMessenger", () => {
  const React = require("react");
  return {
    IdeMessengerContext: React.createContext({
      post: vi.fn(),
      request: vi.fn().mockResolvedValue({ status: "success", content: [] }),
      ide: { showToast: vi.fn() },
    }),
  };
});

vi.mock("../../../util", () => ({
  fontSize: (n: number) => `${14 + n}px`,
  getFontSize: () => 14,
}));

vi.mock("../../FileIcon", () => ({
  default: () => <span data-testid="file-icon" />,
}));

vi.mock("../../SafeImg", () => ({
  default: ({ fallback }: any) => fallback,
}));

vi.mock("../../dialogs/AddDocsDialog", () => ({
  default: () => <div />,
}));

vi.mock("../../gui/HeaderButtonWithToolTip", () => ({
  default: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("../../ui", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("../icons", () => ({
  NAMED_ICONS: {},
}));

import AtMentionDropdown from "./index";

function createMockStore() {
  return configureStore({
    reducer: {
      session: (state = { mode: "agent" }) => state,
      ui: (state = { showDialog: false }) => state,
    },
  });
}

const mockEditor = {
  chain: () => ({ focus: () => ({ command: () => ({ run: vi.fn() }) }) }),
  view: {
    state: {
      doc: { textBetween: () => "" },
      selection: { from: 0 },
      tr: { delete: vi.fn(), scrollIntoView: vi.fn(), insertText: vi.fn() },
    },
    dispatch: vi.fn(),
  },
} as any;

const baseItems = [
  {
    title: "Files",
    type: "contextProvider" as const,
    id: "files",
    description: "Search files",
    contextProvider: { type: "submenu" },
  },
  {
    title: "Code",
    type: "contextProvider" as const,
    id: "code",
    description: "Search code",
  },
];

function renderDropdown(overrides: Record<string, any> = {}) {
  const store = createMockStore();
  const props = {
    items: baseItems,
    command: vi.fn(),
    editor: mockEditor,
    enterSubmenu: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return {
    ...render(
      <Provider store={store}>
        <AtMentionDropdown {...(props as any)} />
      </Provider>,
    ),
    props,
  };
}

describe("AtMentionDropdown", () => {
  it("renders without crashing", () => {
    renderDropdown();
    expect(
      screen.getAllByTestId("context-provider-dropdown-item").length,
    ).toBeGreaterThan(0);
  });

  it("displays all provided items", () => {
    renderDropdown();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Code")).toBeInTheDocument();
  });

  it("shows 'No results' when items list is empty", () => {
    renderDropdown({ items: [] });
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("first item is selected by default", () => {
    renderDropdown();
    const items = screen.getAllByTestId("context-provider-dropdown-item");
    expect(items[0].className).toContain("is-selected");
  });

  it("updates selected index on mouse enter", () => {
    renderDropdown();
    const items = screen.getAllByTestId("context-provider-dropdown-item");
    fireEvent.mouseEnter(items[1]);
    expect(items[1].className).toContain("is-selected");
  });

  it("calls command on item click for non-submenu provider", () => {
    const { props } = renderDropdown();
    const items = screen.getAllByTestId("context-provider-dropdown-item");
    // Click the "Code" item (index 1) which is not a submenu
    fireEvent.click(items[1]);
    expect(props.command).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Code", itemType: "contextProvider" }),
    );
  });
});
