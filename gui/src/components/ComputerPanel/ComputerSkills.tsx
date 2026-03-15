import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchSkills,
  selectSkills,
  type SkillInfo,
} from "../../redux/slices/computerSlice";

const TRUST_STYLES: Record<string, string> = {
  high: "bg-emerald-500/20 text-emerald-400",
  medium: "bg-codin-saffron-500/20 text-codin-saffron-400",
  low: "bg-red-500/20 text-red-400",
};

const CATEGORY_STYLES: Record<string, string> = {
  code: "bg-codin-indigo-500/20 text-codin-indigo-300",
  test: "bg-purple-500/20 text-purple-300",
  docs: "bg-teal-500/20 text-teal-300",
  deploy: "bg-orange-500/20 text-orange-300",
  refactor: "bg-codin-indigo-400/20 text-codin-indigo-200",
  security: "bg-red-500/20 text-red-300",
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
        className="bg-codin-bg-surface border-codin-border text-codin-fg placeholder:text-codin-fg-muted focus:border-codin-indigo-500 focus:ring-codin-indigo-500/30 w-full rounded-md border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1"
      />

      {/* Loading */}
      {loading && (
        <p className="text-codin-fg-muted text-[10px]">{t("common.loading")}</p>
      )}

      {/* Empty */}
      {!loading && filteredSkills.length === 0 && (
        <p className="text-codin-fg-muted py-4 text-center text-[10px]">
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
      className="bg-codin-bg-surface hover:bg-codin-bg-hover cursor-pointer rounded-md p-2.5 transition-colors"
      onClick={onToggle}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-codin-fg text-xs font-medium">
              {skill.name}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${CATEGORY_STYLES[skill.category] || "bg-codin-bg-hover text-codin-fg-muted"}`}
            >
              {skill.category}
            </span>
          </div>
          <p className="text-codin-fg-muted mt-0.5 text-[10px] leading-tight">
            {skill.description}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${TRUST_STYLES[skill.trustLevel] || "bg-codin-bg-hover text-codin-fg-muted"}`}
          >
            {skill.trustLevel}
          </span>
          <span className="text-codin-fg-muted text-[9px]">
            {skill.usageCount} {t("computer.skills.uses")}
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-codin-border mt-2 space-y-1.5 border-t pt-2">
          {skill.requiredPermissions &&
            skill.requiredPermissions.length > 0 && (
              <div>
                <span className="text-codin-fg-muted text-[9px] font-medium">
                  {t("computer.skills.permissions")}
                </span>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {skill.requiredPermissions.map((perm) => (
                    <span
                      key={perm}
                      className="bg-codin-bg-hover text-codin-fg-secondary rounded-full px-1.5 py-0.5 text-[9px]"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            )}
          {skill.estimatedCostUSD !== undefined && (
            <div className="flex items-center gap-1 text-[9px]">
              <span className="text-codin-fg-muted">
                {t("computer.skills.estimatedCost")}
              </span>
              <span className="font-mono text-emerald-400">
                ${skill.estimatedCostUSD.toFixed(4)}
              </span>
            </div>
          )}
          {skill.inputSchema && (
            <div>
              <span className="text-codin-fg-muted text-[9px] font-medium">
                {t("computer.skills.inputSchema")}
              </span>
              <pre className="bg-codin-bg text-codin-fg-secondary mt-0.5 max-h-20 overflow-auto rounded-md p-1.5 text-[9px]">
                {JSON.stringify(skill.inputSchema, null, 2)}
              </pre>
            </div>
          )}
          {skill.outputSchema && (
            <div>
              <span className="text-codin-fg-muted text-[9px] font-medium">
                {t("computer.skills.outputSchema")}
              </span>
              <pre className="bg-codin-bg text-codin-fg-secondary mt-0.5 max-h-20 overflow-auto rounded-md p-1.5 text-[9px]">
                {JSON.stringify(skill.outputSchema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
