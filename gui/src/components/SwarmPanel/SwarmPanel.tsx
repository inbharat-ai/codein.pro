import { useEffect, useRef } from "react";
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
import { SwarmGpu } from "./SwarmGpu";
import { SwarmHeader } from "./SwarmHeader";
import { SwarmMemory } from "./SwarmMemory";
import { SwarmPermissions } from "./SwarmPermissions";
import { SwarmTaskView } from "./SwarmTaskView";
import { SwarmTimeline } from "./SwarmTimeline";

export function SwarmPanel() {
  const dispatch = useAppDispatch();
  const isActive = useAppSelector(selectSwarmIsActive);
  const sseConnected = useAppSelector(selectSseConnected);
  const evtSourceRef = useRef<EventSource | null>(null);

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

  return (
    <div className="bg-vsc-background flex h-full flex-col overflow-hidden">
      <SwarmHeader />
      {isActive ? (
        <div className="flex-1 space-y-3 overflow-y-auto p-2">
          <SwarmAgents />
          <SwarmTaskView />
          <SwarmPermissions />
          <SwarmTimeline />
          <SwarmMemory />
          <SwarmGpu />
          {!sseConnected && (
            <div className="px-2 text-xs text-yellow-500">
              SSE disconnected — events may be delayed
            </div>
          )}
        </div>
      ) : (
        <div className="text-vsc-foreground/60 flex flex-1 items-center justify-center text-sm">
          Swarm not active. Initialize to begin.
        </div>
      )}
    </div>
  );
}
