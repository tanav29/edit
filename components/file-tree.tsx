"use client";

import { memo, useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { FileViewer } from "./file-viewer";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface FileTreeBarProps {
  rootPath?: string | null;
  isOpen: boolean;
}

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
  selectedFile?: string;
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

export default function FileTreeBar({ rootPath, isOpen }: FileTreeBarProps) {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();

  useEffect(() => {
    if (!selectedFile) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedFile(undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedFile]);

  return (
    <>
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
              onFileSelect={(filepath: string) => setSelectedFile(filepath)}
            />
          ) : (
            <div className="p-3 text-xs text-muted-foreground">
              Select or create a chat to browse files
            </div>
          )}
        </div>
      </aside>

      {selectedFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <button
            type="button"
            aria-label="Close file viewer"
            className="absolute inset-0"
            onClick={() => setSelectedFile(undefined)}
          />

          <div className="relative z-10 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-100">
            <FileViewer
              filePath={selectedFile}
              onClose={() => setSelectedFile(undefined)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function FileTree({ rootPath, onFileSelect, selectedFile }: FileTreeProps) {
  const queryClient = useQueryClient();
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const { data: rootNode, isLoading } = useQuery<FileNode>({
    queryKey: ["file-tree", rootPath],
    queryFn: async () => {
      const res = await fetch(
        `/api/files?path=${encodeURIComponent(rootPath)}`,
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Failed to load files");
      }
      return (await res.json()) as FileNode;
    },
    enabled: Boolean(rootPath),
  });

  let treeRoot: FileNode | null = rootNode ?? null;
  if (treeRoot) {
    for (const path of expandedDirs) {
      const cached = queryClient.getQueryData<FileNode>(["file-tree", path]);
      if (!cached?.children) continue;
      treeRoot = updateNodeChildren(treeRoot, path, cached.children);
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
      const data = await queryClient.fetchQuery<FileNode>({
        queryKey: ["file-tree", node.path],
        queryFn: async () => {
          const res = await fetch(
            `/api/files?path=${encodeURIComponent(node.path)}`,
          );
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(payload?.error || "Failed to load directory");
          }
          return (await res.json()) as FileNode;
        },
      });
      if (data.children) {
        queryClient.setQueryData(["file-tree", node.path], data);
      }
    } catch (error) {
      console.error("Failed to load directory:", error);
    }
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

  if (isLoading) {
    return <div className="p-3 text-xs text-muted-foreground">Loading...</div>;
  }

  if (!treeRoot) {
    return (
      <div className="p-3 text-xs text-muted-foreground">No files found</div>
    );
  }

  return (
    <div className="text-xs font-mono">
      <FileTreeNode
        node={treeRoot}
        depth={0}
        expandedDirs={expandedDirs}
        selectedFile={selectedFile}
        onToggle={toggleDirectory}
        onSelect={onFileSelect}
      />
    </div>
  );
}

const FileTreeNode = memo(function FileTreeNode({
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
});
