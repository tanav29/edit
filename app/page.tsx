"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Folder,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { useChatStore } from "@/lib/chat-store";

export default function HomePage() {
  const navigate = useNavigate();
  const [tempPath, setTempPath] = useState("/home/thetanav/Code/minis");
  const { sessions, deleteSession, deleteSessionsForPath, selectSession } = useChatStore();

  const dirSessions = sessions.filter((s) => s.path === tempPath);
  const groupedHistory = useMemo(() => {
    const groups = new Map<string, typeof sessions>();

    sessions.forEach((session) => {
      const existing = groups.get(session.path) || [];
      existing.push(session);
      groups.set(session.path, existing);
    });

    return Array.from(groups.entries())
      .map(([path, items]) => ({
        path,
        items: [...items].sort((a, b) => b.updatedAt - a.updatedAt),
        latestUpdatedAt: Math.max(...items.map((item) => item.updatedAt)),
      }))
      .sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
  }, [sessions]);

  const handleConfirm = () => {
    // We could create a new session here or just navigate to chat with the path
    // For now, let's just navigate to chat. The chat page will handle session creation if needed.
    navigate(`/chat?path=${encodeURIComponent(tempPath)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm();
    }
  };

  const handleResumeSession = (sessionId: string) => {
    selectSession(sessionId);
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      navigate(
        `/chat?path=${encodeURIComponent(session.path)}&sessionId=${sessionId}`,
      );
    }
  };

  return (
    <div className="flex flex-col h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg h-108 space-y-8">
        <div className="space-y-4">
          <div className="flex space-x-2 items-center justify-center">
            <div className="flex flex-1 items-center px-5 py-3 bg-card border rounded-xl focus-within:border-primary/50 transition-colors">
              <Folder className="size-5 text-muted-foreground shrink-0 mr-3" />
              <input
                type="text"
                value={tempPath}
                onChange={(e) => setTempPath(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="/path/to/your/project"
                className="h-9 w-full flex-1 px-0 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-lg bg-card outline-none font-mono"
                autoFocus
              />
            </div>
            <button
              onClick={handleConfirm}
              className="h-15 w-15 bg-primary text-background outline-none border-none rounded-xl text-sm font-medium shadow-md hover:shadow-lg cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center">
              <ArrowRight className="size-5" />
            </button>
          </div>

          {dirSessions.length <= 0 ? (
            <div className="flex items-center gap-2 px-1">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                No Previous Chats in this Directory
              </span>
            </div>
          ) : (
            <div className="space-y-3 animate-in fade-in duration-500 delay-150">
              <div className="flex items-center gap-2 px-1">
                <MessageSquare className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Previous Chats in this Directory
                </span>
              </div>
              <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {dirSessions.map((session) => (
                  <div
                    key={session.id}
                    className="group flex items-center gap-3 p-3 rounded-xl bg-card border hover:border-primary/30 hover:bg-accent/30 transition-all cursor-pointer"
                    onClick={() => handleResumeSession(session.id)}>
                    <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="size-4 text-primary/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {session.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(session.updatedAt).toLocaleDateString()} at{" "}
                        {new Date(session.updatedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all rounded-lg shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deleteSessionsForPath(tempPath)}
                >
                  Clear directory history
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3 animate-in fade-in duration-500 delay-200">
            <div className="flex items-center gap-2 px-1">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Directory Grouped History
              </span>
            </div>

            {groupedHistory.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1">
                No chat history yet
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
                {groupedHistory.map((group) => {
                  const projectName = group.path.split("/").filter(Boolean).pop() || group.path;

                  return (
                    <div
                      key={group.path}
                      className="rounded-xl border bg-card/70 p-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => setTempPath(group.path)}
                          className="min-w-0 text-left hover:opacity-80 transition-opacity">
                          <div className="text-xs font-medium truncate">{projectName}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {group.path}
                          </div>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteSessionsForPath(group.path)}>
                          Clear
                        </Button>
                      </div>

                      <div className="space-y-1">
                        {group.items.slice(0, 4).map((session) => (
                          <div
                            key={session.id}
                            className="group flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                            onClick={() => handleResumeSession(session.id)}>
                            <MessageSquare className="size-3 text-primary/70 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs truncate">{session.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {new Date(session.updatedAt).toLocaleDateString()} {new Date(session.updatedAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all rounded-md shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(session.id);
                              }}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        ))}

                        {group.items.length > 4 && (
                          <div className="text-[10px] text-muted-foreground px-2">
                            +{group.items.length - 4} more session{group.items.length - 4 === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
