"use client";

import { useState, useEffect, useCallback } from "react";
import { Folder, FolderOpen, File, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  isOpen?: boolean;
}

interface FileTreeProps {
  rootPath: string;
  onFileSelect?: (path: string) => void;
  selectedFile?: string;
}

export function FileTree({ rootPath, onFileSelect, selectedFile }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([rootPath]));

  const fetchTree = useCallback(async (path: string) => {
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error("Failed to fetch files");
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching file tree:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    const loadTree = async () => {
      setLoading(true);
      const data = await fetchTree(rootPath);
      setTree(data);
      setLoading(false);
    };
    loadTree();
  }, [rootPath, fetchTree]);

  const toggleDir = async (node: FileNode) => {
    if (node.type !== "directory") return;
    
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path);
    } else {
      newExpanded.add(node.path);
      if (!node.children) {
        const children = await fetchTree(node.path);
        if (children && tree) {
          updateTreeNode(tree, node.path, children.children || []);
          setTree({ ...tree });
        }
      }
    }
    setExpandedDirs(newExpanded);
  };

  const updateTreeNode = (node: FileNode, targetPath: string, children: FileNode[]) => {
    if (node.path === targetPath) {
      node.children = children;
      return;
    }
    if (node.children) {
      for (const child of node.children) {
        updateTreeNode(child, targetPath, children);
      }
    }
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = selectedFile === node.path;
    const paddingLeft = depth * 12 + 8;

    return (
      <div key={node.path}>
        <div
          className={cn(
            "flex items-center gap-1.5 py-1 pr-2 cursor-pointer hover:bg-accent/50 transition-colors text-sm",
            isSelected && "bg-accent text-accent-foreground"
          )}
          style={{ paddingLeft }}
          onClick={() => {
            if (node.type === "directory") {
              toggleDir(node);
            } else {
              onFileSelect?.(node.path);
            }
          }}
        >
          {node.type === "directory" ? (
            <>
              {isExpanded ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {isExpanded ? (
                <FolderOpen className="size-4 shrink-0 text-primary" />
              ) : (
                <Folder className="size-4 shrink-0 text-primary" />
              )}
            </>
          ) : (
            <>
              <span className="w-3.5 shrink-0" />
              <File className="size-4 shrink-0 text-muted-foreground" />
            </>
          )}
          <span className="truncate select-none">{node.name}</span>
        </div>
        {node.type === "directory" && isExpanded && node.children && (
          <div className="animate-fade-in">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Failed to load files
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      {renderNode(tree)}
    </div>
  );
}
