/**
 * CodeIn IDE Shell
 * Professional IDE layout: Activity Bar | Main Content | Status Bar
 *
 * Activity bar groups:
 *   Core     — Chat, History (always visible, primary workflow)
 *   Tools    — Search, Git, Agents (developer tools)
 *   Advanced — GPU, AI Hub, Computer Use (power user, collapsed by default)
 *   Bottom   — Settings (always pinned)
 *
 * Status bar shows live mode, model, and streaming state.
 */

import {
  ChatBubbleOvalLeftIcon,
  ClockIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  CodeBracketIcon,
  BoltIcon,
  ComputerDesktopIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BeakerIcon,
  QueueListIcon,
} from "@heroicons/react/24/outline";
import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppSelector } from "../redux/hooks";
import { selectSelectedChatModel } from "../redux/slices/configSlice";
import { ROUTES } from "../util/navigation";
import { ErrorBoundary } from "./ErrorBoundary";
import "./IdeShell.css";

interface ActivityItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  i18nKey: string;
  route: string;
}

/* ── Activity bar groups ──────────────────────────────────────────── */

const coreActivities: ActivityItem[] = [
  {
    id: "chat",
    icon: ChatBubbleOvalLeftIcon,
    label: "Chat",
    i18nKey: "activityBar.chat",
    route: ROUTES.HOME,
  },
  {
    id: "history",
    icon: ClockIcon,
    label: "History",
    i18nKey: "activityBar.history",
    route: ROUTES.HISTORY,
  },
];

const toolActivities: ActivityItem[] = [
  {
    id: "search",
    icon: MagnifyingGlassIcon,
    label: "Search",
    i18nKey: "activityBar.search",
    route: ROUTES.REPO_INTELLIGENCE,
  },
  {
    id: "git",
    icon: CodeBracketIcon,
    label: "Git",
    i18nKey: "activityBar.git",
    route: ROUTES.GIT,
  },
  {
    id: "agents",
    icon: UserGroupIcon,
    label: "Agents",
    i18nKey: "activityBar.swarm",
    route: ROUTES.SWARM,
  },
];

const advancedActivities: ActivityItem[] = [
  {
    id: "research",
    icon: BeakerIcon,
    label: "Research",
    i18nKey: "activityBar.research",
    route: ROUTES.RESEARCH,
  },
  {
    id: "pipeline",
    icon: QueueListIcon,
    label: "Pipeline",
    i18nKey: "activityBar.pipeline",
    route: ROUTES.PIPELINE,
  },
  {
    id: "gpu",
    icon: CpuChipIcon,
    label: "GPU",
    i18nKey: "activityBar.gpu",
    route: ROUTES.GPU,
  },
  {
    id: "ai-hub",
    icon: BoltIcon,
    label: "AI Hub",
    i18nKey: "activityBar.aiHub",
    route: ROUTES.AI_HUB,
  },
  {
    id: "computer",
    icon: ComputerDesktopIcon,
    label: "Computer Use",
    i18nKey: "activityBar.computer",
    route: ROUTES.COMPUTER,
  },
];

const bottomActivities: ActivityItem[] = [
  {
    id: "settings",
    icon: Cog6ToothIcon,
    label: "Settings",
    i18nKey: "activityBar.settings",
    route: ROUTES.CONFIG,
  },
];

/* ── Route-to-ID matching ─────────────────────────────────────────── */

const allItems = [
  ...coreActivities,
  ...toolActivities,
  ...advancedActivities,
  ...bottomActivities,
];

function getActiveId(pathname: string): string {
  if (pathname === "/" || pathname === "/index.html") return "chat";
  if (pathname === ROUTES.HISTORY) return "history";
  if (pathname.includes("swarm")) return "agents";
  if (pathname.includes("gpu")) return "gpu";
  if (pathname.includes("git")) return "git";
  if (pathname.includes("ai-hub")) return "ai-hub";
  if (pathname.includes("computer")) return "computer";
  if (pathname.includes("pipeline")) return "pipeline";
  if (pathname.includes("research")) return "research";
  if (pathname.includes("repo") || pathname.includes("search")) return "search";
  if (pathname.includes("config") || pathname.includes("settings"))
    return "settings";
  return "chat";
}

/* ── Page title map ───────────────────────────────────────────────── */

const PAGE_TITLES: Record<string, string> = {
  chat: "",
  history: "Session History",
  search: "Code Search",
  git: "Git",
  agents: "Multi-Agent Swarm",
  research: "Research",
  pipeline: "Pipeline",
  gpu: "GPU Monitor",
  "ai-hub": "AI Hub",
  computer: "Computer Use",
  settings: "Settings",
};

/* ── Activity Button ──────────────────────────────────────────────── */

