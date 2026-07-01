import { useChat } from "@ai-sdk/react";
import {
    DefaultChatTransport,
    lastAssistantMessageIsCompleteWithApprovalResponses,
    type UIMessage,
} from "ai";
import {
    Code,
    Copy,
    Loader2,
    PanelRightClose,
    PanelRightOpen,
    Terminal,
} from "lucide-react";
import { memo, useEffect, useReducer, useRef } from "react";

import ChatSidebar from "@/components/chat-sidebar";
import ChatInput from "@/components/chat-input";
import CommitButton from "@/components/commit-button";
import Loader from "@/components/loader";
import MessageUI from "@/components/message";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSessionParam } from "@/lib/session-param";
import { getTitleFromMessages, parseMessages } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useRightSide, useSide, useTerminal } from "@/store/store";
import BranchSelector from "@/components/branch-selector";
import { useWebSocket, wsUrl } from "@/hooks/use-socket";
import RightSidebar from "@/components/right-sidebar";
import BottomTerminal from "@/components/bottom-terminal";

const MemoMessageUI = memo(MessageUI);

function getMessageTime(message: unknown): Date | string | number | undefined {
    if (typeof message !== "object" || message === null) return undefined;
    return (message as Record<string, unknown>).createdAt as
        | Date
        | string
        | number
        | undefined;
}

function formatMessageTime(
    createdAt: Date | string | number | undefined | null,
): string | null {
    if (createdAt == null) return null;
    const date = new Date(createdAt);
    if (isNaN(date.getTime())) return null;

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });

    if (!isToday) {
        const dateStr = date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
        return `${dateStr} ${time}`;
    }
    return time;
}

type QueueAction =
    | { type: "enqueue"; value: string }
    | { type: "dequeue" }
    | { type: "delete"; index: number }
    | { type: "reset" };

function queueReducer(state: string[], action: QueueAction) {
    switch (action.type) {
        case "enqueue":
            return [...state, action.value];
        case "dequeue":
            return state.slice(1);
        case "delete":
            return state.filter((_, index) => index !== action.index);
        case "reset":
            return [];
        default:
            return state;
    }
}

export function ChatRouteComponent() {
    const [session] = useSessionParam();

    const {
        data: sessionData,
        isLoading: isSessionLoading,
        refetch,
    } = useQuery({
        queryKey: ["session", session],
        queryFn: async () => {
            if (!session) return null;
            const res = await fetch(`/api/sessions/${session}`);
            const data = await res.json();
            return {
                workspace:
                    typeof data?.workspace === "string"
                        ? data.workspace
                        : typeof data?.workspacePath === "string"
                          ? data.workspacePath
                          : null,
                messages: Array.isArray(data?.messages)
                    ? (data.messages as UIMessage[])
                    : parseMessages(data?.messages),
            };
        },
        enabled: Boolean(session),
    });

    const { lastMessage } = useWebSocket(wsUrl);

    useEffect(() => {
        if (
            lastMessage?.type === "status-update" &&
            lastMessage.id === session
        ) {
            refetch();
        }
    }, [lastMessage, refetch, session]);

    const workspace = sessionData?.workspace ?? null;

    if (!session) {
        return <EmptyChatPage />;
    }

    if (isSessionLoading) {
        return (
            <ChatLayout
                currentSessionTitle="Select a session"
                isActive={false}
                workspace={null}
            >
                <div className="flex h-full items-center justify-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
            </ChatLayout>
        );
    }

    return (
        <LoadedSessionChat
            key={session}
            session={session}
            workspace={workspace}
            initialMessages={sessionData?.messages ?? []}
        />
    );
}

type LoadedSessionChatProps = {
    session: string;
    workspace: string | null;
    initialMessages: UIMessage[];
};

