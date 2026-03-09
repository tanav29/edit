"use client";

import {
  useAIChat,
  type ImagePart,
  type UIMessage,
  type TextPart,
} from "@/lib/use-ai-chat";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowUp,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Check,
  Edit3,
  Folder,
  FolderPlus,
  MessageSquare,
  Plus,
  Palette,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useChatStore } from "@/lib/chat-store";
import MessageUI from "@/components/message";
import { FileViewer } from "@/components/file-viewer";
import { createFolder } from "@/lib/tauri-api";
import { PromptDialog } from "@/components/ui/dialog";

export default function ChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const path = searchParams.get("path") || "/";
  const sessionId = searchParams.get("sessionId");

  const {
    sessions,
    currentSession,
    createSession,
    selectSession,
    setMessagesForSession,
    deleteSession,
    deleteSessionsForPath,
    folderAppearance,
    setFolderColor,
    setFolderName,
  } = useChatStore();

  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [showHistoryPanel, setShowHistoryPanel] = useState(true);
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState<ImagePart[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolderPath, setSelectedFolderPath] = useState(path);
  const [editingFolderPath, setEditingFolderPath] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [colorMenuFolderPath, setColorMenuFolderPath] = useState<string | null>(null);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedSessionIdRef = useRef<string | null>(null);
  const lastSyncedSignatureRef = useRef<string>("");
  const pendingSignatureRef = useRef<string>("");
  const pendingMessagesRef = useRef<
    { id: string; role: "user" | "assistant"; content: string; timestamp: number }[]
  >([]);

  const FOLDER_COLORS = [
    "text-emerald-400",
    "text-sky-400",
    "text-amber-400",
    "text-rose-400",
    "text-violet-400",
  ];

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, typeof sessions>();

    sessions.forEach((session) => {
      const existing = groups.get(session.path) || [];
      existing.push(session);
      groups.set(session.path, existing);
    });

    return Array.from(groups.entries())
      .map(([sessionPath, items]) => ({
        path: sessionPath,
        items: [...items].sort((a, b) => b.updatedAt - a.updatedAt),
        latestUpdatedAt: Math.max(...items.map((item) => item.updatedAt)),
      }))
      .sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
  }, [sessions]);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const {
    messages,
    setMessages,
    hasSessionMessages,
    getSessionStatus,
    sessionNeedsToolApproval,
    sendMessage,
    status,
    addToolApprovalResponse,
    stop,
  } = useAIChat({
    workspacePath: path,
    sessionId: currentSession?.id || sessionId || undefined,
  });

  const isActive = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (sessionId) {
      if (!currentSession || currentSession.id !== sessionId) {
        selectSession(sessionId);
      }
      return;
    }

    if (path && (!currentSession || currentSession.path !== path)) {
      const existingSession = sessions.find((s) => s.path === path);
      if (existingSession) {
        selectSession(existingSession.id);
      } else {
        createSession(path);
      }
    }
  }, [createSession, currentSession, path, selectSession, sessionId, sessions]);

  const handleCreateNewChatInFolder = useCallback((folderPath: string) => {
    const newSession = createSession(folderPath);
    setSelectedFolderPath(folderPath);
    navigate(`/chat?path=${encodeURIComponent(folderPath)}&sessionId=${newSession.id}`);
  }, [createSession, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isOpenShortcut =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o";
      if (!isOpenShortcut) {
        return;
      }

      event.preventDefault();
      const targetFolder = selectedFolderPath || currentSession?.path || path;
      handleCreateNewChatInFolder(targetFolder);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [currentSession?.path, handleCreateNewChatInFolder, path, selectedFolderPath]);

  const handleSelectSession = (id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;

    navigate(`/chat?path=${encodeURIComponent(session.path)}&sessionId=${session.id}`);
    selectSession(id);
    setSelectedFolderPath(session.path);
    lastSyncedSessionIdRef.current = id;
    const storedSignature = JSON.stringify(
      session.messages.map((m) => [m.id, m.role, m.content]),
    );
    lastSyncedSignatureRef.current = storedSignature;
    pendingSignatureRef.current = storedSignature;
    pendingMessagesRef.current = session.messages;
  };

  const startFolderRename = (folderPath: string, fallbackName: string) => {
    setEditingFolderPath(folderPath);
    setEditingFolderName(folderAppearance[folderPath]?.name || fallbackName);
    setColorMenuFolderPath(null);
  };

  const saveFolderRename = () => {
    if (!editingFolderPath) return;
    setFolderName(editingFolderPath, editingFolderName);
    setEditingFolderPath(null);
    setEditingFolderName("");
  };

  const handleCreateNewFolder = () => {
    setShowNewFolderDialog(true)
  };

  const handleNewFolderConfirm = async (folderPath: string) => {
    try {
      await createFolder(folderPath);
      setSelectedFolderPath(folderPath);
      navigate(`/chat?path=${encodeURIComponent(folderPath)}`);
    } catch (error) {
      console.error("Failed to create folder:", error);
      alert(`Failed to create folder: ${error}`);
    }
  };

  useEffect(() => {
    if (!currentSession) return;

    if (lastSyncedSessionIdRef.current !== currentSession.id) {
      lastSyncedSessionIdRef.current = currentSession.id;
      const storedSignature = JSON.stringify(
        currentSession.messages.map((m) => [m.id, m.role, m.content]),
      );
      lastSyncedSignatureRef.current = storedSignature;
      pendingSignatureRef.current = storedSignature;
      pendingMessagesRef.current = currentSession.messages;

      if (!hasSessionMessages(currentSession.id)) {
        setMessages(
          currentSession.messages.map((m) => ({
            id: m.id,
            role: m.role,
            parts: [{ type: "text" as const, text: m.content }],
            createdAt: new Date(m.timestamp),
          })) as UIMessage[],
        );
      }
    }
  }, [currentSession, hasSessionMessages, setMessages]);

  useEffect(() => {
    if (!currentSession || isActive) return;

    const signature = pendingSignatureRef.current;
    if (!signature || signature === lastSyncedSignatureRef.current) return;
    lastSyncedSignatureRef.current = signature;
    setMessagesForSession(currentSession.id, pendingMessagesRef.current);
  }, [currentSession, isActive, setMessagesForSession]);

  useEffect(() => {
    if (!currentSession) return;

    const mapped = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m: UIMessage, idx: number) => {
        const text = (m.parts || [])
          .filter((p): p is TextPart => p.type === "text")
          .map((p) => p.text)
          .join("");

        const createdAt = m.createdAt;
        const timestamp = createdAt instanceof Date ? createdAt.getTime() : Date.now();

        return {
          id: typeof m.id === "string" ? m.id : `msg-${currentSession.id}-${idx}`,
          role: m.role as "user" | "assistant",
          content: text,
          timestamp,
        };
      });

    const signature = JSON.stringify(mapped.map((m) => [m.id, m.role, m.content]));
    pendingSignatureRef.current = signature;
    pendingMessagesRef.current = mapped;
  }, [currentSession, messages]);

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

  const handleSend = () => {
    if ((!input.trim() && attachedImages.length === 0) || isActive) return;

    if (!currentSession) {
      createSession(path);
    }

    const parts: Array<{ type: "text"; text: string } | ImagePart> = [];
    if (input.trim()) {
      parts.push({ type: "text", text: input.trim() });
    }
    parts.push(...attachedImages);

    sendMessage({ parts });
    setInput("");
    setAttachedImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleImagePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const toDataParts = async (file: File): Promise<ImagePart | null> => {
      if (!file.type.startsWith("image/")) return null;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(file);
      });
      const commaIndex = dataUrl.indexOf(",");
      if (commaIndex < 0) return null;

      return {
        type: "image",
        mediaType: file.type,
        data: dataUrl.slice(commaIndex + 1),
        name: file.name,
      };
    };

    const picked = await Promise.all(Array.from(files).map(toDataParts));
    const valid = picked.filter((part): part is ImagePart => part !== null);
    if (valid.length === 0) return;

    setAttachedImages((prev) => [...prev, ...valid].slice(0, 4));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items || items.length === 0) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }

    if (imageFiles.length === 0) return;

    event.preventDefault();
    const dataTransfer = new DataTransfer();
    imageFiles.forEach((file) => dataTransfer.items.add(file));
    void handleImagePick(dataTransfer.files);
  };

  return (
    <div className="flex h-screen bg-[#0b0f0f] text-base text-foreground">
      {showHistoryPanel && (
        <aside className="w-72 border-r border-border/40 bg-card/30">
          <div className="flex h-14 items-center border-b border-border/40 px-4">
            <span className="text-base font-semibold tracking-tight">Chats</span>
          </div>
          <div className="p-3">
            <div className="px-1 text-xs text-muted-foreground">
              Select a folder and press Ctrl+O for a new chat
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full gap-1.5 text-xs"
              onClick={handleCreateNewFolder}
            >
              <FolderPlus className="size-3.5" />
              New Folder
            </Button>
          </div>
          <div className="h-[calc(100vh-7.5rem)] overflow-y-auto px-2 pb-3">
            {groupedHistory.length === 0 ? (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                No chat history yet
              </div>
            ) : (
              groupedHistory.map((group) => {
                const projectName = group.path.split("/").filter(Boolean).pop() || group.path;
                const displayName = folderAppearance[group.path]?.name || projectName;
                const isExpanded = expandedFolders.has(group.path);
                const isSelectedFolder = selectedFolderPath === group.path;
                const folderColor = folderAppearance[group.path]?.color || FOLDER_COLORS[0];
                const isEditing = editingFolderPath === group.path;
                const colorMenuOpen = colorMenuFolderPath === group.path;

                return (
                  <div key={group.path} className="mb-1.5">
                    <div
                      className={`group flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors ${
                        isSelectedFolder ? "bg-accent/70" : "hover:bg-accent/40"
                      }`}
                      onClick={() => setSelectedFolderPath(group.path)}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFolder(group.path);
                        }}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent/50"
                        aria-label="Toggle folder"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </button>
                      <Folder className={`size-3.5 shrink-0 ${folderColor}`} />
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editingFolderName}
                          onChange={(event) => setEditingFolderName(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onBlur={saveFolderRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              saveFolderRename();
                            }
                            if (event.key === "Escape") {
                              setEditingFolderPath(null);
                              setEditingFolderName("");
                            }
                          }}
                           className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                         />
                       ) : (
                         <span className="min-w-0 flex-1 truncate text-sm font-medium">
                           {displayName}
                         </span>
                       )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6"
                        onClick={(event) => {
                          event.stopPropagation();
                          startFolderRename(group.path, projectName);
                        }}
                        title="Rename folder"
                      >
                        <Edit3 className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6"
                        onClick={(event) => {
                          event.stopPropagation();
                          setColorMenuFolderPath((prev) =>
                            prev === group.path ? null : group.path,
                          );
                        }}
                        title="Folder color"
                      >
                        <Palette className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteSessionsForPath(group.path);
                        }}
                        title="Delete folder chats"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>

                    {colorMenuOpen && (
                      <div className="ml-7 mt-1 flex items-center gap-1.5 rounded-md border border-border/50 bg-card/70 p-1.5">
                        {FOLDER_COLORS.map((color) => {
                          const selected = (folderAppearance[group.path]?.color || FOLDER_COLORS[0]) === color;
                          return (
                            <button
                              key={`${group.path}-${color}`}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setFolderColor(group.path, color);
                                setColorMenuFolderPath(null);
                              }}
                              className="relative flex size-6 items-center justify-center rounded-md hover:bg-accent/50"
                              aria-label="Set folder color"
                            >
                              <Folder className={`size-3.5 ${color}`} />
                              {selected && <Check className="absolute size-2.5 text-foreground" />}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {isExpanded && (
                      <div className="ml-6 mt-1 space-y-0.5">
                        {group.items.map((session) => {
                          const sessionStatus = getSessionStatus(session.id);
                          const isSessionStreaming =
                            sessionStatus === "submitted" || sessionStatus === "streaming";
                          const needsApproval = sessionNeedsToolApproval(session.id);

                          return (
                            <div
                              key={session.id}
                              className={`group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                                currentSession?.id === session.id
                                  ? "bg-primary/10 text-primary"
                                  : "hover:bg-accent/40"
                              }`}
                              onClick={() => handleSelectSession(session.id)}
                            >
                              <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate text-sm">{session.name}</span>
                              {needsApproval && (
                                <span
                                  title="Tool approval needed"
                                  className="inline-flex size-4 items-center justify-center text-amber-400"
                                >
                                  <AlertCircle className="size-3.5" />
                                </span>
                              )}
                              {isSessionStreaming && !needsApproval && (
                                <span
                                  title="Streaming in background"
                                  className="inline-block size-2 rounded-full bg-sky-400 animate-pulse"
                                />
                              )}
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="size-5 opacity-0 group-hover:opacity-100 hover:text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteSession(session.id);
                                }}
                                title="Delete chat"
                              >
                                <Trash2 className="size-2.5" />
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

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border/40 px-4">
            <div className="min-w-0">
              <div className="truncate text-base font-medium">
                {currentSession?.name || "New Chat"}
              </div>
              <div className="truncate text-xs text-muted-foreground">{path}</div>
            </div>
            <div className="flex items-center gap-2">
            {!showHistoryPanel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistoryPanel(true)}
                className="h-8 px-2 text-sm"
              >
                Chats
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-sm"
              onClick={() => handleCreateNewChatInFolder(selectedFolderPath || path)}
            >
              <Plus className="size-3.5" />
              New
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-4 py-6">
          {selectedFile && (
            <div className="absolute inset-0 z-20 bg-background/95 p-4 backdrop-blur-sm">
              <FileViewer filePath={selectedFile} onClose={() => setSelectedFile(undefined)} />
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-base text-muted-foreground">Start typing to begin.</p>
                <p className="mt-1 text-sm text-muted-foreground">Ctrl+O opens a new chat in the selected folder.</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-2">
              {messages.map((message, index) => (
                <div
                  key={message.id || index}
                >
                  {message.role === "user" ? (
                    <div className="flex justify-end py-1">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md border border-primary/20 bg-primary/10 px-4 py-2.5">
                        {message.parts.map((part, i) => {
                          if (part.type === "text") {
                            return (
                              <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
                                {(part as TextPart).text}
                              </p>
                            );
                          }
                          if (part.type === "image") {
                            const imagePart = part as ImagePart;
                            return (
                              <img
                                key={i}
                                src={`data:${imagePart.mediaType};base64,${imagePart.data}`}
                                alt={imagePart.name || "attached image"}
                                className="mt-2 rounded-lg border border-border max-h-64 w-auto first:mt-0"
                              />
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="py-1">
                      <MessageUI
                        parts={message.parts}
                        addToolApprovalResponse={addToolApprovalResponse}
                        onFileClick={setSelectedFile}
                      />
                    </div>
                  )}
                </div>
              ))}

              {isActive && (
                <div className="flex items-center gap-1.5 px-1 py-3">
                  <span className="thinking-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="thinking-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="thinking-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border/30 px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <div className="space-y-2 rounded-2xl border border-primary/45 bg-card/70 p-2.5">
              {attachedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1">
                  {attachedImages.map((img, index) => (
                    <div key={`${img.name || "image"}-${index}`} className="relative">
                      <img
                        src={`data:${img.mediaType};base64,${img.data}`}
                        alt={img.name || "attached image"}
                        className="h-16 w-16 rounded-md border border-border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedImages((prev) => prev.filter((_, i) => i !== index));
                        }}
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background hover:bg-accent"
                        aria-label="Remove image"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(event: React.KeyboardEvent) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask anything..."
                  rows={2}
                  className="ml-1 max-h-[200px] flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground"
                />
                <Button
                  size="icon-sm"
                  onClick={isActive ? stop : handleSend}
                  disabled={!isActive && !input.trim() && attachedImages.length === 0}
                  className="shrink-0 rounded-lg disabled:opacity-35"
                >
                  {isActive ? (
                    <Square className="size-3 fill-current" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Enter to send • Shift+Enter new line • Ctrl+O new chat in selected folder
            </p>
          </div>
        </div>
      </main>

      <PromptDialog
        open={showNewFolderDialog}
        onClose={() => setShowNewFolderDialog(false)}
        onConfirm={handleNewFolderConfirm}
        title="Create New Folder"
        placeholder="/home/user/project/new-folder"
        confirmLabel="Create"
      />
    </div>
  );
}
