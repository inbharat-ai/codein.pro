import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchSkills,
  selectSkills,
  type SkillInfo,
} from "../../redux/slices/computerSlice";

const TRUST_COLORS: Record<string, string> = {
  high: "bg-green-600",
  medium: "bg-yellow-600",
  low: "bg-red-600",
};

const CATEGORY_COLORS: Record<string, string> = {
  code: "bg-blue-600",
  test: "bg-purple-600",
  docs: "bg-teal-600",
  deploy: "bg-orange-600",
  refactor: "bg-indigo-600",
  security: "bg-red-600",
};

export function ComputerSkills() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { items: skills, loading } = useAppSelector(selectSkills);
  const [search, setSearch] = useState("");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchSkills(undefined));
  }, [dispatch]);

  const filteredSkills = search.trim()
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.description.toLowerCase().includes(search.toLowerCase()) ||
          s.category.toLowerCase().includes(search.toLowerCase()),
      )
    : skills;

  const toggleExpand = (name: string) => {
    setExpandedSkill(expandedSkill === name ? null : name);
  };

  return (
    <div className="space-y-2">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("computer.skills.searchPlaceholder")}
        className="bg-vsc-input-background border-vsc-input-border text-vsc-foreground w-full rounded border px-2 py-1 text-xs placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
      />

      {/* Loading */}
      {loading && (
        <p className="text-vsc-foreground/40 text-[10px]">
          {t("common.loading")}
        </p>
      )}

      {/* Empty */}
      {!loading && filteredSkills.length === 0 && (
        <p className="text-vsc-foreground/40 py-4 text-center text-[10px]">
          {t("computer.skills.empty")}
        </p>
      )}

      {/* Skill grid */}
      {filteredSkills.length > 0 && (
        <div className="grid grid-cols-1 gap-1.5">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              expanded={expandedSkill === skill.name}
              onToggle={() => toggleExpand(skill.name)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  expanded,
  onToggle,
  t,
}: {
  skill: SkillInfo;
  expanded: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="bg-vsc-input-background cursor-pointer rounded p-2 transition-colors hover:bg-zinc-700/50"
      onClick={onToggle}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-vsc-foreground text-xs font-medium">
              {skill.name}
            </span>
            <span
              className={`rounded px-1 py-0.5 text-[8px] font-medium text-white ${CATEGORY_COLORS[skill.category] || "bg-zinc-600"}`}
            >
              {skill.category}
            </span>
          </div>
          <p className="text-vsc-foreground/50 mt-0.5 text-[10px] leading-tight">
            {skill.description}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={`rounded px-1 py-0.5 text-[8px] font-medium text-white ${TRUST_COLORS[skill.trustLevel] || "bg-zinc-600"}`}
          >
            {skill.trustLevel}
          </span>
          <span className="text-vsc-foreground/30 text-[9px]">
            {skill.usageCount} {t("computer.skills.uses")}
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-zinc-700 pt-2">
          {skill.requiredPermissions &&
            skill.requiredPermissions.length > 0 && (
              <div>
                <span className="text-vsc-foreground/50 text-[9px] font-medium">
                  {t("computer.skills.permissions")}
                </span>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {skill.requiredPermissions.map((perm) => (
                    <span
                      key={perm}
                      className="rounded bg-zinc-700 px-1 py-0.5 text-[9px] text-zinc-300"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            )}
          {skill.estimatedCostUSD !== undefined && (
            <div className="flex items-center gap-1 text-[9px]">
              <span className="text-vsc-foreground/50">
                {t("computer.skills.estimatedCost")}
              </span>
              <span className="font-mono text-green-400">
                ${skill.estimatedCostUSD.toFixed(4)}
              </span>
            </div>
          )}
          {skill.inputSchema && (
            <div>
              <span className="text-vsc-foreground/50 text-[9px] font-medium">
                {t("computer.skills.inputSchema")}
              </span>
              <pre className="scrollbar-thin mt-0.5 max-h-20 overflow-auto rounded bg-zinc-800 p-1 text-[9px] text-zinc-400">
                {JSON.stringify(skill.inputSchema, null, 2)}
              </pre>
            </div>
          )}
          {skill.outputSchema && (
            <div>
              <span className="text-vsc-foreground/50 text-[9px] font-medium">
                {t("computer.skills.outputSchema")}
              </span>
              <pre className="scrollbar-thin mt-0.5 max-h-20 overflow-auto rounded bg-zinc-800 p-1 text-[9px] text-zinc-400">
                {JSON.stringify(skill.outputSchema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
