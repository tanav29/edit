"use client";

import { useMemo, useState } from "react";
import { Folder, FolderPlus, Plus, X } from "lucide-react";

import { Button } from "./ui/button";
import type { ChatSession } from "@/lib/chat-types";

type ChatsBarProps = {
  workspacePath: string;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onOpenSessionAction: (sessionId: string, sessionPath: string) => void;
  onCreateChatAction: (workspacePath: string) => void;
  onCreateFolderAction: (workspacePath: string) => Promise<ChatSession | null>;
  onDeleteSessionAction: (sessionId: string) => void | Promise<void>;
};

type FolderGroup = {
  path: string;
  sessions: ChatSession[];
};

function getProjectName(path: string) {
  const normalized = path.replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

export default function ChatsBar({
  workspacePath,
  sessions,
  currentSessionId,
  onOpenSessionAction,
  onCreateChatAction,
  onCreateFolderAction,
  onDeleteSessionAction,
}: ChatsBarProps) {
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(workspacePath ? [workspacePath] : []),
  );

  const folderGroups = useMemo(() => {
    const groups = new Map<string, FolderGroup>();

    for (const session of sessions) {
      const existing = groups.get(session.path);

      if (existing) {
        existing.sessions.push(session);
      } else {
        groups.set(session.path, {
          path: session.path,
          sessions: [session],
        });
      }
    }

    return Array.from(groups.values()).sort(
      (a, b) =>
        (b.sessions[0]?.updatedAt ?? 0) - (a.sessions[0]?.updatedAt ?? 0),
    );
  }, [sessions]);

  function toggleGroup(path: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }

  function handleCreateFolder() {
    setNewFolderPath(workspacePath || "");
    setShowFolderDialog(true);
  }

  async function handleConfirmFolder() {
    const nextPath = newFolderPath.trim();
    if (!nextPath) return;

    const session = await onCreateFolderAction(nextPath);
    if (!session) return;

    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.add(nextPath);
      return next;
    });

    setShowFolderDialog(false);
    setNewFolderPath("");
    onOpenSessionAction(session.id, session.path);
  }

  function handleCreateChat(path: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });

    onCreateChatAction(path);
  }

  return (
    <aside className="w-75 shrink-0 border-r bg-card/30 flex flex-col min-h-0">
      {showFolderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border rounded-xl shadow-lg p-6 w-full max-w-sm space-y-4">
            <h2 className="text-sm font-semibold">Add Folder</h2>
            <p className="text-xs text-muted-foreground">
              Enter the path for the new workspace folder.
            </p>

            <input
              autoFocus
              type="text"
              value={newFolderPath}
              onChange={(e) => setNewFolderPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleConfirmFolder();
                }

                if (e.key === "Escape") {
                  setShowFolderDialog(false);
                }
              }}
              placeholder="/path/to/folder"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-muted-foreground/50 transition-colors placeholder:text-muted-foreground font-mono"
            />

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFolderDialog(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void handleConfirmFolder()}
                disabled={!newFolderPath.trim()}
              >
                Add Folder
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 flex items-center justify-between gap-2">
        <div className="text-md tracking-wider text-muted-foreground pl-2 font-semibold select-none">
          EDIT
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCreateFolder}
          title="Add folder"
          className="rounded-lg shrink-0"
        >
          <FolderPlus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 px-2 select-none">
        {folderGroups.length === 0 ? (
          <div className="text-xs text-muted-foreground p-3">No chats yet</div>
        ) : (
          folderGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.path);

            return (
              <div key={group.path} className="overflow-hidden">
                <div className="flex items-center gap-1">
                  <div
                    onClick={() => toggleGroup(group.path)}
                    className="flex min-w-0 flex-1 items-center gap-2 p-2 text-left cursor-pointer"
                  >
                    <Folder className="size-4 text-neutral-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">
                        {getProjectName(group.path)}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {group.sessions.length}
                    </div>
                  </div>

                  <button
                    onClick={() => handleCreateChat(group.path)}
                    title="New chat in workspace"
                    className="p-1 outline-none cursor-pointer hover:bg-accent rounded-full"
                    type="button"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>

                {isExpanded && (
                  <div>
                    {group.sessions.map((session) => {
                      const isCurrent = currentSessionId === session.id;

                      return (
                        <div
                          key={session.id}
                          className={`group flex items-center rounded-lg px-4 py-2 active:scale-99 transition-all cursor-pointer ${
                            isCurrent ? "bg-accent" : "hover:bg-accent/50"
                          }`}
                        >
                          <button
                            onClick={() =>
                              onOpenSessionAction(session.id, session.path)
                            }
                            className="min-w-0 flex flex-1 items-center gap-2 text-left text-sm truncate cursor-pointer"
                            type="button"
                          >
                            {session.name}
                          </button>

                          <button
                            className="opacity-0 translate-x-5 group-hover:translate-x-0 group-hover:opacity-100 transition-transform ease-out duration-150 hover:text-red-500 cursor-pointer"
                            onClick={() =>
                              void onDeleteSessionAction(session.id)
                            }
                            title="Delete chat"
                            type="button"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
