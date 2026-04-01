"use client";

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useState } from "react";

import { FileTree } from "./file-tree";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "@/lib/utils";

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative shrink-0 flex min-h-0 select-none transition-[width] duration-200 ease-out",
        isCollapsed ? "w-0 border-l-0" : "w-64 border-l flex-col",
      )}>
      {isCollapsed ? (
        <div className="absolute right-2 top-2 z-10">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setIsCollapsed(false)}
                aria-label="Expand file sidebar">
                <PanelRightOpen />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Expand files</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="min-w-0 text-[11px] text-muted-foreground truncate">
              {rootPath || "No workspace selected"}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsCollapsed(true)}
                  aria-label="Collapse file sidebar">
                  <PanelRightClose />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Collapse files</p>
              </TooltipContent>
            </Tooltip>
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
        </>
      )}
    </aside>
  );
}
