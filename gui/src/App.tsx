import React, { Suspense } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import { MainEditorProvider } from "./components/mainInput/TipTapEditor";
import { LoadingPanel } from "./components/ui/LoadingState";
import { ToastProvider } from "./components/ui/Toast";
import { SubmenuContextProvidersProvider } from "./context/SubmenuContextProviders";
import { VscThemeProvider } from "./context/VscTheme";
import ParallelListeners from "./hooks/ParallelListeners";
import { initializeTheme } from "./hooks/useTheme";
import Chat from "./pages/gui";
import ErrorPage from "./pages/error";
import { ROUTES } from "./util/navigation";

// Apply theme before first paint to prevent flash
initializeTheme();

// ── Lazy-loaded routes (code-split) ──────────────────────────────────
const ConfigPage = React.lazy(() => import("./pages/config"));
const History = React.lazy(() => import("./pages/history"));
const Stats = React.lazy(() => import("./pages/stats"));
const ThemePage = React.lazy(() => import("./styles/ThemePage"));

const ComputePanel = React.lazy(() => import("./components/ComputePanel"));
const SwarmPanel = React.lazy(() =>
  import("./components/SwarmPanel/SwarmPanel").then((m) => ({
    default: m.SwarmPanel,
  })),
);
const AIHubPanel = React.lazy(() =>
  import("./components/AIHubPanel/AIHubPanel").then((m) => ({
    default: m.AIHubPanel,
  })),
);
const ComputerPanel = React.lazy(() =>
  import("./components/ComputerPanel/ComputerPanel").then((m) => ({
    default: m.ComputerPanel,
  })),
);
const MCPToolsPanel = React.lazy(() =>
  import("./components/MCPToolsPanel").then((m) => ({
    default: m.MCPToolsPanel,
  })),
);
const GpuPanel = React.lazy(() => import("./components/GpuPanel"));
const GitPanel = React.lazy(() => import("./components/GitPanel"));
const PermissionsPanel = React.lazy(
  () => import("./components/PermissionsPanel"),
);
const PipelinePanel = React.lazy(() => import("./components/PipelinePanel"));
const RepoIntelligencePanel = React.lazy(
  () => import("./components/RepoIntelligencePanel"),
);
const ResearchPanel = React.lazy(() => import("./components/ResearchPanel"));
const WorkspaceLayout = React.lazy(
  () => import("./components/WorkspaceLayout"),
);

// ── Helper: wrap a lazy component in Suspense ────────────────────────
function lazySuspense(
  Component: React.LazyExoticComponent<React.ComponentType<any>>,
  message?: string,
) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingPanel message={message ?? "Loading..."} />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

const router = createMemoryRouter([
  {
    path: ROUTES.HOME,
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/index.html",
        element: <Chat />,
      },
      {
        path: ROUTES.HOME,
        element: <Chat />,
      },
      {
        path: ROUTES.WORKSPACE,
        element: lazySuspense(WorkspaceLayout, "Loading workspace..."),
      },
      {
        path: ROUTES.HISTORY,
        element: lazySuspense(History, "Loading history..."),
      },
      {
        path: ROUTES.STATS,
        element: lazySuspense(Stats, "Loading stats..."),
      },
      {
        path: ROUTES.CONFIG,
        element: lazySuspense(ConfigPage, "Loading settings..."),
      },
      {
        path: ROUTES.THEME,
        element: lazySuspense(ThemePage, "Loading theme..."),
      },
      {
        path: ROUTES.COMPUTE,
        element: lazySuspense(ComputePanel, "Loading compute..."),
      },
      {
        path: ROUTES.MCP,
        element: lazySuspense(MCPToolsPanel, "Loading MCP tools..."),
      },
      {
        path: ROUTES.SWARM,
        element: lazySuspense(SwarmPanel, "Loading swarm..."),
      },
      {
        path: ROUTES.PIPELINE,
        element: lazySuspense(PipelinePanel, "Loading pipeline..."),
      },
      {
        path: ROUTES.REPO_INTELLIGENCE,
        element: lazySuspense(
          RepoIntelligencePanel,
          "Loading repo intelligence...",
        ),
      },
      {
        path: ROUTES.PERMISSIONS,
        element: lazySuspense(PermissionsPanel, "Loading permissions..."),
      },
      {
        path: ROUTES.RESEARCH,
        element: lazySuspense(ResearchPanel, "Loading research..."),
      },
      {
        path: ROUTES.GIT,
        element: lazySuspense(GitPanel, "Loading git..."),
      },
      {
        path: ROUTES.GPU,
        element: lazySuspense(GpuPanel, "Loading GPU..."),
      },
      {
        path: ROUTES.AI_HUB,
        element: lazySuspense(AIHubPanel, "Loading AI Hub..."),
      },
      {
        path: ROUTES.COMPUTER,
        element: lazySuspense(ComputerPanel, "Loading computer use..."),
      },
    ],
  },
]);

/*
  ParallelListeners prevents entire app from rerendering on any change in the listeners,
  most of which interact with redux etc.
*/
function App() {
  return (
    <ErrorBoundary>
      <VscThemeProvider>
        <ToastProvider>
          <MainEditorProvider>
            <SubmenuContextProvidersProvider>
              <RouterProvider router={router} />
            </SubmenuContextProvidersProvider>
          </MainEditorProvider>
          <ParallelListeners />
        </ToastProvider>
      </VscThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
