import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchWorkspaceProfile,
  fetchConventions,
  selectWorkspaceProfile,
  selectConventions,
  selectWorkspaceLoaded,
} from "../../redux/slices/swarmSlice";

const LANG_COLORS: Record<string, string> = {
  typescript: "bg-blue-500",
  javascript: "bg-yellow-500",
  python: "bg-green-500",
  rust: "bg-orange-500",
  go: "bg-cyan-500",
  java: "bg-red-500",
  css: "bg-purple-500",
  html: "bg-pink-500",
};

export function SwarmWorkspaceIntel() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector(selectWorkspaceProfile);
  const conventions = useAppSelector(selectConventions);
  const loaded = useAppSelector(selectWorkspaceLoaded);

  useEffect(() => {
    dispatch(fetchWorkspaceProfile());
    dispatch(fetchConventions());
  }, [dispatch]);

  if (!profile && conventions.length === 0) {
    return (
      <div>
        <h3 className="text-vsc-foreground/70 mb-1 text-xs font-semibold">
          Workspace
        </h3>
        <p className="text-vsc-foreground/40 text-[10px]">
          {loaded ? "Workspace analysis unavailable" : "Analyzing workspace..."}
        </p>
      </div>
    );
  }

  const languages = profile?.languages || {};
  const totalFiles = Object.values(languages).reduce((s, n) => s + n, 0);

  return (
    <div>
      <h3 className="text-vsc-foreground/70 mb-1 text-xs font-semibold">
        Workspace Intelligence
      </h3>
      <div className="space-y-2">
        {/* Language breakdown */}
        {totalFiles > 0 && (
          <div>
            <h4 className="text-vsc-foreground/50 mb-0.5 text-[10px] font-medium">
              Languages
            </h4>
            <div className="bg-vsc-background flex h-2 overflow-hidden rounded">
              {Object.entries(languages)
                .sort(([, a], [, b]) => b - a)
                .map(([lang, count]) => (
                  <div
                    key={lang}
                    className={`${LANG_COLORS[lang.toLowerCase()] || "bg-zinc-500"} h-full`}
                    style={{ width: `${(count / totalFiles) * 100}%` }}
                    title={`${lang}: ${count} files`}
                  />
                ))}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
              {Object.entries(languages)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([lang, count]) => (
                  <span key={lang} className="text-vsc-foreground/50">
                    <span
                      className={`mr-0.5 inline-block h-1.5 w-1.5 rounded-full ${LANG_COLORS[lang.toLowerCase()] || "bg-zinc-500"}`}
                    />
                    {lang} ({count})
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Frameworks & tools */}
        {profile?.frameworks && profile.frameworks.length > 0 && (
          <div>
            <h4 className="text-vsc-foreground/50 mb-0.5 text-[10px] font-medium">
              Frameworks
            </h4>
            <div className="flex flex-wrap gap-1">
              {profile.frameworks.map((f) => (
                <span
                  key={f}
                  className="bg-vsc-input-background rounded px-1.5 py-0.5 text-[10px]"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Package manager / test runner */}
        <div className="flex gap-3 text-[10px]">
          {profile?.packageManager && (
            <span className="text-vsc-foreground/50">
              pkg:{" "}
              <span className="text-vsc-foreground/70">
                {profile.packageManager}
              </span>
            </span>
          )}
          {profile?.testRunner && (
            <span className="text-vsc-foreground/50">
              test:{" "}
              <span className="text-vsc-foreground/70">
                {profile.testRunner}
              </span>
            </span>
          )}
        </div>

        {/* Conventions */}
        {conventions.length > 0 && (
          <div>
            <h4 className="text-vsc-foreground/50 mb-0.5 text-[10px] font-medium">
              Conventions ({conventions.length})
            </h4>
            <div className="scrollbar-thin max-h-24 space-y-0.5 overflow-y-auto">
              {conventions.map((c, i) => (
                <div
                  key={i}
                  className="text-vsc-foreground/40 border-vsc-input-border border-l pl-2 text-[10px]"
                >
                  {c}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
