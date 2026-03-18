import React from "react";

export const defaultBorderRadius = "var(--codin-radius-md, 0.5rem)";
export const lightGray = "var(--codin-fg-muted, #8b88ad)";
export const greenButtonColor = "#189e72";

export const vscInputBackground = "var(--codin-bg-surface, #201e3a)";
export const vscQuickInputBackground = "var(--codin-bg-surface, #201e3a)";
export const vscBackground = "var(--codin-bg-primary, #0f0e17)";
export const vscForeground = "var(--codin-fg-primary, #e8e6f0)";
export const vscButtonBackground = "var(--codin-accent-primary, #4338ca)";
export const vscButtonForeground = "#ffffff";
export const vscEditorBackground = "var(--codin-bg-surface, #201e3a)";
export const vscTextCodeBlockBackground = "var(--codin-bg-surface, #201e3a)";
export const vscListActiveBackground = "var(--codin-bg-active, #312e81)";
export const vscFocusBorder = "var(--codin-border-focus, #f59e0b)";
export const vscListActiveForeground = "var(--codin-fg-primary, #e8e6f0)";
export const vscInputBorder = "var(--codin-border, #2a2845)";
export const vscInputBorderFocus = "var(--codin-border-focus, #f59e0b)";
export const vscBadgeBackground = "var(--codin-indigo-600, #4f46e5)";
export const vscBadgeForeground = "var(--codin-fg-primary, #e8e6f0)";
export const vscCommandCenterActiveBorder =
  "var(--codin-border-focus, #f59e0b)";
export const vscCommandCenterInactiveBorder = "var(--codin-border, #2a2845)";

