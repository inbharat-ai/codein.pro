import { RouterProvider, createMemoryRouter } from "react-router-dom";
import ComputePanel from "./components/ComputePanel";
import GitPanel from "./components/GitPanel";
import GpuPanel from "./components/GpuPanel";
import Layout from "./components/Layout";
import { MCPToolsPanel } from "./components/MCPToolsPanel";
import PermissionsPanel from "./components/PermissionsPanel";
import PipelinePanel from "./components/PipelinePanel";
import RepoIntelligencePanel from "./components/RepoIntelligencePanel";
import ResearchPanel from "./components/ResearchPanel";
import { SwarmPanel } from "./components/SwarmPanel/SwarmPanel";
import { MainEditorProvider } from "./components/mainInput/TipTapEditor";
import { SubmenuContextProvidersProvider } from "./context/SubmenuContextProviders";
import { VscThemeProvider } from "./context/VscTheme";
import ParallelListeners from "./hooks/ParallelListeners";
import ConfigPage from "./pages/config";
import ErrorPage from "./pages/error";
import Chat from "./pages/gui";
import History from "./pages/history";
import Stats from "./pages/stats";
import ThemePage from "./styles/ThemePage";
import { ROUTES } from "./util/navigation";

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
        path: ROUTES.HISTORY,
        element: <History />,
      },
      {
        path: ROUTES.STATS,
        element: <Stats />,
      },
      {
        path: ROUTES.CONFIG,
        element: <ConfigPage />,
      },
      {
        path: ROUTES.THEME,
        element: <ThemePage />,
      },
      {
        path: ROUTES.COMPUTE,
        element: <ComputePanel />,
      },
      {
        path: ROUTES.MCP,
        element: <MCPToolsPanel />,
      },
      {
        path: ROUTES.SWARM,
        element: <SwarmPanel />,
      },
      {
        path: ROUTES.PIPELINE,
        element: <PipelinePanel />,
      },
      {
        path: ROUTES.REPO_INTELLIGENCE,
        element: <RepoIntelligencePanel />,
      },
      {
        path: ROUTES.PERMISSIONS,
        element: <PermissionsPanel />,
      },
      {
        path: ROUTES.RESEARCH,
        element: <ResearchPanel />,
      },
      {
        path: ROUTES.GIT,
        element: <GitPanel />,
      },
      {
        path: ROUTES.GPU,
        element: <GpuPanel />,
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
    <VscThemeProvider>
      <MainEditorProvider>
        <SubmenuContextProvidersProvider>
          <RouterProvider router={router} />
        </SubmenuContextProvidersProvider>
      </MainEditorProvider>
      <ParallelListeners />
    </VscThemeProvider>
  );
}

export default App;
