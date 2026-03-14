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
    <div className="bg-vsc-background flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-vsc-input-border flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-vsc-foreground text-sm font-semibold">
          {t("computer.title")}
        </h2>
        <span className="text-vsc-foreground/40 text-[10px]">
          {t("computer.subtitle")}
        </span>
      </div>

      {/* Tab bar */}
      <div className="border-vsc-input-border flex gap-0.5 border-b px-2 py-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => dispatch(setActiveTab(tab.key))}
            className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
              activeTab === tab.key
                ? "bg-blue-600 text-white"
                : "text-vsc-foreground/50 hover:text-vsc-foreground/70 hover:bg-vsc-input-background"
            }`}
          >
            {t(tab.i18nKey)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3 overflow-y-auto p-2">
        {activeTab === "run" && <ComputerRun />}
        {activeTab === "skills" && <ComputerSkills />}
        {activeTab === "workflows" && <ComputerWorkflows />}
        {activeTab === "audit" && <ComputerAudit />}
      </div>
    </div>
  );
}

export default ComputerPanel;
