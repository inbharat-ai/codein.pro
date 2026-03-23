import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { useAppSelector } from "../redux/hooks";
import { ErrorBoundary } from "./ErrorBoundary";
import { EditorPanel } from "./EditorPanel/EditorPanel";
import { TerminalPanel } from "./TerminalPanel/TerminalPanel";

export default function WorkspaceLayout() {
  const terminalVisible = useAppSelector((s) => s.workspace.terminalVisible);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Allotment vertical>
        <Allotment.Pane>
          <ErrorBoundary>
            <EditorPanel />
          </ErrorBoundary>
        </Allotment.Pane>
        {terminalVisible && (
          <Allotment.Pane minSize={80} preferredSize={200} snap>
            <ErrorBoundary>
              <TerminalPanel />
            </ErrorBoundary>
          </Allotment.Pane>
        )}
      </Allotment>
    </div>
  );
}
