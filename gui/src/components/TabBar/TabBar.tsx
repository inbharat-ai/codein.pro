import { XMarkIcon } from "@heroicons/react/24/outline";
import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { defaultBorderRadius } from "..";
import { newSession } from "../../redux/slices/sessionSlice";
import {
  addTab,
  handleSessionChange,
  removeTab,
  setActiveTab,
  setTabs,
} from "../../redux/slices/tabsSlice";
import { AppDispatch, RootState } from "../../redux/store";
import { loadSession, saveCurrentSession } from "../../redux/thunks/session";
import { varWithFallback } from "../../styles/theme";

// Haven't set up theme colors for tabs yet
// Will keep it simple and choose from existing ones. Comments show vars we could use
const tabBorderVar = varWithFallback("border"); // --vscode-tab-border
const tabBackgroundVar = varWithFallback("background"); // --vscode-tab-inactiveBackground
const tabForegroundVar = varWithFallback("foreground"); // --vscode-tab-inactiveForeground
const tabHoverBackgroundVar = varWithFallback("list-hover"); // --vscode-tab-hoverBackground
const tabHoverForegroundVar = varWithFallback("foreground"); // --vscode-tab-hoverForeground
const tabSelectedBackgroundVar = varWithFallback("background"); // --vscode-tab-activeBackground
const tabSelectedForegroundVar = varWithFallback("foreground"); // --vscode-tab-activeForeground
const tabAccentVar = varWithFallback("accent"); // --vscode-tab-activeBorderTop

// Inject tab bar CSS once (for scrollbar hiding and close-button visibility)
if (typeof document !== "undefined") {
  const styleId = "codin-tab-bar-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .codin-tab-bar { scrollbar-width: none; }
      .codin-tab-bar::-webkit-scrollbar { display: none; }
      .codin-tab:hover .codin-tab-close { visibility: visible !important; }
    `;
    document.head.appendChild(style);
  }
}

interface TabItemProps {
  isActive: boolean;
  title: string;
  onClick: () => void;
  onAuxClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClose: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function TabItem({
  isActive,
  title,
  onClick,
  onAuxClick,
  onClose,
}: TabItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="codin-tab"
      style={{
        display: "flex",
        alignItems: "center",
        boxSizing: "border-box",
        padding: "0 5px 0 12px",
        flexGrow: 1,
        width: 100,
        maxWidth: 150,
        height: 25,
        backgroundColor: isActive
          ? tabSelectedBackgroundVar
          : hovered
            ? tabHoverBackgroundVar
            : tabBackgroundVar,
        color: isActive
          ? tabSelectedForegroundVar
          : hovered
            ? tabHoverForegroundVar
            : tabForegroundVar,
        cursor: "pointer",
        border: `1px solid ${tabBorderVar}`,
        borderBottom: isActive ? "none" : `1px solid ${tabBorderVar}`,
        borderTop: isActive
          ? `1px solid ${tabAccentVar}`
          : `1px solid ${tabBorderVar}`,
        userSelect: "none",
        position: "relative",
        transition: "background-color 0.2s",
      }}
      onClick={onClick}
      onAuxClick={onAuxClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: 13,
        }}
      >
        {title}
      </span>
      <button
        className="codin-tab-close"
        onClick={onClose}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          marginLeft: 4,
          border: "none",
          background: "transparent",
          color: "inherit",
          opacity: 0.7,
          cursor: "pointer",
          borderRadius: defaultBorderRadius,
          padding: 2,
          visibility: "hidden",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "1";
          (e.currentTarget as HTMLElement).style.backgroundColor =
            tabHoverBackgroundVar;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "0.7";
          (e.currentTarget as HTMLElement).style.backgroundColor =
            "transparent";
        }}
      >
        <XMarkIcon width={12} height={12} />
      </button>
    </div>
  );
}

export const TabBar = React.forwardRef<HTMLDivElement>((_, ref) => {
  const dispatch = useDispatch<AppDispatch>();
  const currentSessionId = useSelector((state: RootState) => state.session.id);
  const currentSessionTitle = useSelector(
    (state: RootState) => state.session.title,
  );
  const hasHistory = useSelector(
    (state: RootState) => state.session.history.length > 0,
  );
  const tabs = useSelector((state: RootState) => state.tabs.tabs);

  // Simple UUID generator for our needs
  const generateId = useCallback(() => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }, []);

  useEffect(() => {
    if (!currentSessionId) return;

    dispatch(
      handleSessionChange({
        currentSessionId,
        currentSessionTitle,
        newTabId: generateId(), // Pass the ID generator result
      }),
    );
  }, [currentSessionId, currentSessionTitle]);

  const handleNewTab = async () => {
    // Save current session before creating new one
    if (hasHistory) {
      await dispatch(
        saveCurrentSession({ openNewSession: false, generateTitle: true }),
      );
    }

    dispatch(newSession());

    dispatch(
      addTab({
        id: generateId(),
        title: `Chat ${tabs.length + 1}`,
        isActive: true,
        sessionId: undefined,
      }),
    );
  };

  useEffect(() => {
    if (!tabs.length) {
      handleNewTab();
    }
  }, [tabs.map((t) => t.id).join(",")]);

  const handleTabClick = async (id: string) => {
    const targetTab = tabs.find((tab) => tab.id === id);
    if (!targetTab) return;

    if (targetTab.sessionId) {
      // Switch to existing session
      await dispatch(
        loadSession({
          sessionId: targetTab.sessionId,
          saveCurrentSession: hasHistory,
        }),
      );
    }

    dispatch(setActiveTab(id));
  };

  const handleTabClose = async (id: string) => {
    const isClosingActive = tabs.find((t) => t.id === id)?.isActive;
    const filtered = tabs.filter((t) => t.id !== id);

    if (isClosingActive) {
      const lastTab = filtered[filtered.length - 1];
      if (filtered.length) {
        await handleTabClick(lastTab.id);
        dispatch(
          setTabs(
            filtered.map((tab, i) => ({
              ...tab,
              isActive: i === filtered.length - 1,
            })),
          ),
        );
      } else {
        dispatch(setTabs([]));
        dispatch(newSession());
      }
    } else {
      dispatch(removeTab(id));
    }
  };

  return (
    <div
      ref={ref}
      className="codin-tab-bar"
      style={{
        display: tabs.length === 1 ? "none" : "flex",
        flexWrap: "wrap",
        flexShrink: 0,
        flexGrow: 0,
        backgroundColor: tabBackgroundVar,
        borderBottom: "none",
        position: "relative",
        marginTop: 2,
        maxHeight: 100,
        overflow: "auto",
      }}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          isActive={tab.isActive}
          title={tab.title}
          onClick={() => handleTabClick(tab.id)}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              handleTabClose(tab.id);
            }
          }}
          onClose={(e) => {
            e.stopPropagation();
            handleTabClose(tab.id);
          }}
        />
      ))}
      {/* TabBarSpace */}
      <div
        style={{
          flex: 1,
          display: "flex",
          borderBottom: `1px solid ${tabBorderVar}`,
          backgroundColor: tabBackgroundVar,
        }}
      />
    </div>
  );
});
