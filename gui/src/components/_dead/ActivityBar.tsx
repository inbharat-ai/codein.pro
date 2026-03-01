/**
 * Activity Bar - Left sidebar with icon buttons for different panels
 */

import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { setActivePanel } from "../redux/slices/uiSlice";
import {
  FileIcon,
  GitIcon,
  SearchIcon,
  BugIcon,
  TerminalIcon,
  SettingsIcon,
  CopilotIcon,
} from "./Icons";
import "./ActivityBar.css";

export const ActivityBar: React.FC = () => {
  const dispatch = useDispatch();
  const activePanel = useSelector((state: any) => state.ui.activePanel);

  const panels = [
    { id: "explorer", label: "Explorer", icon: FileIcon },
    { id: "search", label: "Search", icon: SearchIcon },
    { id: "git", label: "Source Control", icon: GitIcon },
    { id: "debug", label: "Debug", icon: BugIcon },
    { id: "extensions", label: "Extensions", icon: TerminalIcon },
    { id: "copilot", label: "CodIn AI", icon: CopilotIcon, highlight: true },
  ];

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {panels.map((panel) => (
          <button
            key={panel.id}
            className={`activity-button ${activePanel === panel.id ? "active" : ""} ${
              panel.highlight ? "highlight" : ""
            }`}
            onClick={() => dispatch(setActivePanel(panel.id))}
            title={panel.label}
            aria-label={panel.label}
          >
            <panel.icon />
          </button>
        ))}
      </div>

      <div className="activity-bar-bottom">
        <button
          className="activity-button"
          onClick={() => dispatch(setActivePanel("settings"))}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
};
