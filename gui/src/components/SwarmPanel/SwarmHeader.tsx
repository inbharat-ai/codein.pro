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
    <div className="border-vsc-input-border space-y-2 border-b p-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Multi-Agent Swarm</h2>
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            isActive
              ? "bg-green-900/40 text-green-400"
              : "bg-zinc-700 text-zinc-400"
          }`}
        >
          {status?.state || "idle"}
        </span>
      </div>

      {!isActive && (
        <div className="space-y-1.5">
          <select
            className="bg-vsc-input-background border-vsc-input-border w-full rounded border px-2 py-1 text-xs"
            value={topology}
            onChange={(e) => setTopology(e.target.value)}
          >
            {TOPOLOGIES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 text-xs">
            <label>Max Agents:</label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxAgents}
              onChange={(e) => setMaxAgents(parseInt(e.target.value, 10) || 10)}
              className="bg-vsc-input-background border-vsc-input-border w-16 rounded border px-1 py-0.5"
            />
          </div>
          <button
            onClick={handleInit}
            disabled={loading}
            className="w-full rounded bg-blue-600 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Initializing..." : "Initialize Swarm"}
          </button>
        </div>
      )}

      {isActive && (
        <div className="flex items-center gap-2 text-xs">
          <span className="flex-1">
            Agents: {status?.agents?.length || 0} | Tasks:{" "}
            {status?.activeTasks || 0}
          </span>
          <button
            onClick={handleShutdown}
            className="rounded bg-red-800 px-2 py-1 text-xs text-white hover:bg-red-700"
          >
            Shutdown
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between text-xs text-red-400">
          <span>{error}</span>
          <button
            onClick={() => dispatch(clearError())}
            className="ml-2 underline"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
