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
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
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

interface TabOption {
  id: string;
  label: string;
  component: React.ReactNode;
  icon: React.ReactNode;
}

interface TabSection {
  id: string;
  tabs: TabOption[];
  showTopDivider?: boolean;
  showBottomDivider?: boolean;
  className?: string;
}

export const topTabSections: TabSection[] = [
  {
    id: "top",
    tabs: [
      {
        id: "back",
        label: "Back",
        component: <div />,
        icon: <ArrowLeftIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
      },
    ],
  },
  {
    id: "blocks",
    showTopDivider: true,
    tabs: [
      {
        id: "models",
        label: "Models",
        component: (
          <ConfigSection>
            <ModelsSection />
          </ConfigSection>
        ),
        icon: <CubeIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
      },
      {
        id: "rules",
        label: "Rules",
        component: (
          <ConfigSection>
            <RulesSection />
          </ConfigSection>
        ),
        icon: <PencilIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
      },
      {
        id: "tools",
        label: "Tools",
        component: (
          <ConfigSection>
            <ToolsSection />
          </ConfigSection>
        ),
        icon: (
          <WrenchScrewdriverIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
    ],
  },
  {
    id: "actions",
    showTopDivider: true,
    tabs: [
      {
        id: "agent-activity",
        label: "Agent Activity",
        component: (
          <ConfigSection>
            <AgentActivitySection />
          </ConfigSection>
        ),
        icon: (
          <ClipboardDocumentListIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
      {
        id: "run",
        label: "Run",
        component: (
          <ConfigSection>
            <RunSection />
          </ConfigSection>
        ),
        icon: (
          <PlayCircleIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
      {
        id: "git",
        label: "Git",
        component: (
          <ConfigSection>
            <GitSection />
          </ConfigSection>
        ),
        icon: (
          <CodeBracketSquareIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
      {
        id: "deploy",
        label: "Deploy",
        component: (
          <ConfigSection>
            <DeploySection />
          </ConfigSection>
        ),
        icon: (
          <RocketLaunchIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
      {
        id: "mcp",
        label: "MCP",
        component: (
          <ConfigSection>
            <McpSection />
          </ConfigSection>
        ),
        icon: (
          <ServerStackIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
    ],
  },
  {
    id: "agents-orgs",
    showTopDivider: true,
    tabs: [
      {
        id: "configs",
        label: "Configs",
        component: (
          <ConfigSection>
            <ConfigsSection />
          </ConfigSection>
        ),
        icon: <DocumentIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
      },
      {
        id: "organizations",
        label: "Organizations",
        component: (
          <ConfigSection>
            <OrganizationsSection />
          </ConfigSection>
        ),
        icon: (
          <BuildingOfficeIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
    ],
  },
  {
    id: "indexing",
    showTopDivider: true,
    tabs: [
      {
        id: "indexing",
        label: "Indexing",
        component: (
          <ConfigSection>
            <IndexingSettingsSection />
          </ConfigSection>
        ),
        icon: (
          <CircleStackIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
    ],
  },
];

export const bottomTabSections: TabSection[] = [
  {
    id: "bottom",
    tabs: [
      {
        id: "settings",
        label: "Settings",
        component: (
          <ConfigSection>
            <UserSettingsSection />
          </ConfigSection>
        ),
        icon: <Cog6ToothIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
      },
      {
        id: "help",
        label: "Help",
        component: (
          <ConfigSection>
            <HelpSection />
          </ConfigSection>
        ),
        icon: (
          <QuestionMarkCircleIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
    ],
  },
];

export const getAllTabs = (): TabOption[] => {
  return [...topTabSections, ...bottomTabSections].flatMap(
    (section) => section.tabs,
  );
};
