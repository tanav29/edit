"use client";

import { useMemo, useState } from "react";
import { Folder, Plus, Shell, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { api } from "@/lib/eden";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";

export type ChatSessionSummary = {
  id: string;
  workspacePath: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
};

function formatLabel(value: string | null) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "New chat";
}

export default function ChatSidebar({
  onNewChat,
}: {
  onNewChat: (workspacePath?: string) => void;
}) {
  const queryClient = useQueryClient();
  const {
    data: sessions,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const res = await api.sessions.get();
      return res.data;
    },
  });
  const [session, setSession] = useQueryState("s");

  const activeSessionId = session ?? null;

  const groupedSessions = useMemo(() => {
    const items = Array.isArray(sessions) ? sessions : [];
    const byPath = new Map<string, ChatSessionSummary[]>();

    for (const chat of items) {
      const path = chat.workspacePath?.trim() || "Unknown workspace";
      if (!byPath.has(path)) {
        byPath.set(path, []);
      }
      byPath.get(path)!.push(chat);
    }

    return [...byPath.entries()]
      .map(([path, chats]) => ({
        path,
        chats: [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
      }))
      .sort((a, b) => {
        const aLatest = a.chats[0]?.updatedAt ?? 0;
        const bLatest = b.chats[0]?.updatedAt ?? 0;
        return bLatest - aLatest;
      });
  }, [sessions]);

  const workspacePath = useMemo(() => {
    if (!activeSessionId || !Array.isArray(sessions)) return null;
    const active = sessions.find((item) => item.id === activeSessionId);
    return active?.workspacePath ?? null;
  }, [activeSessionId, sessions]);

  async function handleDeleteChat(chat: ChatSessionSummary) {
    if (!chat.id) return;
    const res = await api.del({ id: chat.id }).get();
    if (res.data?.ok) {
      if (activeSessionId === chat.id) {
        await setSession(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast("Deleted a session");
    } else {
      toast("Failed to delete");
    }
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-card/30">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Shell className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">Sessions</p>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => {
                  refetch();
                  onNewChat();
                }}>
                <Plus className="size-4" />
                <span className="sr-only">New chat</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="px-2 py-4 text-sm text-muted-foreground">
            Loading chats...
          </div>
        ) : groupedSessions.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground">
            No chat history yet.
          </div>
        ) : (
          <div className="space-y-3">
            {groupedSessions.map((group) => (
              <div key={group.path} className="space-y-1">
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground",
                    group.path === workspacePath && "text-foreground",
                  )}>
                  <Folder className="size-3" />
                  <span className="truncate flex-1" title={group.path}>
                    {group.path}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNewChat(group.path)}
                    aria-label={`New chat in ${group.path}`}>
                    <Plus className="size-3 opacity-70 active:opacity-100 cursor-pointer" />
                  </button>
                </div>

                <div className="space-y-1">
                  {group.chats.map((chat) => {
                    const isActive = chat.id === activeSessionId;

                    return (
                      <div
                        key={chat.id}
                        className={cn(
                          "flex truncate rounded-lg px-3 py-1.5 text-left text-sm transition-all group active:scale-[0.99] ease-out",
                          isActive
                            ? "border-primary/30 bg-primary/10"
                            : "border-transparent hover:border-border hover:bg-accent/40",
                        )}>
                        <button
                          type="button"
                          className="flex-1 text-left cursor-pointer"
                          onClick={() => setSession(chat.id)}
                          title={formatLabel(chat.title)}>
                          {formatLabel(chat.title)}
                        </button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleDeleteChat(chat)}
                          className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
                          <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
