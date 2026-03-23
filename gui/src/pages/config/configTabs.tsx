import {
  ArrowLeftIcon,
  BuildingOfficeIcon,
  CircleStackIcon,
  ClipboardDocumentListIcon,
  CodeBracketSquareIcon,
  Cog6ToothIcon,
  CubeIcon,
  DocumentIcon,
  PencilIcon,
  PlayCircleIcon,
  QuestionMarkCircleIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  ShareIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ConfigSection } from "./components/ConfigSection";
import { ConfigsSection } from "./sections/ConfigsSection";
import { DeploySection } from "./sections/DeploySection";
import { GitSection } from "./sections/GitSection";
import { HelpSection } from "./sections/HelpSection";
import { IndexingSettingsSection } from "./sections/IndexingSettingsSection";
import { McpSection } from "./sections/McpSection";
import { ModelsSection } from "./sections/ModelsSection";
import { OrganizationsSection } from "./sections/OrganizationsSection";
import { RulesSection } from "./sections/RulesSection";
import { RunSection } from "./sections/RunSection";
import { ToolsSection } from "./sections/ToolsSection";
import { UserSettingsSection } from "./sections/UserSettingsSection";
import { AgentActivitySection } from "./sections/AgentActivitySection";
import { GitNexusSection } from "./sections/GitNexusSection";

interface TabOption {
  id: string;
  label: string;
  component: React.ReactNode;
  icon: React.ReactNode;
}

interface TabSection {
  id: string;
  label?: string;
  tabs: TabOption[];
  showTopDivider?: boolean;
  showBottomDivider?: boolean;
  className?: string;
}

const iconClass = "xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0";

function wrap(Section: React.ComponentType) {
  return (
    <ErrorBoundary>
      <ConfigSection>
        <Section />
      </ConfigSection>
    </ErrorBoundary>
  );
}

/**
 * Settings page tab structure
 *
 * AI Setup     — Models, Rules, Tools, MCP Servers
 * Workspace    — Run, Git, Deploy, Config Files, Indexing, Code Graph
 * Account      — Organizations, Agent Activity
 * ---
 * General      — Settings, Help
 */
export const topTabSections: TabSection[] = [
  {
    id: "nav",
    tabs: [
      {
        id: "back",
        label: "Back",
        component: <div />,
        icon: <ArrowLeftIcon className={iconClass} />,
      },
    ],
  },
  {
    id: "ai-setup",
    label: "AI Setup",
    showTopDivider: true,
    tabs: [
      {
        id: "models",
        label: "Models",
        component: wrap(ModelsSection),
        icon: <CubeIcon className={iconClass} />,
      },
      {
        id: "rules",
        label: "Rules",
        component: wrap(RulesSection),
        icon: <PencilIcon className={iconClass} />,
      },
      {
        id: "tools",
        label: "Tools",
        component: wrap(ToolsSection),
        icon: <WrenchScrewdriverIcon className={iconClass} />,
      },
      {
        id: "mcp",
        label: "MCP Servers",
        component: wrap(McpSection),
        icon: <ServerStackIcon className={iconClass} />,
      },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    showTopDivider: true,
    tabs: [
      {
        id: "run",
        label: "Run & Debug",
        component: wrap(RunSection),
        icon: <PlayCircleIcon className={iconClass} />,
      },
      {
        id: "git",
        label: "Git",
        component: wrap(GitSection),
        icon: <CodeBracketSquareIcon className={iconClass} />,
      },
      {
        id: "deploy",
        label: "Deploy",
        component: wrap(DeploySection),
        icon: <RocketLaunchIcon className={iconClass} />,
      },
      {
        id: "configs",
        label: "Config Files",
        component: wrap(ConfigsSection),
        icon: <DocumentIcon className={iconClass} />,
      },
      {
        id: "indexing",
        label: "Indexing",
        component: wrap(IndexingSettingsSection),
        icon: <CircleStackIcon className={iconClass} />,
      },
      {
        id: "code-graph",
        label: "Code Graph",
        component: wrap(GitNexusSection),
        icon: <ShareIcon className={iconClass} />,
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    showTopDivider: true,
    tabs: [
      {
        id: "organizations",
        label: "Organizations",
        component: wrap(OrganizationsSection),
        icon: <BuildingOfficeIcon className={iconClass} />,
      },
      {
        id: "agent-activity",
        label: "Activity Log",
        component: wrap(AgentActivitySection),
        icon: <ClipboardDocumentListIcon className={iconClass} />,
      },
    ],
  },
];

export const bottomTabSections: TabSection[] = [
  {
    id: "general",
    tabs: [
      {
        id: "settings",
        label: "General",
        component: wrap(UserSettingsSection),
        icon: <Cog6ToothIcon className={iconClass} />,
      },
      {
        id: "help",
        label: "Help",
        component: wrap(HelpSection),
        icon: <QuestionMarkCircleIcon className={iconClass} />,
      },
    ],
  },
];

export const getAllTabs = (): TabOption[] => {
  return [...topTabSections, ...bottomTabSections].flatMap(
    (section) => section.tabs,
  );
};
