"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ChevronDown,
    Folder,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    Shell,
    Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { api } from "@/lib/eden";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import ChatCreation from "./chat-creation";
import { useSessionParam } from "@/lib/session-param";
import { useSide } from "@/store/store";
import { useWebSocket, wsUrl } from "@/hooks/use-socket";

export type ChatSessionSummary = {
    id: string;
    workspacePath: string;
    title: string | null;
    createdAt: number;
    updatedAt: number;
};

function comparePath(valueA: string, valueB: string) {
    return valueA.localeCompare(valueB, undefined, { sensitivity: "base" });
}

export default function ChatSidebar() {
    const [side, toggleSide] = useSide();

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
        refetchInterval() {
            return 30 * 1000;
        },
    });

    const { lastMessage } = useWebSocket(wsUrl);

    useEffect(() => {
        if (
            lastMessage?.type === "status-update" ||
            lastMessage?.type === "sessions-changed"
        ) {
            refetch();
        }
    }, [lastMessage]);

    const [session, setSession] = useSessionParam();

    const [collapsedPaths, setCollapsedPaths] = useState<
        Record<string, boolean>
    >({});

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
            `Delete this session?\n\n${chat.title}`,
        );
        if (!confirmed) return;

        const res = await fetch(`/api/sessions/${chat.id}`, {
            method: "DELETE",
        });
        if (res.ok) {
            if (activeSessionId === chat.id) {
                await setSession(null);
            }
            await queryClient.invalidateQueries({ queryKey: ["sessions"] });
            toast("Deleted a session");
        } else {
            toast("Failed to delete");
        }
    }

    async function onNewChat(nextWorkspacePath?: string) {
        const workspace = nextWorkspacePath?.trim();
        if (!workspace || workspace === "Unknown workspace") {
            toast("Invalid workspace path");
            return;
        }

        const res = await api.sessions.post({
            path: workspace,
        });

        if (!res.data?.ok || !res.data.id) {
            toast("Failed to create chat");
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ["sessions"] });
        await setSession(res.data.id);
    }

    return (
        <>
            <aside
                className={cn(
                    "flex h-full shrink-0 flex-col border-r bg-card/30",
                    side
                        ? "w-64 translate-x-0 opacity-100"
                        : "w-0 -translate-x-3 opacity-0 overflow-hidden border-r-0 pointer-events-none",
                )}
            >
                <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={toggleSide}
                        aria-label="Close sessions sidebar"
                    >
                        <PanelLeftClose />
                    </Button>

                    <p className="text-sm font-medium truncate">Sessions</p>

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
                        <div className="space-y-1">
                            {groupedSessions.map((group) => {
                                const isCollapsed =
                                    group.path !== workspacePath &&
                                    Boolean(collapsedPaths[group.path]);

                                return (
                                    <div key={group.path} className="space-y-1">
                                        <div
                                            className={cn(
                                                "flex items-center justify-center gap-1 px-2.5 py-1.5 hover:bg-accent rounded-xl select-none",
                                                group.path === workspacePath &&
                                                    "text-foreground",
                                            )}
                                        >
                                            <button
                                                className="flex items-center justify-center relative w-4 cursor-pointer"
                                                onClick={() =>
                                                    setCollapsedPaths(
                                                        (current) => ({
                                                            ...current,
                                                            [group.path]:
                                                                !current[
                                                                    group.path
                                                                ],
                                                        }),
                                                    )
                                                }
                                            >
                                                <Folder
                                                    className={cn(
                                                        "size-3 transform-all absolute",
                                                        isCollapsed
                                                            ? "opacity-100"
                                                            : "opacity-0",
                                                    )}
                                                />
                                                <ChevronDown
                                                    className={cn(
                                                        "size-3 transition-all absolute",
                                                        isCollapsed
                                                            ? "opacity-0"
                                                            : "opacity-100",
                                                    )}
                                                />
                                            </button>

                                            <span className="truncate flex-1 text-left text-sm">
                                                {group.path
                                                    .split(/[\\/]/)
                                                    .filter(Boolean)
                                                    .pop()}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onNewChat(group.path)
                                                }
                                                className="rounded flex items-center justify-center"
                                                aria-label={`New chat in ${group.path}`}
                                            >
                                                <Plus className="size-3.5 opacity-70 active:opacity-100 cursor-pointer" />
                                            </button>
                                        </div>

                                        <div
                                            className={cn(
                                                "grid transition-all border-l ml-0 pl-1",
                                                isCollapsed
                                                    ? "grid-rows-[0fr] opacity-0"
                                                    : "grid-rows-[1fr] opacity-100",
                                                isCollapsed &&
                                                    "pointer-events-none",
                                            )}
                                            aria-hidden={isCollapsed}
                                        >
                                            <div className="min-h-0 overflow-hidden">
                                                <div className="space-y-1">
                                                    {group.chats.map((chat) => {
                                                        const isActive =
                                                            chat.id ===
                                                            activeSessionId;

                                                        return (
                                                            <div
                                                                key={chat.id}
                                                                className={cn(
                                                                    "flex truncate rounded-xl px-3 py-1.5 text-left text-sm group relative",
                                                                    isActive
                                                                        ? "border-primary/30 bg-primary/10"
                                                                        : "border-transparent hover:border-border hover:bg-accent",
                                                                )}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className="flex-1 text-left cursor-pointer truncate pr-5"
                                                                    onClick={() =>
                                                                        setSession(
                                                                            chat.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <div className="flex items-center gap-1 w-full">
                                                                        <div
                                                                            className={`w-2 h-2 ${chat.status ? "bg-green-500 animate-pulse" : "hidden"} rounded-full`}
                                                                        />
                                                                        <p className="overflow-hidden truncate w-full">
                                                                            {
                                                                                chat.title
                                                                            }
                                                                        </p>
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {new Date(
                                                                            chat.updatedAt,
                                                                        ).toLocaleString(
                                                                            "en-US",
                                                                            {
                                                                                day: "numeric",
                                                                                month: "short",
                                                                                hour: "numeric",
                                                                                minute: "numeric",
                                                                            },
                                                                        )}
                                                                    </p>
                                                                </button>
                                                                <button
                                                                    onClick={() =>
                                                                        handleDeleteChat(
                                                                            chat,
                                                                        )
                                                                    }
                                                                    className="opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 data-[state=open]:opacity-100 absolute delay-50 right-0 top-0 bottom-0 px-3 cursor-pointer transition duration-100 ease-in-out"
                                                                >
                                                                    <Trash2 className="size-3 text-muted-foreground" />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
