"use client"

import { useState } from "react"
import { Clock, FileCode, Folder, Bot, Sparkles, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useChatStore } from "@/lib/chat-store"
import { cn } from "@/lib/utils"
import { RemoteToggle } from "@/components/remote-toggle"

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
  onSync?: () => void
  isSyncing?: boolean
  onSaveHistory?: () => void
  isSavingHistory?: boolean
  canSaveHistory?: boolean
}

export function EditsPanel({
  currentPath,
  modelName,
  edits,
  onEditClick,
  onSync,
  isSyncing,
  onSaveHistory,
  isSavingHistory,
  canSaveHistory,
}: EditsPanelProps) {
  const { isGenUIEnabled, setIsGenUIEnabled, currentSession } = useChatStore()
  const [activeTab, setActiveTab] = useState<"ai" | "history" | "remote">("ai")
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

      <div className="flex border-b overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("ai")}
          className={cn(
            "flex-1 py-2 px-1 text-[10px] font-medium uppercase tracking-wider transition-colors min-w-[60px]",
            activeTab === "ai" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          AI
        </button>
        <button
          onClick={() => setActiveTab("remote")}
          className={cn(
            "flex-1 py-2 px-1 text-[10px] font-medium uppercase tracking-wider transition-colors min-w-[60px]",
            activeTab === "remote" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Remote
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "flex-1 py-2 px-1 text-[10px] font-medium uppercase tracking-wider transition-colors min-w-[60px]",
            activeTab === "history" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          {activeTab === "ai" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  AI Settings
                </span>
              </div>
              
              <div className="flex items-center justify-between p-2 rounded-lg bg-accent/30 border border-border/50">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-medium">Gen UI</div>
                  <div className="text-[10px] text-muted-foreground">
                    Enable interactive components
                  </div>
                </div>
                <Switch 
                  checked={isGenUIEnabled} 
                  onCheckedChange={setIsGenUIEnabled}
                />
              </div>

              <div className="p-2 rounded-lg border border-dashed border-border/50 text-center">
                <div className="text-[10px] text-muted-foreground italic">
                  More AI settings coming soon...
                </div>
              </div>
            </div>
          ) : activeTab === "remote" ? (
            <RemoteToggle onSync={onSync} isSyncing={isSyncing} />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                <Clock className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Edit History
                </span>
                </div>

                {onSaveHistory && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] uppercase tracking-wider"
                    disabled={!canSaveHistory || isSavingHistory}
                    onClick={onSaveHistory}
                    title={
                      !canSaveHistory
                        ? "Stop streaming to save"
                        : "Save chat history to disk"
                    }
                  >
                    {isSavingHistory ? "Saving..." : "Save"}
                  </Button>
                )}
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