const ActivityButton: React.FC<{
  item: ActivityItem;
  isActive: boolean;
  onClick: () => void;
}> = React.memo(({ item, isActive, onClick }) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const label = t(item.i18nKey);

  return (
    <button
      className={`ide-activity-btn ${isActive ? "active" : ""}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
    >
      <item.icon className="ide-activity-icon" />
      {hovered && !isActive && (
        <span className="ide-activity-tooltip">{label}</span>
      )}
    </button>
  );
});
ActivityButton.displayName = "ActivityButton";

/* ── Section Divider ──────────────────────────────────────────────── */

const SectionDivider: React.FC = () => (
  <div className="ide-section-divider" aria-hidden="true" />
);

/* ── IdeShell ─────────────────────────────────────────────────────── */

export const IdeShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Live status bar data
  const mode = useAppSelector((state) => state.session.mode);
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const sessionTitle = useAppSelector((state) => state.session.title);
  const selectedModel = useAppSelector(selectSelectedChatModel);
  const modelName = selectedModel?.title || selectedModel?.model || "—";

  const activeId = getActiveId(location.pathname);
  const pageTitle = PAGE_TITLES[activeId] || "";

  // Auto-expand advanced section if an advanced item is active
  const isAdvancedActive = advancedActivities.some((a) => a.id === activeId);
  const advancedVisible = showAdvanced || isAdvancedActive;

  const handleNavClick = useCallback(
    (item: ActivityItem) => {
      navigate(item.route);
    },
    [navigate],
  );

  const toggleAdvanced = useCallback(() => {
    setShowAdvanced((prev) => !prev);
  }, []);

  return (
    <div className="ide-shell">
      <a href="#main-content" className="codin-skip-link">
        Skip to content
      </a>

      {/* ── Activity Bar ── */}
      <ErrorBoundary>
        <nav className="ide-activity-bar" aria-label="Main navigation">
          <div className="ide-activity-top">
            {/* CodeIn Logo */}
            <div className="ide-logo" title="CodeIn">
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

            {/* Core — Chat, History */}
            {coreActivities.map((item) => (
              <ActivityButton
                key={item.id}
                item={item}
                isActive={activeId === item.id}
                onClick={() => handleNavClick(item)}
              />
            ))}

            <SectionDivider />

            {/* Tools — Search, Git, Agents */}
            {toolActivities.map((item) => (
              <ActivityButton
                key={item.id}
                item={item}
                isActive={activeId === item.id}
                onClick={() => handleNavClick(item)}
              />
            ))}

            <SectionDivider />

            {/* Advanced toggle */}
            <button
              className={`ide-activity-btn ide-more-btn ${advancedVisible ? "expanded" : ""}`}
              onClick={toggleAdvanced}
              title={advancedVisible ? "Hide advanced panels" : "More panels"}
              aria-label={
                advancedVisible ? "Hide advanced panels" : "Show more panels"
              }
              aria-expanded={advancedVisible}
            >
              {advancedVisible ? (
                <ChevronUpIcon className="ide-activity-icon" />
              ) : (
                <ChevronDownIcon className="ide-activity-icon" />
              )}
            </button>

            {/* Advanced — GPU, AI Hub, Computer Use (collapsible) */}
            {advancedVisible &&
              advancedActivities.map((item) => (
                <ActivityButton
                  key={item.id}
                  item={item}
                  isActive={activeId === item.id}
                  onClick={() => handleNavClick(item)}
                />
              ))}
          </div>

          {/* Bottom — Settings */}
          <div className="ide-activity-bottom">
            {bottomActivities.map((item) => (
              <ActivityButton
                key={item.id}
                item={item}
                isActive={activeId === item.id}
                onClick={() => handleNavClick(item)}
              />
            ))}
          </div>
        </nav>
      </ErrorBoundary>

      {/* ── Main Content Area ── */}
      <ErrorBoundary>
        <div className="ide-main-wrapper">
          <main id="main-content" className="ide-main">
            {children}
          </main>
        </div>
      </ErrorBoundary>

      {/* ── Status Bar ── */}
      <ErrorBoundary>
        <footer className="ide-status-bar">
          <div className="ide-status-left">
            {/* Streaming indicator */}
            <span
              className={`ide-status-item ${isStreaming ? "ide-status-streaming" : ""}`}
            >
              <span
                className={`ide-status-dot ${isStreaming ? "streaming" : "ready"}`}
              />
              {isStreaming ? "Generating" : "Ready"}
            </span>
            {/* Current mode */}
            <span className="ide-status-item ide-status-mode">
              {mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : "Chat"}
            </span>
          </div>

          <div className="ide-status-center">
            <span
              className="ide-status-item ide-status-tagline"
              title={sessionTitle || "CodeIn"}
            >
              {activeId === "chat" &&
              sessionTitle &&
              sessionTitle !== "New Session"
                ? sessionTitle.length > 40
                  ? sessionTitle.slice(0, 38) + "..."
                  : sessionTitle
                : "CodeIn"}
            </span>
          </div>

          <div className="ide-status-right">
            {/* Active model */}
            <span
              className="ide-status-item ide-status-model"
              title={modelName}
            >
              {modelName.length > 24
                ? modelName.slice(0, 22) + "..."
                : modelName}
            </span>
            <span className="ide-status-item ide-status-version">
              {t("statusBar.version")}
            </span>
          </div>
        </footer>
      </ErrorBoundary>
    </div>
  );
};
