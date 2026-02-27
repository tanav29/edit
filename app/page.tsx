"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Folder,
  FolderOpen,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { useChatStore } from "@/lib/chat-store";

export default function HomePage() {
  const router = useRouter();
  const [tempPath, setTempPath] = useState("/home/thetanav/Code/minis");
  const { sessions, deleteSession, selectSession } = useChatStore();
  
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
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      router.push(`/chat?path=${encodeURIComponent(session.path)}&sessionId=${sessionId}`);
    }
  };

  return (
    <div className="flex flex-col h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl" />
            <div className="relative bg-card border border-border/60 rounded-2xl p-4">
              <FolderOpen className="size-10 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              Workspace
            </h1>
            <p className="text-sm text-muted-foreground/70 max-w-xs mx-auto">
              Select a directory to work in or continue a previous chat.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center px-3 py-3 bg-card border rounded-xl focus-within:border-primary/50 transition-colors shadow-sm">
              <Folder className="size-5 text-muted-foreground shrink-0 mr-3" />
              <Input
                type="text"
                value={tempPath}
                onChange={(e) => setTempPath(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="/path/to/your/project"
                className="h-9 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm bg-transparent"
                autoFocus
              />
            </div>
            <Button
              onClick={handleConfirm}
              className="w-full h-11 rounded-xl text-sm font-medium shadow-md hover:shadow-lg transition-all active:scale-[0.98]">
              Open Workspace
            </Button>
          </div>

          {dirSessions.length > 0 && (
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
                    onClick={() => handleResumeSession(session.id)}
                  >
                    <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="size-4 text-primary/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {session.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(session.updatedAt).toLocaleDateString()} at {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all rounded-lg shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
