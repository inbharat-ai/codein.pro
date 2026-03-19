import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  selectActiveTab,
  setActiveTab,
  type ComputerTab,
} from "../../redux/slices/computerSlice";
import { ComputerRun } from "./ComputerRun";
import { ComputerSkills } from "./ComputerSkills";
import { ComputerWorkflows } from "./ComputerWorkflows";
import { ComputerAudit } from "./ComputerAudit";

const tabs: { key: ComputerTab; i18nKey: string }[] = [
  { key: "run", i18nKey: "computer.tabs.run" },
  { key: "skills", i18nKey: "computer.tabs.skills" },
  { key: "workflows", i18nKey: "computer.tabs.workflows" },
  { key: "audit", i18nKey: "computer.tabs.audit" },
];

export function ComputerPanel() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const activeTab = useAppSelector(selectActiveTab);

  return (
    <div className="bg-codin-bg flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-codin-border flex items-center justify-between border-b px-3 py-2.5">
        <h2 className="text-codin-fg text-sm font-semibold">
          {t("computer.title")}
        </h2>
        <span className="text-codin-fg-muted text-[10px] tracking-wide">
          {t("computer.subtitle")}
        </span>
      </div>

      {/* Tab bar */}
      <div className="border-codin-border flex gap-1 border-b px-3 py-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => dispatch(setActiveTab(tab.key))}
            className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
              activeTab === tab.key
                ? "bg-codin-indigo-600 shadow-codin-indigo-600/25 text-white shadow-sm"
                : "text-codin-fg-muted hover:text-codin-fg-secondary hover:bg-codin-bg-hover"
            }`}
          >
            {t(tab.i18nKey)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3">
        {activeTab === "run" && <ComputerRun />}
        {activeTab === "skills" && <ComputerSkills />}
        {activeTab === "workflows" && <ComputerWorkflows />}
        {activeTab === "audit" && <ComputerAudit />}
      </div>
    </div>
  );
}

export default ComputerPanel;
