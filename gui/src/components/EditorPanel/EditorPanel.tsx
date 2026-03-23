import Editor from "@monaco-editor/react";
import { useCallback, useContext, useRef } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  markFileSaved,
  updateFileContent,
} from "../../redux/slices/workspaceSlice";
import { EditorTabs } from "./EditorTabs";
import "./EditorPanel.css";

export function EditorPanel() {
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const openFiles = useAppSelector((s) => s.workspace.openFiles);
  const activeFilePath = useAppSelector((s) => s.workspace.activeFilePath);
  const editorRef = useRef<any>(null);

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

  const handleEditorDidMount = useCallback((editor: any) => {
    editorRef.current = editor;
    // Ctrl+S / Cmd+S to save
    editor.addCommand(
      // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS
      2048 | 49, // CtrlCmd + S
      () => {
        handleSave();
      },
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeFile || !activeFile.isDirty) return;
    try {
      await ideMessenger.ide.writeFile(activeFile.path, activeFile.content);
      dispatch(markFileSaved(activeFile.path));
    } catch {
      // Save failed — file may be read-only or inaccessible
    }
  }, [activeFile, ideMessenger, dispatch]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!activeFilePath || value === undefined) return;
      dispatch(updateFileContent({ path: activeFilePath, content: value }));
    },
    [activeFilePath, dispatch],
  );

  if (openFiles.length === 0) {
    return (
      <div className="editor-panel">
        <div className="editor-placeholder">
          <svg viewBox="0 0 24 24" fill="none" className="h-12 w-12 opacity-20">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="mt-3 text-sm font-medium opacity-40">
            Open a file from the explorer
          </p>
          <p className="mt-1 text-xs opacity-25">
            Click a file in the sidebar or use Ctrl+P to search
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-panel">
      <EditorTabs />
      <div className="editor-content">
        {activeFile && (
          <Editor
            key={activeFile.path}
            defaultValue={activeFile.content}
            language={activeFile.language}
            theme="vs-dark"
            onChange={handleChange}
            onMount={handleEditorDidMount}
            options={{
              fontSize: 14,
              fontFamily:
                "var(--codin-font-mono, 'JetBrains Mono', 'Fira Code', monospace)",
              minimap: { enabled: true },
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              renderLineHighlight: "line",
              cursorBlinking: "smooth",
              smoothScrolling: true,
              padding: { top: 8 },
              bracketPairColorization: { enabled: true },
            }}
          />
        )}
      </div>
    </div>
  );
}
