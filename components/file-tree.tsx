"use client";

import { useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function FileTree({
  rootPath,
  onFileSelect,
  selectedFile,
}: FileTreeProps) {
  const [rootNode, setRootNode] = useState<FileNode | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDirectory(rootPath);
  }, [rootPath]);

  async function loadDirectory(path: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setRootNode(data);
    } catch (error) {
      console.error("Failed to load files:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadChildDirectory(node: FileNode) {
    if (
      node.type !== "directory" ||
      !node.children ||
      node.children.length > 0
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/files?path=${encodeURIComponent(node.path)}`,
      );
      const data = await res.json();

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

  function toggleDir(node: FileNode) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
        loadChildDirectory(node);
      }
      return next;
    });
  }

  if (loading) {
    return <div className="p-3 text-xs text-muted-foreground">Loading...</div>;
  }

  if (!rootNode) {
    return (
      <div className="p-3 text-xs text-muted-foreground">No files found</div>
    );
  }

  return (
    <div className="text-xs">
      <FileTreeNode
        node={rootNode}
        depth={0}
        expandedDirs={expandedDirs}
        selectedFile={selectedFile}
        onToggle={toggleDir}
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
        }}
      >
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
