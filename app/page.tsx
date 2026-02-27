"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Folder,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { useChatStore } from "@/lib/chat-store";

export default function HomePage() {
  const router = useRouter();
  const [tempPath, setTempPath] = useState("/home/thetanav/Code/minis");
  const { sessions, deleteSession, deleteSessionsForPath, selectSession } = useChatStore();

  const dirSessions = sessions.filter((s) => s.path === tempPath);

  const handleConfirm = () => {
    // We could create a new session here or just navigate to chat with the path
    // For now, let's just navigate to chat. The chat page will handle session creation if needed.
    router.push(`/chat?path=${encodeURIComponent(tempPath)}`);
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
      router.push(
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
        </div>
      </div>
    </div>
  );
}
