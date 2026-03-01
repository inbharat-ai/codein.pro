/**
 * FileTreeNode component used by FileTree to render individual tree entries.
 */

import React from "react";

interface TreeNode {
  path: string;
  name: string;
  type: "file" | "directory";
  children?: TreeNode[];
  expanded?: boolean;
}

interface FileTreeNodeProps {
  node: TreeNode;
  depth?: number;
  onFileClick: (node: TreeNode) => void;
  onDirectoryClick: (node: TreeNode) => void;
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  depth = 0,
  onFileClick,
  onDirectoryClick,
}) => {
  const isDir = node.type === "directory";

  return (
    <div>
      <div
        className="file-tree-item"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => (isDir ? onDirectoryClick(node) : onFileClick(node))}
        role="treeitem"
        aria-expanded={isDir ? node.expanded : undefined}
      >
        <span className="file-tree-icon">
          {isDir ? (node.expanded ? "▾" : "▸") : "📄"}
        </span>
        <span className="file-tree-name">{node.name}</span>
      </div>
      {isDir &&
        node.expanded &&
        node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onFileClick={onFileClick}
            onDirectoryClick={onDirectoryClick}
          />
        ))}
    </div>
  );
};
