import styled from "styled-components";

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

export const Button = styled.button`
  padding: 6px 12px;
  margin: 8px 0;
  border-radius: ${defaultBorderRadius};

  border: none;
  color: ${vscBackground};
  background-color: ${vscForeground};

  &:disabled {
    color: ${vscBackground};
    opacity: 0.5;
    pointer-events: none;
  }

  &:hover:enabled {
    cursor: pointer;
    filter: brightness(1.2);
  }
`;

export const SecondaryButton = styled.button`
  padding: 6px 12px;
  margin: 8px;
  border-radius: ${defaultBorderRadius};

  border: 1px solid ${lightGray};
  color: ${vscForeground};
  background-color: ${vscInputBackground};

  &:disabled {
    color: gray;
  }

  &:hover:enabled {
    cursor: pointer;
    background-color: ${vscBackground};
    opacity: 0.9;
  }
`;

export const GhostButton = styled.button`
  padding: 6px 8px;
  border-radius: ${defaultBorderRadius};

  border: none;
  color: ${vscForeground};
  background-color: rgba(128, 128, 128, 0.4);
  &:disabled {
    color: gray;
    pointer-events: none;
  }

  &:hover:enabled {
    cursor: pointer;
    filter: brightness(125%);
  }
`;

export const ButtonSubtext = styled.span`
  display: block;
  margin-top: 0;
  text-align: center;
  color: ${lightGray};
  font-size: 0.75rem;
`;

export const CustomScrollbarDiv = styled.div`
  scrollbar-base-color: transparent;
  scrollbar-width: thin;
  background-color: ${vscBackground};

  & * {
    ::-webkit-scrollbar {
      width: 4px;
    }

    ::-webkit-scrollbar:horizontal {
      height: 4px;
    }

    ::-webkit-scrollbar-thumb {
      border-radius: 2px;
    }
  }
`;

export const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  box-sizing: border-box;
  margin: 4px 0px;
  border-radius: ${defaultBorderRadius};
  outline: 1px solid ${lightGray};
  border: none;
  background-color: ${vscBackground};
  color: ${vscForeground};

  &:focus {
    background: ${vscInputBackground};
    outline: 1px solid ${lightGray};
  }

  &:invalid {
    outline: 1px solid red;
  }
`;

export const HeaderButton = styled.button<{
  inverted: boolean | undefined;
  backgroundColor?: string;
  hoverBackgroundColor?: string;
}>`
  background-color: ${({ inverted, backgroundColor }) => {
    return backgroundColor ?? (inverted ? vscForeground : "transparent");
  }};
  color: ${({ inverted }) => (inverted ? vscBackground : vscForeground)};

  border: none;
  border-radius: ${defaultBorderRadius};
  cursor: ${({ disabled }) => (disabled ? "default" : "pointer")};

  &:focus {
    outline: none;
    border: none;
  }

  &:hover {
    background-color: ${({ inverted, hoverBackgroundColor }) =>
      typeof inverted === "undefined" || inverted
        ? (hoverBackgroundColor ?? vscInputBackground)
        : "transparent"};
  }

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px;
`;

export const StyledActionButton = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: background-color 200ms;
  border-radius: ${defaultBorderRadius};
  padding: 2px 12px;
  background-color: ${lightGray}33;
  background-opacity: 0.1;

  &:hover {
    background-color: ${lightGray}55;
  }
`;

export const CloseButton = styled.button`
  border: none;
  background-color: inherit;
  color: ${lightGray};
  position: absolute;
  top: 0.6rem;
  right: 1rem;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`;
