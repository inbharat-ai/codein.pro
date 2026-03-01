/**
 * File Tree/Explorer Component
 */

import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { openFile } from "../redux/slices/editorSlice";
import { FileTreeNode } from "./FileTreeNode";
import "./FileTree.css";

interface TreeNode {
  path: string;
  name: string;
  type: "file" | "directory";
  children?: TreeNode[];
  expanded?: boolean;
}

export const FileTree: React.FC = () => {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const dispatch = useDispatch();
  const workspacePath = useSelector((state: any) => state.workspace.path);

  useEffect(() => {
    if (workspacePath) {
      loadFileTree();
    }
  }, [workspacePath]);

  const loadFileTree = async () => {
    try {
      setLoading(true);
      const files = await window.codinAPI.fs.readDir("");
      const nodes = await buildTree(files, "");
      setTree(nodes);
    } catch (error) {
      console.error("Failed to load file tree:", error);
    } finally {
      setLoading(false);
    }
  };

  const buildTree = async (
    items: string[],
    basePath: string,
  ): Promise<TreeNode[]> => {
    const nodes: TreeNode[] = [];

    for (const item of items) {
      const isDir = item.endsWith("/");
      const path = basePath ? `${basePath}/${item}` : item;
      const name = item.replace(/\/$/, "");

      nodes.push({
        path,
        name,
        type: isDir ? "directory" : "file",
        children: isDir ? [] : undefined,
        expanded: false,
      });
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  };

  const handleFileClick = (fileNode: TreeNode) => {
    if (fileNode.type === "file") {
      dispatch(openFile(fileNode.path));
    }
  };

  const handleDirectoryClick = async (dirNode: TreeNode) => {
    if (!dirNode.expanded && dirNode.children?.length === 0) {
      try {
        const files = await window.codinAPI.fs.readDir(dirNode.path);
        const children = await buildTree(files, dirNode.path);
        dirNode.children = children;
      } catch (error) {
        console.error("Failed to load directory:", error);
      }
    }

    dirNode.expanded = !dirNode.expanded;
    setTree([...tree!]);
  };

  if (loading) {
    return <div className="file-tree loading">Loading...</div>;
  }

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>Explorer</h3>
        <div className="file-tree-actions">
          <button title="New File" aria-label="New File">
            +
          </button>
          <button title="Refresh" aria-label="Refresh" onClick={loadFileTree}>
            ↻
          </button>
        </div>
      </div>

      <div className="file-tree-content">
        {tree?.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            onFileClick={handleFileClick}
            onDirectoryClick={handleDirectoryClick}
          />
        ))}
      </div>
    </div>
  );
};
