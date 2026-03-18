"use client";

import { FileTree } from "./file-tree";

interface FileBarProps {
  rootPath?: string;
  selectedFile?: string;
  onFileSelect: (file: string | undefined) => void;
}

export default function FileBar({
  rootPath,
  selectedFile,
  onFileSelect,
}: FileBarProps) {
  return (
    <aside className="w-80 shrink-0 border-l flex flex-col min-h-0 select-none">
      <div className="border-b px-3 py-2">
        <div className="text-[11px] text-muted-foreground truncate">
          {rootPath || "No workspace selected"}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {rootPath ? (
          <FileTree
            rootPath={rootPath}
            onFileSelect={onFileSelect}
            selectedFile={selectedFile}
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
