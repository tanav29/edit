"use client";

import { useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileTreeBarProps {
  rootPath?: string;
  selectedFile?: string;
  isOpen: boolean;
  onFileSelect: (file: string | undefined) => void;
}

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (file: string | undefined) => void;
  selectedFile?: string;
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export default function FileTreeBar({
  rootPath,
  selectedFile,
  isOpen,
  onFileSelect,
}: FileTreeBarProps) {
  return (
    <aside
      className={cn(
        "shrink-0 min-h-0 z-50 flex-col border-l transition-all duration-200 ease-out",
        isOpen
          ? "flex w-64 translate-x-0 opacity-100"
          : "pointer-events-none flex w-0 translate-x-3 opacity-0 overflow-hidden border-l-0",
      )}>
      <div className="flex-1 min-h-0 overflow-hidden">
        {rootPath ? (
          <FileTree
            key={rootPath}
            rootPath={rootPath}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
          />
        ) : (
          <div className="p-3 text-xs text-muted-foreground">
            Select or create a chat to browse files
          </div>
        )}
      </div>
    </aside>
  );
}

function FileTree({ rootPath, onFileSelect, selectedFile }: FileTreeProps) {
  const [rootNode, setRootNode] = useState<FileNode | null | undefined>(
    undefined,
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  async function fetchNode(path: string): Promise<FileNode> {
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
    return res.json();
  }

  useEffect(() => {
    void fetchNode(rootPath)
      .then(setRootNode)
      .catch((error) => {
        console.error("Failed to load files:", error);
        setRootNode(null);
      });
  }, [rootPath]);

  async function loadChildDirectory(node: FileNode) {
    if (
      node.type !== "directory" ||
      !node.children ||
      node.children.length > 0
    ) {
      return;
    }

    try {
      const data = await fetchNode(node.path);
      setRootNode((prev) => {
        if (!prev) return prev;
        return updateNodeChildren(prev, node.path, data.children || []);
      });
    } catch (error) {
      console.error("Failed to load directory:", error);
    }
  }

  function updateNodeChildren(
    node: FileNode,
    targetPath: string,
    children: FileNode[],
  ): FileNode {
    if (node.path === targetPath) {
      return { ...node, children };
    }

    if (node.children) {
      return {
        ...node,
        children: node.children.map((child) =>
          updateNodeChildren(child, targetPath, children),
        ),
      };
    }

    return node;
  }

  function toggleDirectory(node: FileNode) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
        void loadChildDirectory(node);
      }
      return next;
    });
  }

  if (rootNode === undefined) {
    return <div className="p-3 text-xs text-muted-foreground">Loading...</div>;
  }

  if (!rootNode) {
    return (
      <div className="p-3 text-xs text-muted-foreground">No files found</div>
    );
  }

  return (
    <div className="text-xs font-mono">
      <FileTreeNode
        node={rootNode}
        depth={0}
        expandedDirs={expandedDirs}
        selectedFile={selectedFile}
        onToggle={toggleDirectory}
        onSelect={onFileSelect}
      />
    </div>
  );
}

function FileTreeNode({
  node,
  depth,
  expandedDirs,
  selectedFile,
  onToggle,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  expandedDirs: Set<string>;
  selectedFile?: string;
  onToggle: (node: FileNode) => void;
  onSelect: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedFile === node.path;
  const isDirectory = node.type === "directory";

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-accent/50 transition-colors",
          isSelected && "bg-accent",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (isDirectory) {
            onToggle(node);
          } else {
            onSelect(node.path);
          }
        }}>
        {isDirectory ? (
          <>
            <ChevronRight
              className={cn(
                "size-3 text-muted-foreground transition-transform",
                isExpanded && "rotate-90",
              )}
            />
            {isExpanded ? (
              <FolderOpen className="size-3.5 text-muted-foreground" />
            ) : (
              <Folder className="size-3.5 text-muted-foreground" />
            )}
          </>
        ) : (
          <File className="size-3.5 text-muted-foreground ml-4" />
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              selectedFile={selectedFile}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
