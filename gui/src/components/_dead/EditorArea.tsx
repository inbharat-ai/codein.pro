/**
 * Main Editor Area - Monaco Editor with Tabs
 */

import { Editor, useMonaco } from "@monaco-editor/react";
import React, { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setActiveFile, setEditorValue } from "../redux/slices/editorSlice";
import "./EditorArea.css";

interface EditorFile {
  id: string;
  path: string;
  content: string;
  isDirty: boolean;
  language: string;
}

export const EditorArea: React.FC = () => {
  const dispatch = useDispatch();
  const monaco = useMonaco();
  const openFiles = useSelector((state: any) => state.editor.openFiles);
  const activeFileId = useSelector((state: any) => state.editor.activeFileId);
  const editorRef = useRef<any>(null);

  const activeFile = openFiles.find((f: EditorFile) => f.id === activeFileId);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      dispatch(setEditorValue({ fileId: activeFileId, content: value }));
    }
  };

  const handleTabClick = (fileId: string) => {
    dispatch(setActiveFile(fileId));
  };

  const handleTabClose = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Dispatch close file action
  };

  useEffect(() => {
    // Auto-save on change (with debounce)
    if (activeFile && activeFile.isDirty) {
      const timer = setTimeout(() => {
        saveFile(activeFile);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeFile?.content]);

  const saveFile = async (file: EditorFile) => {
    try {
      await window.codinAPI.fs.writeFile(file.path, file.content);
      // Dispatch save success
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  if (!activeFile) {
    return (
      <div className="editor-area empty">
        <div className="welcome-message">
          <h2>Open a file to start editing</h2>
          <p>Select a file from the explorer or use Ctrl+P to open files</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-area">
      <div className="editor-tabs">
        {openFiles.map((file: EditorFile) => (
          <div
            key={file.id}
            className={`editor-tab ${activeFileId === file.id ? "active" : ""} ${
              file.isDirty ? "dirty" : ""
            }`}
            onClick={() => handleTabClick(file.id)}
          >
            <span className="tab-label">{file.path.split("/").pop()}</span>
            {file.isDirty && <span className="dirty-indicator">●</span>}
            <button
              className="tab-close"
              onClick={(e) => handleTabClose(file.id, e)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="editor-content">
        <Editor
          height="100%"
          language={activeFile.language}
          value={activeFile.content}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            formatOnPaste: true,
            formatOnType: true,
            autoClosingBrackets: "always",
            autoClosingQuotes: "always",
            autoClosingDelete: "always",
            autoSurround: "languageDefined",
          }}
        />
      </div>
    </div>
  );
};
