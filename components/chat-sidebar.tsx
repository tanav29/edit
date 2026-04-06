"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Folder, Plus, Shell, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { api } from "@/lib/eden";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ChatCreation from "./chat-creation";

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

function comparePath(valueA: string, valueB: string) {
  return valueA.localeCompare(valueB, undefined, { sensitivity: "base" });
}

export default function ChatSidebar() {
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
  const [collapsedPaths, setCollapsedPaths] = useState<Record<string, boolean>>(
    {},
  );

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
        if (bLatest !== aLatest) return bLatest - aLatest;
        return comparePath(a.path, b.path);
      });
  }, [sessions]);

  const workspacePath = useMemo(() => {
    if (!activeSessionId || !Array.isArray(sessions)) return null;
    const active = sessions.find((item) => item.id === activeSessionId);
    return active?.workspacePath ?? null;
  }, [activeSessionId, sessions]);

  async function handleDeleteChat(chat: ChatSessionSummary) {
    if (!chat.id) return;

    const confirmed = window.confirm(
      `Delete this session?\n\n${formatLabel(chat.title)}`,
    );
    if (!confirmed) return;

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

  function onNewChat(nextWorkspacePath?: string) {
    console.log(nextWorkspacePath);
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-card/30">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Shell className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">Sessions</p>
        </div>

        <ChatCreation refetch={refetch} />
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
            {groupedSessions.map((group) => {
              const isCollapsed = Boolean(collapsedPaths[group.path]);

              return (
                <div key={group.path} className="space-y-1">
                  <div className="flex items-center gap-1 px-1">
                    <button
                      type="button"
                      className={cn(
                        "flex flex-1 items-center gap-1.5 rounded-md px-0 py-1 text-[11px] text-muted-foreground",
                        group.path === workspacePath && "text-foreground",
                      )}
                      onClick={() =>
                        setCollapsedPaths((current) => ({
                          ...current,
                          [group.path]: !current[group.path],
                        }))
                      }
                      aria-expanded={!isCollapsed}>
                      <ChevronRight
                        className={cn(
                          "size-3 transition-transform",
                          !isCollapsed && "rotate-90",
                        )}
                      />
                      <Folder className="size-3" />
                      <span
                        className="truncate flex-1 text-left"
                        title={group.path}>
                        {group.path}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNewChat(group.path)}
                      className="rounded p-1 hover:bg-accent/50 flex items-center justify-center"
                      aria-label={`New chat in ${group.path}`}>
                      <Plus className="size-3 opacity-70 active:opacity-100 cursor-pointer" />
                    </button>
                  </div>

                  <div className={cn("space-y-1", isCollapsed && "hidden")}>
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
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
