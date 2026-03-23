import {
  ArrowPathIcon,
  FolderPlusIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useContext, useEffect } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  collapseAllDirs,
  openFile,
  setWorkspacePath,
  toggleDir,
} from "../../redux/slices/workspaceSlice";
import { FileTree } from "./FileTree";
import "./FileExplorer.css";

export function FileExplorer() {
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const workspacePath = useAppSelector((s) => s.workspace.workspacePath);
  const expandedDirs = useAppSelector((s) => s.workspace.expandedDirs);

  // Auto-detect workspace on mount
  useEffect(() => {
    if (workspacePath) return;
    ideMessenger.ide
      .getWorkspaceDirs()
      .then((dirs: string[]) => {
        if (dirs.length > 0) {
          dispatch(setWorkspacePath(dirs[0]));
          dispatch(toggleDir(dirs[0]));
        }
      })
      .catch(() => {});
  }, [workspacePath, ideMessenger, dispatch]);

  const handleFileClick = useCallback(
    async (path: string) => {
      try {
        const content = await ideMessenger.ide.readFile(path);
        dispatch(openFile({ path, content }));
      } catch {
        // File read failed — may be binary or inaccessible
      }
    },
    [ideMessenger, dispatch],
  );

  const handleRefresh = useCallback(() => {
    dispatch(collapseAllDirs());
    if (workspacePath) {
      dispatch(toggleDir(workspacePath));
    }
  }, [dispatch, workspacePath]);

  const folderName = workspacePath
    ? workspacePath.split(/[/\\]/).pop() || workspacePath
    : null;

  if (!workspacePath) {
    return (
      <div className="file-explorer">
        <div className="file-explorer-header">
          <span className="file-explorer-title">EXPLORER</span>
        </div>
        <div className="file-explorer-empty">
          <FolderPlusIcon className="h-8 w-8 opacity-30" />
          <p className="mt-2 text-xs opacity-50">No workspace open</p>
          <p className="mt-1 text-[11px] opacity-30">
            Open the app in a project folder to browse files
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <span className="file-explorer-title">EXPLORER</span>
        <div className="file-explorer-actions">
          <button
            onClick={handleRefresh}
            className="file-explorer-action-btn"
            title="Refresh"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => dispatch(collapseAllDirs())}
            className="file-explorer-action-btn"
            title="Collapse All"
          >
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Workspace root */}
      <button
        className="file-tree-item file-tree-root"
        onClick={() => {
          if (expandedDirs.includes(workspacePath)) {
            dispatch(collapseAllDirs());
          } else {
            dispatch(toggleDir(workspacePath));
          }
        }}
      >
        <ChevronDownIcon
          className={`file-tree-chevron ${expandedDirs.includes(workspacePath) ? "expanded" : "collapsed"}`}
        />
        <span className="file-tree-name text-[11px] font-semibold uppercase">
          {folderName}
        </span>
      </button>

      <div className="file-explorer-tree">
        <FileTree
          dirPath={workspacePath}
          depth={0}
          onFileClick={handleFileClick}
        />
      </div>
    </div>
  );
}
