import { useState } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  clearError,
  initSwarm,
  selectSwarmError,
  selectSwarmIsActive,
  selectSwarmLoading,
  selectSwarmStatus,
  shutdownSwarm,
} from "../../redux/slices/swarmSlice";

const TOPOLOGIES = [
  { value: "mesh", label: "Mesh (Parallel)" },
  { value: "hierarchical", label: "Hierarchical (Supervisor)" },
  { value: "ring", label: "Ring (Sequential Loop)" },
  { value: "star", label: "Star (Best-of-N)" },
];

export function SwarmHeader() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectSwarmStatus);
  const isActive = useAppSelector(selectSwarmIsActive);
  const loading = useAppSelector(selectSwarmLoading);
  const error = useAppSelector(selectSwarmError);

  const [topology, setTopology] = useState("hierarchical");
  const [maxAgents, setMaxAgents] = useState(10);

  const handleInit = () => {
    dispatch(initSwarm({ topology, maxAgents }));
  };

  const handleShutdown = () => {
    dispatch(shutdownSwarm());
  };

  return (
    <div className="border-codin-border space-y-2 border-b p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-codin-fg text-sm font-semibold">
          Multi-Agent Swarm
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            isActive
              ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
              : "bg-codin-bg-surface text-codin-fg-muted"
          }`}
        >
          {status?.state || "idle"}
        </span>
      </div>

      {!isActive && (
        <div className="space-y-2">
          <select
            className="bg-codin-bg-surface border-codin-border text-codin-fg focus:border-codin-border-focus w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
            value={topology}
            onChange={(e) => setTopology(e.target.value)}
          >
            {TOPOLOGIES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="text-codin-fg-secondary flex items-center gap-2 text-xs">
            <label>Max Agents:</label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxAgents}
              onChange={(e) => setMaxAgents(parseInt(e.target.value, 10) || 10)}
              className="bg-codin-bg-surface border-codin-border text-codin-fg focus:border-codin-border-focus w-16 rounded border px-1.5 py-1 focus:outline-none"
            />
          </div>
          <button
            onClick={handleInit}
            disabled={loading}
            className="bg-codin-indigo-600 hover:bg-codin-indigo-500 w-full rounded py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
          >
            {loading ? "Initializing..." : "Initialize Swarm"}
          </button>
        </div>
      )}

      {isActive && (
        <div className="text-codin-fg-secondary flex items-center gap-2 text-xs">
          <span className="flex-1">
            Agents: {status?.agents?.length || 0} | Tasks:{" "}
            {status?.activeTasks || 0}
          </span>
          <button
            onClick={handleShutdown}
            className="rounded bg-red-900/60 px-2.5 py-1 text-xs text-red-300 transition-colors hover:bg-red-800/80"
          >
            Shutdown
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded bg-red-900/20 px-2 py-1 text-xs text-red-400">
          <span>{error}</span>
          <button
            onClick={() => dispatch(clearError())}
            className="ml-2 text-red-300 underline hover:text-red-200"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
