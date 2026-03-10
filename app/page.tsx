"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Code,
  Folder,
  FolderOpen,
  FolderPlus,
  MessageSquare,
  PanelLeft,
  Plus,
  Save,
  Square,
  X,
} from "lucide-react";
import { FileTree } from "@/components/file-tree";
import { useChatStore } from "@/lib/chat-store";
import MessageUI from "@/components/message";
import { FileViewer } from "@/components/file-viewer";

type FolderGroup = {
  path: string;
  label: string;
  sessions: ReturnType<typeof useChatStore>["sessions"];
};

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "/";
  const sessionId = searchParams.get("sessionId");

  const {
    sessions,
    currentSession,
    isLoaded,
    createSession,
    selectSession,
    setMessagesForSession,
    saveSessionPayload,
    deleteSession,
    isGenUIEnabled,
  } = useChatStore();

  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [showSidebar, setShowSidebar] = useState(true);
  const [showFilePane, setShowFilePane] = useState(true);
  const [input, setInput] = useState("");
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set([path]),
  );
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedSessionIdRef = useRef<string | null>(null);
  const lastSyncedSignatureRef = useRef<string>("");
  const pendingSignatureRef = useRef<string>("");
  const pendingMessagesRef = useRef<
    {
      id: string;
      role: "user" | "assistant";
      content: string;
      timestamp: number;
    }[]
  >([]);
  const queuedInputRef = useRef<string | null>(null);

  const activePath = currentSession?.path ?? path;

  useEffect(() => {
    if (!isLoaded) return;

    if (sessionId) {
      if (!currentSession || currentSession.id !== sessionId) {
        selectSession(sessionId);
      }
    } else if (path && (!currentSession || currentSession.path !== path)) {
      const existingSession = sessions.find((session) => session.path === path);
      if (existingSession) {
        selectSession(existingSession.id);
      } else {
        createSession(path);
      }
    }
  }, [
    path,
    sessionId,
    sessions,
    currentSession,
    selectSession,
    createSession,
    isLoaded,
  ]);

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, [path]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    addToolApprovalResponse,
    stop,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        path: activePath,
        genUI: isGenUIEnabled,
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const isActive = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (!currentSession) return;

    if (lastSyncedSessionIdRef.current !== currentSession.id) {
      lastSyncedSessionIdRef.current = currentSession.id;

      const storedSignature = JSON.stringify(
        currentSession.messages.map((message) => [
          message.id,
          message.role,
          message.content,
        ]),
      );

      lastSyncedSignatureRef.current = storedSignature;
      pendingSignatureRef.current = storedSignature;
      pendingMessagesRef.current = currentSession.messages;

      setMessages(
        currentSession.messages.map((message) => ({
          id: message.id,
          role: message.role,
          parts: [{ type: "text", text: message.content }],
          createdAt: new Date(message.timestamp),
        })) as UIMessage[],
      );
    }
  }, [currentSession, setMessages]);

  useEffect(() => {
    if (!currentSession) return;
    if (isActive) return;

    const signature = pendingSignatureRef.current;
    if (!signature || signature === lastSyncedSignatureRef.current) return;

    lastSyncedSignatureRef.current = signature;
    setMessagesForSession(currentSession.id, pendingMessagesRef.current);
  }, [isActive, currentSession, setMessagesForSession]);

  useEffect(() => {
    if (!currentSession) return;

    const mapped = messages
      .filter(
        (message) => message.role === "user" || message.role === "assistant",
      )
      .map((message: UIMessage, index: number) => {
        const text = (message.parts || [])
          .filter((part) => part.type === "text")
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("");

        const createdAt = (message as UIMessage & { createdAt?: Date })
          .createdAt;
        const timestamp =
          createdAt instanceof Date ? createdAt.getTime() : Date.now();

        return {
          id:
            typeof message.id === "string"
              ? message.id
              : `msg-${currentSession.id}-${index}`,
          role: message.role as "user" | "assistant",
          content: text,
          timestamp,
        };
      });

    const signature = JSON.stringify(
      mapped.map((message) => [message.id, message.role, message.content]),
    );

    pendingSignatureRef.current = signature;
    pendingMessagesRef.current = mapped;
  }, [messages, currentSession]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (!currentSession) return;
    if (!queuedInputRef.current) return;
    if (isActive) return;

    const queuedInput = queuedInputRef.current;
    queuedInputRef.current = null;

    sendMessage({
      parts: [{ type: "text", text: queuedInput }],
    });
  }, [currentSession, isActive, sendMessage]);

  const folderGroups = useMemo(() => {
    const groups = new Map<string, FolderGroup>();

    for (const session of sessions) {
      const existing = groups.get(session.path);
      if (existing) {
        existing.sessions.push(session);
      } else {
        groups.set(session.path, {
          path: session.path,
          label: getProjectName(session.path),
          sessions: [session],
        });
      }
    }

    return Array.from(groups.values()).sort(
      (a, b) => b.sessions[0]?.updatedAt - a.sessions[0]?.updatedAt,
    );
  }, [sessions]);

  const currentProjectName = getProjectName(path);

  const handleSend = () => {
    if (!input.trim() || isActive) return;
    const messageText = input.trim();

    if (!currentSession) {
      const session = createSession(path);
      queuedInputRef.current = messageText;
      router.push(`/?path=${encodeURIComponent(path)}&sessionId=${session.id}`);

      setInput("");

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      return;
    }

    sendMessage({
      parts: [{ type: "text", text: messageText }],
    });

    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleCreateChat = (targetPath?: string) => {
    const workspacePath = targetPath || path;
    const session = createSession(workspacePath);
    router.push(
      `/?path=${encodeURIComponent(workspacePath)}&sessionId=${session.id}`,
    );
  };

  const handleCreateFolder = () => {
    setNewFolderPath("");
    setShowFolderDialog(true);
  };

  const handleConfirmFolder = () => {
    if (newFolderPath.trim()) {
      const session = createSession(newFolderPath.trim());
      router.push(
        `/?path=${encodeURIComponent(newFolderPath.trim())}&sessionId=${session.id}`,
      );
    }
    setShowFolderDialog(false);
    setNewFolderPath("");
  };

  const handleOpenSession = (targetSessionId: string, targetPath: string) => {
    selectSession(targetSessionId);
    router.push(
      `/?path=${encodeURIComponent(targetPath)}&sessionId=${targetSessionId}`,
    );
  };

  const handleSaveHistory = async () => {
    if (!currentSession || isActive || isSavingHistory) return;

    setIsSavingHistory(true);

    try {
      const payload = {
        ...currentSession,
        messages: pendingMessagesRef.current,
        updatedAt: Date.now(),
      };

      await saveSessionPayload(payload);
    } catch (error) {
      console.error("Failed to save history", error);
    } finally {
      setIsSavingHistory(false);
    }
  };

  const toggleGroup = (groupPath: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupPath)) {
        next.delete(groupPath);
      } else {
        next.add(groupPath);
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
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
                if (e.key === "Enter") handleConfirmFolder();
                if (e.key === "Escape") setShowFolderDialog(false);
              }}
              placeholder="/path/to/folder"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-muted-foreground/50 transition-colors placeholder:text-muted-foreground"
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
                onClick={handleConfirmFolder}
                disabled={!newFolderPath.trim()}
              >
                Add Folder
              </Button>
            </div>
          </div>
        </div>
      )}
      {showSidebar && (
        <aside className="w-80 shrink-0 border-r bg-card/30 flex flex-col min-h-0">
          <div className="p-3 flex items-center justify-between gap-2">
            <div className="text-md tracking-wider text-muted-foreground pl-2 font-semibold select-none">
              EDIT
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => handleCreateChat()}
              title="New chat"
            >
              <Plus className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 select-none">
            {folderGroups.length === 0 ? (
              <div className="text-xs text-muted-foreground p-3">
                No chats yet
              </div>
            ) : (
              folderGroups.map((group) => {
                const isExpanded = expandedGroups.has(group.path);

                return (
                  <div
                    key={group.path}
                    className="border-l-2 border-accent overflow-hidden"
                  >
                    <div className="flex items-center gap-1">
                      <div
                        onClick={() => toggleGroup(group.path)}
                        className="flex min-w-0 flex-1 items-center gap-2 p-2 text-left"
                      >
                        {isExpanded ? (
                          <FolderOpen className="size-4 text-amber-400 shrink-0" />
                        ) : (
                          <Folder className="size-4 text-amber-400 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-muted-foreground truncate">
                            {group.path}
                          </div>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {group.sessions.length}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCreateChat(group.path)}
                        title="New chat in workspace"
                        className="mr-2 outline-none"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-2 pb-2 space-y-1">
                        {group.sessions
                          .slice()
                          .sort((a, b) => b.updatedAt - a.updatedAt)
                          .map((session) => {
                            const isCurrent = currentSession?.id === session.id;
                            const preview =
                              session.messages[session.messages.length - 1]
                                ?.content || "Empty chat";

                            return (
                              <div
                                key={session.id}
                                className={`group flex items-center gap-2 rounded-lg px-3 py-1/2 transition-colors ${
                                  isCurrent
                                    ? "bg-primary/10"
                                    : "hover:bg-accent/50"
                                }`}
                              >
                                <button
                                  onClick={() =>
                                    handleOpenSession(session.id, session.path)
                                  }
                                  className="min-w-0 flex flex-1 items-center gap-2 text-left"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm truncate">
                                      {session.name}
                                    </div>
                                  </div>
                                </button>

                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-8 shrink-0 opacity-0 group-hover:opacity-100"
                                  onClick={() => deleteSession(session.id)}
                                  title="Delete chat"
                                >
                                  <X className="size-4" />
                                </Button>
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
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 min-h-0 flex">
          <section className="flex-1 min-w-0 flex flex-col relative select-none">
            <div className="border-b px-3 py-2 flex items-center justify-between gap-2 bg-background/80 backdrop-blur-sm">
              <div className="text-[11px] text-muted-foreground truncate">
                {path}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveHistory}
                  disabled={!currentSession || isActive || isSavingHistory}
                  className="gap-2"
                >
                  <Save className="size-4" />
                  {isSavingHistory ? "Saving..." : "Save"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFilePane((prev) => !prev)}
                  className="gap-2"
                >
                  <Folder className="size-4" />
                  {showFilePane ? "Hide files" : "Show files"}
                </Button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-6 relative"
            >
              {selectedFile && (
                <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-sm p-4">
                  <FileViewer
                    filePath={selectedFile}
                    onClose={() => setSelectedFile(undefined)}
                  />
                </div>
              )}

              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="mx-auto size-14 rounded-2xl border bg-card flex items-center justify-center">
                      <Code className="size-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h1 className="text-xl font-semibold">
                        What you want to build!
                      </h1>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-1">
                  {messages.map((message, index) => (
                    <div
                      key={message.id || index}
                      className="animate-message-in"
                      style={{
                        animationDelay: `${Math.min(index * 40, 240)}ms`,
                      }}
                    >
                      {message.role === "user" ? (
                        <div className="flex justify-end py-2">
                          <div className="max-w-[85%] rounded-2xl rounded-br-md border border-primary/20 bg-primary/15 px-4 py-2.5">
                            {message.parts.map((part, partIndex) => {
                              if (part.type !== "text") return null;

                              return (
                                <p
                                  key={partIndex}
                                  className="text-sm leading-relaxed whitespace-pre-wrap"
                                >
                                  {part.text}
                                </p>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="py-2">
                          <div className="min-w-0 flex-1">
                            <MessageUI
                              parts={message.parts}
                              addToolApprovalResponse={addToolApprovalResponse}
                              onFileClick={setSelectedFile}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {isActive && (
                    <div className="flex items-center gap-3 py-3 px-1">
                      <div className="flex items-center gap-1.5">
                        <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                        <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                        <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t bg-background">
              <div className="max-w-3xl mx-auto px-4 py-2 pb-4">
                <div className="flex items-end gap-2 rounded-xl border bg-card p-2 focus-within:border-muted-foreground/50 transition-colors">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event: React.KeyboardEvent) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Send a message..."
                    rows={2}
                    className="ml-1 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground max-h-[200px]"
                  />
                  <div className="flex h-full items-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={handleCreateFolder}
                      title="Add folder"
                      className="rounded-lg shrink-0"
                    >
                      <FolderPlus className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      onClick={isActive ? stop : handleSend}
                      disabled={!isActive && !input.trim()}
                      className="rounded-lg shrink-0"
                    >
                      {isActive ? (
                        <Square className="size-3 fill-current" />
                      ) : (
                        <ArrowUp className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {showFilePane && (
            <aside className="w-80 shrink-0 border-l flex flex-col min-h-0">
              <div className="flex items-center justify-end gap-2 p-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowFilePane(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <FileTree
                  rootPath={path}
                  onFileSelect={setSelectedFile}
                  selectedFile={selectedFile}
                />
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

function getProjectName(sessionPath: string) {
  const parts = sessionPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || sessionPath;
}
