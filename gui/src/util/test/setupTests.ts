import "@testing-library/jest-dom";

// Mock react-virtuoso for jsdom — it relies on real layout measurements that
// jsdom cannot provide, causing tests to time out. This mock renders all items
// directly so test assertions continue to work.
vi.mock("react-virtuoso", () => {
  const React = require("react");

  const Virtuoso = React.forwardRef(function VirtuosoMock(
    props: any,
    ref: any,
  ) {
    const { data, itemContent, scrollerRef, style, className } = props;

    const scrollerElRef = React.useCallback(
      (el: HTMLDivElement | null) => {
        if (scrollerRef) {
          if (typeof scrollerRef === "function") {
            scrollerRef(el);
          } else {
            scrollerRef.current = el;
          }
        }
      },
      [scrollerRef],
    );

    return React.createElement(
      "div",
      {
        ref: scrollerElRef,
        style: { ...style, overflowY: "auto" },
        className,
        "data-testid": "virtuoso-scroller",
      },
      React.createElement(
        "div",
        { "data-testid": "virtuoso-item-list" },
        (data ?? []).map((item: any, index: number) =>
          React.createElement(
            "div",
            { key: index, "data-index": index },
            itemContent(index, item),
          ),
        ),
      ),
    );
  });

  return { Virtuoso, VirtuosoHandle: {} };
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.resetAllMocks();
});

// Suppress uncaught ProseMirror errors in test environment
window.addEventListener("error", (event) => {
  if (
    event.error?.message?.includes("getClientRects") ||
    event.error?.message?.includes("prosemirror")
  ) {
    event.preventDefault();
    return false;
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (
    event.reason?.message?.includes("getClientRects") ||
    event.reason?.message?.includes("prosemirror")
  ) {
    event.preventDefault();
    return false;
  }
});

// https://github.com/vitest-dev/vitest/issues/821
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock getBoundingClientRect and getClientRects for ProseMirror
Object.defineProperty(Element.prototype, "getClientRects", {
  value: vi.fn(() => ({
    length: 1,
    0: { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 },
    item: () => ({
      top: 0,
      bottom: 20,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
    }),
  })),
});

Object.defineProperty(Element.prototype, "getBoundingClientRect", {
  value: vi.fn(() => ({
    top: 0,
    bottom: 20,
    left: 0,
    right: 100,
    width: 100,
    height: 20,
  })),
});
