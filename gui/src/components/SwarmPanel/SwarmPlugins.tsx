import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchPlugins,
  fetchSkills,
  executeSkill,
  selectSwarmPlugins,
  selectSwarmSkills,
} from "../../redux/slices/swarmSlice";

const PLUGIN_STATUS_COLORS: Record<string, string> = {
  active: "text-green-400",
  loaded: "text-blue-400",
  error: "text-red-400",
  disabled: "text-zinc-500",
};

export function SwarmPlugins() {
  const dispatch = useAppDispatch();
  const plugins = useAppSelector(selectSwarmPlugins);
  const skills = useAppSelector(selectSwarmSkills);
  const [tab, setTab] = useState<"plugins" | "skills">("plugins");

  useEffect(() => {
    dispatch(fetchPlugins());
    dispatch(fetchSkills(undefined));
  }, [dispatch]);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-vsc-foreground/70 text-xs font-semibold">
          Extensions
        </h3>
        <div className="flex gap-0.5 text-[10px]">
          <button
            onClick={() => setTab("plugins")}
            className={`rounded px-1.5 py-0.5 ${tab === "plugins" ? "bg-blue-600 text-white" : "text-vsc-foreground/50 hover:text-vsc-foreground/70"}`}
          >
            Plugins ({plugins.length})
          </button>
          <button
            onClick={() => setTab("skills")}
            className={`rounded px-1.5 py-0.5 ${tab === "skills" ? "bg-blue-600 text-white" : "text-vsc-foreground/50 hover:text-vsc-foreground/70"}`}
          >
            Skills ({skills.length})
          </button>
        </div>
      </div>

      {tab === "plugins" && (
        <div className="scrollbar-thin max-h-36 space-y-1 overflow-y-auto">
          {plugins.length === 0 ? (
            <p className="text-vsc-foreground/40 text-[10px]">
              No plugins loaded
            </p>
          ) : (
            plugins.map((p) => (
              <div
                key={p.name}
                className="bg-vsc-input-background rounded px-2 py-1 text-[10px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  <span
                    className={
                      PLUGIN_STATUS_COLORS[p.status] || "text-zinc-500"
                    }
                  >
                    {p.status}
                  </span>
                </div>
                <div className="text-vsc-foreground/40 flex justify-between">
                  <span>v{p.version}</span>
                  <span>{p.toolCount} tools</span>
                </div>
                {p.description && (
                  <div className="text-vsc-foreground/30 mt-0.5 truncate">
                    {p.description}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "skills" && (
        <div className="scrollbar-thin max-h-36 space-y-1 overflow-y-auto">
          {skills.length === 0 ? (
            <p className="text-vsc-foreground/40 text-[10px]">
              No skills available
            </p>
          ) : (
            skills.map((s) => (
              <div
                key={s.name}
                className="bg-vsc-input-background rounded px-2 py-1 text-[10px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <button
                    onClick={() =>
                      dispatch(executeSkill({ skillName: s.name, context: {} }))
                    }
                    className="text-blue-400 hover:underline"
                  >
                    run
                  </button>
                </div>
                <div className="text-vsc-foreground/40">{s.description}</div>
                {s.category && (
                  <span className="text-vsc-foreground/30">{s.category}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
