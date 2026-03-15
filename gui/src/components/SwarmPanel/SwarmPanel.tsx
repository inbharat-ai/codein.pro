import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  addEvent,
  fetchPermissions,
  fetchSwarmStatus,
  selectSseConnected,
  selectSwarmIsActive,
  setSseConnected,
  type SwarmEvent,
} from "../../redux/slices/swarmSlice";
import { ErrorBoundary } from "../ErrorBoundary";
import { getAgentBaseUrl } from "../../util/agentConfig";
import { SwarmAgents } from "./SwarmAgents";
import { SwarmAnalytics } from "./SwarmAnalytics";
import { SwarmBackgroundTasks } from "./SwarmBackgroundTasks";
import { SwarmBudget } from "./SwarmBudget";
import { SwarmGpu } from "./SwarmGpu";
import { SwarmHeader } from "./SwarmHeader";
import { SwarmMemory } from "./SwarmMemory";
import { SwarmPermissions } from "./SwarmPermissions";
import { SwarmPlugins } from "./SwarmPlugins";
import { SwarmTaskView } from "./SwarmTaskView";
import { SwarmTimeline } from "./SwarmTimeline";
import { SwarmWorkspaceIntel } from "./SwarmWorkspaceIntel";

type DashboardTab = "overview" | "analytics" | "extensions" | "workspace";

export function SwarmPanel() {
  const dispatch = useAppDispatch();
  const isActive = useAppSelector(selectSwarmIsActive);
  const sseConnected = useAppSelector(selectSseConnected);
  const evtSourceRef = useRef<EventSource | null>(null);
  const [tab, setTab] = useState<DashboardTab>("overview");

  // Poll status every 5s when active
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      dispatch(fetchSwarmStatus());
      dispatch(fetchPermissions());
    }, 5000);
    return () => clearInterval(id);
  }, [isActive, dispatch]);

  // SSE connection
  useEffect(() => {
    if (!isActive) return;
    const es = new EventSource(`${getAgentBaseUrl()}/swarm/events`);
    evtSourceRef.current = es;

    es.onopen = () => dispatch(setSseConnected(true));
    es.onmessage = (msg) => {
      try {
        const event: SwarmEvent = JSON.parse(msg.data);
        dispatch(addEvent(event));
      } catch {
        // ignore malformed events
      }
    };
    es.onerror = () => dispatch(setSseConnected(false));

    return () => {
      es.close();
      dispatch(setSseConnected(false));
    };
  }, [isActive, dispatch]);

  const tabs: { key: DashboardTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "analytics", label: "Analytics" },
    { key: "extensions", label: "Extensions" },
    { key: "workspace", label: "Workspace" },
  ];

  return (
    <div className="bg-codin-bg flex h-full flex-col overflow-hidden">
      <SwarmHeader />
      {isActive ? (
        <>
          {/* Tab bar */}
          <div className="border-codin-border flex gap-1 border-b px-3 py-1.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
                  tab === t.key
                    ? "bg-codin-indigo-600 shadow-codin-indigo-600/25 text-white shadow-sm"
                    : "text-codin-fg-muted hover:text-codin-fg-secondary hover:bg-codin-bg-hover"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            <ErrorBoundary>
              {tab === "overview" && (
                <>
                  <SwarmAgents />
                  <SwarmTaskView />
                  <SwarmPermissions />
                  <SwarmBudget />
                  <SwarmGpu />
                  <SwarmBackgroundTasks />
                  <SwarmTimeline />
                  <SwarmMemory />
                </>
              )}

              {tab === "analytics" && <SwarmAnalytics />}

              {tab === "extensions" && <SwarmPlugins />}

              {tab === "workspace" && <SwarmWorkspaceIntel />}
            </ErrorBoundary>

            {!sseConnected && (
              <div className="bg-codin-saffron-500/10 text-codin-saffron-400 rounded-md px-2.5 py-1.5 text-xs">
                SSE disconnected — events may be delayed
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-codin-fg-muted flex flex-1 flex-col items-center justify-center gap-2 text-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="text-codin-indigo-400/40 h-10 w-10"
          >
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Swarm not active. Initialize to begin.</span>
        </div>
      )}
    </div>
  );
}
