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
          <ErrorBoundary>
            <ConfigSection>
              <ModelsSection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: <CubeIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
      },
      {
        id: "rules",
        label: "Rules",
        component: (
          <ErrorBoundary>
            <ConfigSection>
              <RulesSection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: <PencilIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
      },
      {
        id: "tools",
        label: "Tools",
        component: (
          <ErrorBoundary>
            <ConfigSection>
              <ToolsSection />
            </ConfigSection>
          </ErrorBoundary>
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
          <ErrorBoundary>
            <ConfigSection>
              <AgentActivitySection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: (
          <ClipboardDocumentListIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
      {
        id: "run",
        label: "Run",
        component: (
          <ErrorBoundary>
            <ConfigSection>
              <RunSection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: (
          <PlayCircleIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
      {
        id: "git",
        label: "Git",
        component: (
          <ErrorBoundary>
            <ConfigSection>
              <GitSection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: (
          <CodeBracketSquareIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
      {
        id: "deploy",
        label: "Deploy",
        component: (
          <ErrorBoundary>
            <ConfigSection>
              <DeploySection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: (
          <RocketLaunchIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
      {
        id: "mcp",
        label: "MCP",
        component: (
          <ErrorBoundary>
            <ConfigSection>
              <McpSection />
            </ConfigSection>
          </ErrorBoundary>
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
          <ErrorBoundary>
            <ConfigSection>
              <ConfigsSection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: <DocumentIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
      },
      {
        id: "organizations",
        label: "Organizations",
        component: (
          <ErrorBoundary>
            <ConfigSection>
              <OrganizationsSection />
            </ConfigSection>
          </ErrorBoundary>
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
          <ErrorBoundary>
            <ConfigSection>
              <IndexingSettingsSection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: (
          <CircleStackIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />
        ),
      },
      {
        id: "code-graph",
        label: "Code Graph",
        component: (
          <ErrorBoundary>
            <ConfigSection>
              <GitNexusSection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: <ShareIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
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
          <ErrorBoundary>
            <ConfigSection>
              <UserSettingsSection />
            </ConfigSection>
          </ErrorBoundary>
        ),
        icon: <Cog6ToothIcon className="xs:h-4 xs:w-4 h-3 w-3 flex-shrink-0" />,
      },
      {
        id: "help",
        label: "Help",
        component: (
          <ErrorBoundary>
            <ConfigSection>
              <HelpSection />
            </ConfigSection>
          </ErrorBoundary>
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