function LoadedSessionChat({
    session,
    workspace,
    initialMessages,
}: LoadedSessionChatProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [queuedMessages, dispatchQueue] = useReducer(queueReducer, []);
    const isDrainingQueueRef = useRef(false);

    const { messages, sendMessage, status, addToolApprovalResponse, stop } =
        useChat<UIMessage>({
            id: session,
            messages: initialMessages,
            transport: new DefaultChatTransport({
                api: "/api/chat",
                body: {
                    id: session,
                    path: workspace ?? "",
                    sessionId: session,
                },
            }),
            sendAutomaticallyWhen:
                lastAssistantMessageIsCompleteWithApprovalResponses,
        });

    const isActive = status === "streaming" || status === "submitted";

    useEffect(() => {
        if (
            isActive ||
            queuedMessages.length === 0 ||
            isDrainingQueueRef.current
        ) {
            return;
        }

        const nextMessage = queuedMessages[0];
        isDrainingQueueRef.current = true;
        dispatchQueue({ type: "dequeue" });

        void sendMessage({
            text: nextMessage,
        })
            .catch(() => {
                dispatchQueue({ type: "enqueue", value: nextMessage });
            })
            .finally(() => {
                isDrainingQueueRef.current = false;
            });
    }, [isActive, queuedMessages, sendMessage]);

    useEffect(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isActive]);

    async function handleSend(value: string) {
        if (!value || !workspace || !session) {
            return;
        }

        if (isActive) {
            dispatchQueue({ type: "enqueue", value });
            return;
        }

        await sendMessage({
            text: value,
        });
    }

    const currentSessionTitle = getTitleFromMessages(messages);

    const renderedMessages = messages.map((message, index) => {
        const userMessageText =
            message.role === "user"
                ? message.parts
                      .flatMap((part) =>
                          part.type === "text" && typeof part.text === "string"
                              ? [part.text]
                              : [],
                      )
                      .join("\n")
                : "";

        const aiMessageText =
            message.role === "assistant"
                ? message.parts
                      .flatMap((part) =>
                          part.type === "text" && typeof part.text === "string"
                              ? [part.text]
                              : [],
                      )
                      .join("\n")
                : "";

        return (
            <div key={message.id || index}>
                {message.role === "user" ? (
                    <div className="flex justify-end py-2">
                        <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                                <div className="rounded-2xl rounded-br-md bg-primary/12 px-4 py-2.5">
                                    {message.parts.map((part, partIndex) => {
                                        if (part.type !== "text") return null;

                                        return (
                                            <p
                                                key={partIndex}
                                                className="whitespace-pre-wrap text-sm leading-relaxed"
                                            >
                                                {part.text}
                                            </p>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="Copy user message"
                                            className="text-muted-foreground hover:text-primary"
                                            onClick={() => {
                                                if (
                                                    !userMessageText ||
                                                    typeof navigator ===
                                                        "undefined"
                                                ) {
                                                    return;
                                                }

                                                void navigator.clipboard.writeText(
                                                    userMessageText,
                                                );
                                            }}
                                        >
                                            <Copy className="size-3" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                        Copy
                                    </TooltipContent>
                                </Tooltip>
                                {getMessageTime(message) && (
                                    <span className="text-[10px] text-muted-foreground/60">
                                        {formatMessageTime(
                                            getMessageTime(message),
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-start py-2">
                        <div className="flex-col items-start max-w-[85%]">
                            <div className="flex-1 min-w-0">
                                <MemoMessageUI
                                    parts={message.parts}
                                    addToolApprovalResponseAction={
                                        addToolApprovalResponse
                                    }
                                />
                            </div>
                            <div>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="Copy AI message"
                                            className="text-muted-foreground hover:text-primary"
                                            onClick={() => {
                                                if (
                                                    !aiMessageText ||
                                                    typeof navigator ===
                                                        "undefined"
                                                ) {
                                                    return;
                                                }

                                                void navigator.clipboard.writeText(
                                                    aiMessageText,
                                                );
                                            }}
                                        >
                                            <Copy className="size-3" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        Copy
                                    </TooltipContent>
                                </Tooltip>
                                {getMessageTime(message) && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground/60">
                                            {formatMessageTime(
                                                getMessageTime(message),
                                            )}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    });

    return (
        <ChatLayout
            currentSessionTitle={currentSessionTitle}
            isActive={isActive}
            workspace={workspace}
            session={session}
        >
            <div
                ref={scrollRef}
                className="relative flex-1 overflow-y-auto px-4 py-6"
            >
                {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                        <div className="w-full max-w-md text-center flex flex-col items-center justify-center gap-4">
                            <Code className="size-10 text-primary" />
                            <div className="space-y-1">
                                <h1 className="text-xl font-semibold">
                                    Lets build
                                </h1>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="mx-auto w-full max-w-4xl space-y-1 select-text">
                        {renderedMessages}
                        {isActive && <Loader />}
                    </div>
                )}
            </div>
            <div className="bg-background/85 pb-4">
                <ChatInput
                    onSend={handleSend}
                    isActive={isActive}
                    isDisabled={!session}
                    queuedMessages={queuedMessages}
                    onDeleteQueuedMessage={(index) => {
                        dispatchQueue({ type: "delete", index });
                    }}
                    stop={stop}
                    workspacePath={workspace}
                />
            </div>
        </ChatLayout>
    );
}

type ChatLayoutProps = {
    children: React.ReactNode;
    currentSessionTitle: string;
    isActive: boolean;
    workspace: string | null;
    session?: string;
};

function ChatLayout({
    children,
    currentSessionTitle,
    isActive,
    workspace,
    session,
}: ChatLayoutProps) {
    const [side, toggleSide] = useSide();
    const [rside, rtoggleSide] = useRightSide();
    const [term, toggleTerm] = useTerminal();

    return (
        <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
            <div className="pointer-events-none absolute inset-0" />
            <ChatSidebar />

            <main className="relative z-10 flex min-w-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1">
                    <section className="relative flex min-w-0 flex-1 flex-col select-none">
                        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/95 px-3 py-2">
                            <div className="flex items-center gap-1 min-w-0">
                                {!side && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="icon-sm"
                                                aria-label="Toggle sessions sidebar"
                                                onClick={toggleSide}
                                            >
                                                <PanelRightClose />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom">
                                            Toggle sessions
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                <div className="truncate text-sm mx-2 font-medium">
                                    {currentSessionTitle}
                                </div>
                                {workspace && (
                                    <BranchSelector workspacePath={workspace} />
                                )}
                            </div>

                            <div className="flex items-center gap-1 rounded-md">
                                <CommitButton
                                    workspacePath={workspace ?? ""}
                                    isBusy={isActive}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => toggleTerm()}
                                >
                                    <Terminal /> Terminal
                                </Button>
                                {!rside && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="icon-sm"
                                                aria-label="Toggle file tree"
                                                onClick={rtoggleSide}
                                            >
                                                <PanelRightOpen />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom">
                                            Toggle right panel
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-1">
                            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                                {children}
                            </div>
                        </div>
                    </section>
                </div>
                <BottomTerminal root={workspace} id={session} />
            </main>

            <RightSidebar workspace={workspace} />
        </div>
    );
}

function EmptyChatPage() {
    return (
        <ChatLayout
            currentSessionTitle="Select a session"
            isActive={false}
            workspace={null}
        >
            <div className="relative flex-1 overflow-y-auto px-4 py-6">
                <div className="flex h-full items-center justify-center">
                    <div className="w-full max-w-md text-center flex flex-col items-center justify-center gap-4">
                        <Code className="size-10 text-primary" />
                        <div className="space-y-1">
                            <h1 className="text-xl font-semibold">
                                Lets build
                            </h1>
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-background/85 p-2 pt-0">
                <ChatInput
                    onSend={async () => {}}
                    isActive={false}
                    isDisabled
                    queuedMessages={[]}
                    onDeleteQueuedMessage={() => {}}
                    stop={() => {}}
                    workspacePath={null}
                />
            </div>
        </ChatLayout>
    );
}
