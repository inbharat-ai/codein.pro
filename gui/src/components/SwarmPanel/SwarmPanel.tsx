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
    <div className="bg-vsc-background flex h-full flex-col overflow-hidden">
      <SwarmHeader />
      {isActive ? (
        <>
          {/* Tab bar */}
          <div className="border-vsc-input-border flex gap-0.5 border-b px-2 py-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                  tab === t.key
                    ? "bg-blue-600 text-white"
                    : "text-vsc-foreground/50 hover:text-vsc-foreground/70 hover:bg-vsc-input-background"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-2">
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

            {!sseConnected && (
              <div className="px-2 text-xs text-yellow-500">
                SSE disconnected — events may be delayed
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-vsc-foreground/60 flex flex-1 items-center justify-center text-sm">
          Swarm not active. Initialize to begin.
        </div>
      )}
    </div>
  );
}
