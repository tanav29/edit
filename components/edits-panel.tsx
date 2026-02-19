"use client";

import { FileEdit, FilePlus, FileMinus, Folder, Cpu, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditInfo {
  id: string;
  path: string;
  type: "create" | "modify" | "delete";
  timestamp: Date;
}

interface EditsPanelProps {
  currentPath: string;
  modelName?: string;
  edits?: EditInfo[];
  onEditClick?: (edit: EditInfo) => void;
}

export function EditsPanel({ currentPath, modelName = "Unknown", edits = [], onEditClick }: EditsPanelProps) {
  const getEditIcon = (type: EditInfo["type"]) => {
    switch (type) {
      case "create":
        return <FilePlus className="size-3.5 text-emerald-500" />;
      case "delete":
        return <FileMinus className="size-3.5 text-red-500" />;
      case "modify":
      default:
        return <FileEdit className="size-3.5 text-amber-500" />;
    }
  };

  const getEditLabel = (type: EditInfo["type"]) => {
    switch (type) {
      case "create":
        return "Created";
      case "delete":
        return "Deleted";
      case "modify":
      default:
        return "Modified";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Model Info Section */}
      <div className="border-b p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Cpu className="size-3.5" />
          Model
        </div>
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <GitBranch className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{modelName}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
        </div>
      </div>

      {/* Path Info Section */}
      <div className="border-b p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Folder className="size-3.5" />
          Workspace
        </div>
        <div className="text-xs text-muted-foreground break-all font-mono bg-muted/50 rounded-md p-2">
          {currentPath}
        </div>
      </div>

      {/* Edits Section */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          <FileEdit className="size-3.5" />
          Recent Edits
          {edits.length > 0 && (
            <span className="ml-auto bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">
              {edits.length}
            </span>
          )}
        </div>
        
        {edits.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No edits yet
          </div>
        ) : (
          <div className="space-y-1">
            {edits.map((edit) => (
              <div
                key={edit.id}
                onClick={() => onEditClick?.(edit)}
                className={cn(
                  "group flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition-colors",
                  "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {getEditIcon(edit.type)}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{edit.path.split("/").pop()}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {edit.path}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {getEditLabel(edit.type)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
