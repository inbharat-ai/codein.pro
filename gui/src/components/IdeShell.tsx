/**
 * CodIn IDE Shell
 * Professional IDE layout: Activity Bar | Main Content | Status Bar
 * Wraps the existing chat GUI in a Cursor/Copilot-style layout
 */

import {
  ChatBubbleOvalLeftIcon,
  ClockIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "../util/navigation";
import "./IdeShell.css";

interface ActivityItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  route: string;
}

const topActivities: ActivityItem[] = [
  {
    id: "chat",
    icon: ChatBubbleOvalLeftIcon,
    label: "AI Chat",
    route: ROUTES.HOME,
  },
  {
    id: "history",
    icon: ClockIcon,
    label: "History",
    route: "/history",
  },
  {
    id: "search",
    icon: MagnifyingGlassIcon,
    label: "Search",
    route: ROUTES.REPO_INTELLIGENCE,
  },
  {
    id: "gpu",
    icon: CpuChipIcon,
    label: "GPU Panel",
    route: ROUTES.GPU,
  },
  {
    id: "docs",
    icon: DocumentTextIcon,
    label: "Docs & Rules",
    route: ROUTES.CONFIG,
  },
];

const bottomActivities: ActivityItem[] = [
  {
    id: "settings",
    icon: Cog6ToothIcon,
    label: "Settings",
    route: ROUTES.CONFIG,
  },
];

export const IdeShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const getActiveId = () => {
    const path = location.pathname;
    if (path === "/" || path === "/index.html") return "chat";
    if (path === "/history") return "history";
    if (path.includes("gpu")) return "gpu";
    if (path.includes("repo") || path.includes("search")) return "search";
    if (path.includes("config") || path.includes("settings")) return "settings";
    return "chat";
  };

  const activeId = getActiveId();

  const handleNavClick = (item: ActivityItem) => {
    navigate(item.route);
  };

  return (
    <div className="ide-shell">
      {/* Activity Bar */}
      <div className="ide-activity-bar">
        <div className="ide-activity-top">
          {/* CodIn Logo */}
          <div className="ide-logo" title="CodIn">
            <svg viewBox="0 0 24 24" fill="none" className="ide-logo-svg">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {topActivities.map((item) => (
            <button
              key={item.id}
              className={`ide-activity-btn ${activeId === item.id ? "active" : ""}`}
              onClick={() => handleNavClick(item)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              title={item.label}
              aria-label={item.label}
            >
              <item.icon className="ide-activity-icon" />
              {hoveredItem === item.id && (
                <span className="ide-activity-tooltip">{item.label}</span>
              )}
            </button>
          ))}
        </div>
        <div className="ide-activity-bottom">
          {bottomActivities.map((item) => (
            <button
              key={item.id}
              className={`ide-activity-btn ${activeId === item.id ? "active" : ""}`}
              onClick={() => handleNavClick(item)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              title={item.label}
              aria-label={item.label}
            >
              <item.icon className="ide-activity-icon" />
              {hoveredItem === item.id && (
                <span className="ide-activity-tooltip">{item.label}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="ide-main">{children}</div>

      {/* Status Bar */}
      <div className="ide-status-bar">
        <div className="ide-status-left">
          <span className="ide-status-item">
            <svg
              viewBox="0 0 16 16"
              className="ide-status-icon"
              fill="currentColor"
            >
              <path d="M14.85 3.29l-1.14-1.14a.5.5 0 00-.71 0L5 10.15l-2-2a.5.5 0 00-.71 0L1.15 9.29a.5.5 0 000 .71L5 14l9.85-9.85a.5.5 0 000-.71z" />
            </svg>
            Ready
          </span>
          <span className="ide-status-item ide-status-branch">
            <svg
              viewBox="0 0 16 16"
              className="ide-status-icon"
              fill="currentColor"
            >
              <path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5zM13 4.5L9.5 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4.5z" />
            </svg>
            main
          </span>
        </div>
        <div className="ide-status-center">
          <span className="ide-status-item">
            CodIn — AI-Powered Code Editor for Bharat
          </span>
        </div>
        <div className="ide-status-right">
          <span className="ide-status-item">v1.0.0</span>
          <span className="ide-status-item ide-status-lang">TypeScript</span>
        </div>
      </div>
    </div>
  );
};
