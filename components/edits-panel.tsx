"use client"

import { Clock, FileCode, Folder, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface EditInfo {
  id: string
  path: string
  type: "create" | "modify"
  timestamp: Date
}

interface EditsPanelProps {
  currentPath: string
  modelName: string
  edits: EditInfo[]
  onEditClick: (edit: EditInfo) => void
}

export function EditsPanel({
  currentPath,
  modelName,
  edits,
  onEditClick,
}: EditsPanelProps) {
  const pathParts = currentPath.split("/")
  const projectName = pathParts[pathParts.length - 1] || currentPath

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-3 border-b">
        <div className="flex items-center gap-2">
          <FolderIcon className="size-4 text-amber-400" />
          <span className="text-sm font-medium truncate">{projectName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Bot className="size-3" />
          <span className="truncate">{modelName}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Edit History
            </span>
          </div>

          {edits.length === 0 ? (
            <div className="text-xs text-muted-foreground/70 py-4 text-center">
              No edits yet
            </div>
          ) : (
            <div className="space-y-1">
              {edits.slice().reverse().map((edit) => (
                <button
                  key={edit.id}
                  onClick={() => onEditClick(edit)}
                  className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors text-left"
                >
                  <FileCode className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate">
                      {edit.path.split("/").pop()}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {edit.path}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      edit.type === "create"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {edit.type === "create" ? "new" : "edit"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <Folder className={className} />
  )
}
