import { XMarkIcon } from "@heroicons/react/24/outline";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  closeFile,
  setActiveFile,
  OpenFile,
} from "../../redux/slices/workspaceSlice";
import "./EditorPanel.css";

export function EditorTabs() {
  const dispatch = useAppDispatch();
  const openFiles = useAppSelector((s) => s.workspace.openFiles);
  const activeFilePath = useAppSelector((s) => s.workspace.activeFilePath);

  if (openFiles.length === 0) return null;

  return (
    <div className="editor-tabs">
      {openFiles.map((file: OpenFile) => {
        const isActive = file.path === activeFilePath;
        return (
          <button
            key={file.path}
            className={`editor-tab ${isActive ? "active" : ""}`}
            onClick={() => dispatch(setActiveFile(file.path))}
            onMouseDown={(e) => {
              // Middle-click to close
              if (e.button === 1) {
                e.preventDefault();
                dispatch(closeFile(file.path));
              }
            }}
            title={file.path}
          >
            {file.isDirty && <span className="editor-tab-dirty" />}
            <span className="editor-tab-name">{file.filename}</span>
            <span
              className="editor-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                dispatch(closeFile(file.path));
              }}
            >
              <XMarkIcon className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