// ---------------------------------------------------------------------------
// Inject shared button/scrollbar CSS once (for pseudo-class rules)
// ---------------------------------------------------------------------------
if (typeof document !== "undefined") {
  const styleId = "codin-components-index-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .codin-btn:disabled { opacity: 0.5; pointer-events: none; }
      .codin-btn:hover:enabled { cursor: pointer; filter: brightness(1.2); }
      .codin-btn-secondary:disabled { color: gray; }
      .codin-btn-secondary:hover:enabled { cursor: pointer; opacity: 0.9; }
      .codin-btn-ghost:disabled { color: gray; pointer-events: none; }
      .codin-btn-ghost:hover:enabled { cursor: pointer; filter: brightness(125%); }
      .codin-header-btn:focus-visible { outline: 2px solid var(--codin-border-focus, rgba(99, 102, 241, 0.7)); outline-offset: 2px; }
      .codin-action-btn:hover { background-color: ${lightGray}55; }
      .codin-custom-scrollbar * ::-webkit-scrollbar { width: 4px; }
      .codin-custom-scrollbar * ::-webkit-scrollbar:horizontal { height: 4px; }
      .codin-custom-scrollbar * ::-webkit-scrollbar-thumb { border-radius: 2px; }
      .codin-input:focus { background: ${vscInputBackground}; outline: 1px solid ${lightGray}; }
      .codin-input:invalid { outline: 1px solid red; }
    `;
    document.head.appendChild(style);
  }
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ style, children, ...rest }, ref) => (
    <button
      ref={ref}
      className="codin-btn"
      style={{
        padding: "6px 12px",
        margin: "8px 0",
        borderRadius: defaultBorderRadius,
        border: "none",
        color: vscBackground,
        backgroundColor: vscForeground,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  ),
);
Button.displayName = "Button";

// ---------------------------------------------------------------------------
// SecondaryButton
// ---------------------------------------------------------------------------
export const SecondaryButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ style, children, ...rest }, ref) => (
    <button
      ref={ref}
      className="codin-btn-secondary"
      style={{
        padding: "6px 12px",
        margin: "8px",
        borderRadius: defaultBorderRadius,
        border: `1px solid ${lightGray}`,
        color: vscForeground,
        backgroundColor: vscInputBackground,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  ),
);
SecondaryButton.displayName = "SecondaryButton";

// ---------------------------------------------------------------------------
// GhostButton
// ---------------------------------------------------------------------------
export const GhostButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ style, children, ...rest }, ref) => (
    <button
      ref={ref}
      className="codin-btn-ghost"
      style={{
        padding: "6px 8px",
        borderRadius: defaultBorderRadius,
        border: "none",
        color: vscForeground,
        backgroundColor: "rgba(128, 128, 128, 0.4)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  ),
);
GhostButton.displayName = "GhostButton";

// ---------------------------------------------------------------------------
// ButtonSubtext
// ---------------------------------------------------------------------------
interface SpanProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
}

export const ButtonSubtext = React.forwardRef<HTMLSpanElement, SpanProps>(
  ({ style, children, ...rest }, ref) => (
    <span
      ref={ref}
      style={{
        display: "block",
        marginTop: 0,
        textAlign: "center",
        color: lightGray,
        fontSize: "0.75rem",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  ),
);
ButtonSubtext.displayName = "ButtonSubtext";

// ---------------------------------------------------------------------------
// CustomScrollbarDiv
// ---------------------------------------------------------------------------
interface DivProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export const CustomScrollbarDiv = React.forwardRef<HTMLDivElement, DivProps>(
  ({ style, children, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={`codin-custom-scrollbar${className ? ` ${className}` : ""}`}
      style={{
        scrollbarWidth: "thin",
        backgroundColor: vscBackground,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  ),
);
CustomScrollbarDiv.displayName = "CustomScrollbarDiv";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ style, className, ...rest }, ref) => (
    <input
      ref={ref}
      className={`codin-input${className ? ` ${className}` : ""}`}
      style={{
        width: "100%",
        padding: "8px 12px",
        boxSizing: "border-box",
        margin: "4px 0px",
        borderRadius: defaultBorderRadius,
        outline: `1px solid ${lightGray}`,
        border: "none",
        backgroundColor: vscBackground,
        color: vscForeground,
        ...style,
      }}
      {...rest}
    />
  ),
);
Input.displayName = "Input";

// ---------------------------------------------------------------------------
// HeaderButton
// ---------------------------------------------------------------------------
interface HeaderButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  inverted?: boolean;
  backgroundColor?: string;
  hoverBackgroundColor?: string;
  children?: React.ReactNode;
}

export const HeaderButton = React.forwardRef<
  HTMLButtonElement,
  HeaderButtonProps
>(
  (
    {
      inverted,
      backgroundColor,
      hoverBackgroundColor,
      style,
      children,
      onMouseEnter,
      onMouseLeave,
      ...rest
    },
    ref,
  ) => {
    const [hovered, setHovered] = React.useState(false);

    const bgColor =
      backgroundColor ?? (inverted ? vscForeground : "transparent");

    const hoveredBg =
      typeof inverted === "undefined" || inverted
        ? (hoverBackgroundColor ?? vscInputBackground)
        : "transparent";

    return (
      <button
        ref={ref}
        className="codin-header-btn"
        style={{
          backgroundColor: hovered ? hoveredBg : bgColor,
          color: inverted ? vscBackground : vscForeground,
          border: "none",
          borderRadius: defaultBorderRadius,
          cursor: rest.disabled ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: 2,
          ...style,
        }}
        onMouseEnter={(e) => {
          setHovered(true);
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          setHovered(false);
          onMouseLeave?.(e);
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
HeaderButton.displayName = "HeaderButton";

// ---------------------------------------------------------------------------
// StyledActionButton
// ---------------------------------------------------------------------------
export const StyledActionButton = React.forwardRef<HTMLDivElement, DivProps>(
  ({ style, children, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={`codin-action-btn${className ? ` ${className}` : ""}`}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        transition: "background-color 200ms",
        borderRadius: defaultBorderRadius,
        padding: "2px 12px",
        backgroundColor: `${lightGray}33`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  ),
);
StyledActionButton.displayName = "StyledActionButton";

// ---------------------------------------------------------------------------
// CloseButton
// ---------------------------------------------------------------------------
export const CloseButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ style, children, ...rest }, ref) => (
    <button
      ref={ref}
      style={{
        border: "none",
        backgroundColor: "inherit",
        color: lightGray,
        position: "absolute",
        top: "0.6rem",
        right: "1rem",
        padding: "0.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  ),
);
CloseButton.displayName = "CloseButton";
