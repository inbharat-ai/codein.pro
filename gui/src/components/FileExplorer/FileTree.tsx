import {
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentIcon,
  FolderIcon,
  FolderOpenIcon,
} from "@heroicons/react/24/outline";
import { useContext, useEffect, useState } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { toggleDir } from "../../redux/slices/workspaceSlice";

interface FileEntry {
  name: string;
  isDir: boolean;
}

interface FileTreeProps {
  dirPath: string;
  depth: number;
  onFileClick: (path: string) => void;
}

const IGNORED = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".next",
  ".nuxt",
  "dist",
  "build",
  ".cache",
  ".vscode",
  ".idea",
  "coverage",
  ".turbo",
]);

function joinPath(base: string, name: string): string {
  const sep = base.includes("\\") ? "\\" : "/";
  return base.endsWith(sep) ? base + name : base + sep + name;
}

export function FileTree({ dirPath, depth, onFileClick }: FileTreeProps) {
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const expandedDirs = useAppSelector((s) => s.workspace.expandedDirs);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const isExpanded = expandedDirs.includes(dirPath);

  useEffect(() => {
    if (!isExpanded) return;
    let cancelled = false;
    setLoading(true);

    ideMessenger.ide
      .listDir(dirPath)
      .then((result: [string, number][]) => {
        if (cancelled) return;
        const parsed: FileEntry[] = result
          .map(([name, fileType]) => ({
            name,
            isDir: fileType === 2, // FileType.Directory = 2
          }))
          .filter((e) => !IGNORED.has(e.name) && !e.name.startsWith("."))
          .sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        setEntries(parsed);
      })
      .catch(() => setEntries([]))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [dirPath, isExpanded, ideMessenger]);

  const handleToggle = () => dispatch(toggleDir(dirPath));

  if (depth > 0 && !isExpanded) return null;

  return (
    <div>
      {isExpanded && loading && (
        <div
          className="truncate text-xs opacity-50"
          style={{ paddingLeft: (depth + 1) * 16 + 8 }}
        >
          Loading...
        </div>
      )}
      {isExpanded &&
        !loading &&
        entries.map((entry) => {
          const fullPath = joinPath(dirPath, entry.name);
          if (entry.isDir) {
            const dirExpanded = expandedDirs.includes(fullPath);
            return (
              <div key={fullPath}>
                <button
                  className="file-tree-item"
                  style={{ paddingLeft: (depth + 1) * 16 }}
                  onClick={() => dispatch(toggleDir(fullPath))}
                  title={entry.name}
                >
                  {dirExpanded ? (
                    <ChevronDownIcon className="file-tree-chevron" />
                  ) : (
                    <ChevronRightIcon className="file-tree-chevron" />
                  )}
                  {dirExpanded ? (
                    <FolderOpenIcon className="file-tree-icon folder" />
                  ) : (
                    <FolderIcon className="file-tree-icon folder" />
                  )}
                  <span className="file-tree-name">{entry.name}</span>
                </button>
                {dirExpanded && (
                  <FileTree
                    dirPath={fullPath}
                    depth={depth + 1}
                    onFileClick={onFileClick}
                  />
                )}
              </div>
            );
          }
          return (
            <button
              key={fullPath}
              className="file-tree-item"
              style={{ paddingLeft: (depth + 1) * 16 }}
              onClick={() => onFileClick(fullPath)}
              title={fullPath}
            >
              <span className="file-tree-chevron-spacer" />
              <DocumentIcon className="file-tree-icon file" />
              <span className="file-tree-name">{entry.name}</span>
            </button>
          );
        })}
    </div>
  );
}
