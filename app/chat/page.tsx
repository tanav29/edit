"use client";

import {
  useTauriChat,
  type ImagePart,
  type UIMessage,
  type TextPart,
} from "@/lib/use-tauri-chat";
import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUp,
  Folder,
  PanelRight,
  Plus,
  Square,
  Code,
  X,
  MessageSquare,
  Trash2,
  ChevronDown,
  ChevronRight,
  Files,
  Settings,
} from "lucide-react";
import { FileTree } from "@/components/file-tree";
import { useChatStore } from "@/lib/chat-store";
import MessageUI from "@/components/message";
import { FileViewer } from "@/components/file-viewer";

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
    folderDefaultPaths,
    setFolderDefaultPath,
    getFolderDefaultPath,
  } = useChatStore();

  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [showHistoryPanel, setShowHistoryPanel] = useState(true);
  const [showFileTreePanel, setShowFileTreePanel] = useState(false);
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState<ImagePart[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [newChatPath, setNewChatPath] = useState("");
  const [newChatFolder, setNewChatFolder] = useState<string | null>(null);
  const [showFolderSettings, setShowFolderSettings] = useState<string | null>(null);
  const [folderSettingPath, setFolderSettingPath] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedSessionIdRef = useRef<string | null>(null);
  const lastSyncedSignatureRef = useRef<string>("");
  const pendingSignatureRef = useRef<string>("");
  const pendingMessagesRef = useRef<
    { id: string; role: "user" | "assistant"; content: string; timestamp: number }[]
  >([]);

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

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Initialize session if not already set or if it's a new path
  useEffect(() => {
    if (sessionId) {
      if (!currentSession || currentSession.id !== sessionId) {
        selectSession(sessionId);
      }
    } else if (path && (!currentSession || currentSession.path !== path)) {
      const existingSession = sessions.find((s) => s.path === path);
      if (existingSession) {
        selectSession(existingSession.id);
      } else {
        createSession(path);
      }
    }
  }, [path, sessionId, sessions]);

  const handleSelectSession = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    
    selectSession(sessionId);
    lastSyncedSessionIdRef.current = sessionId;
    const storedSignature = JSON.stringify(
      session.messages.map((m) => [m.id, m.role, m.content]),
    );
    lastSyncedSignatureRef.current = storedSignature;
    pendingSignatureRef.current = storedSignature;
    pendingMessagesRef.current = session.messages;

    setMessages(
      session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text" as const, text: m.content }],
        createdAt: new Date(m.timestamp),
      })) as UIMessage[],
    );
  };

  const handleOpenNewChatDialog = (folderPath: string) => {
    const defaultPath = getFolderDefaultPath(folderPath) || folderPath;
    setNewChatFolder(folderPath);
    setNewChatPath(defaultPath);
    setShowNewChatDialog(true);
  };

  const handleCreateNewChat = () => {
    if (!newChatPath.trim() || !newChatFolder) return;
    
    if (newChatPath !== newChatFolder) {
      setFolderDefaultPath(newChatFolder, newChatPath);
    }
    
    const newSession = createSession(newChatPath);
    setShowNewChatDialog(false);
    navigate(`/chat?path=${encodeURIComponent(newChatPath)}&sessionId=${newSession.id}`);
  };

  const handleOpenFolderSettings = (folderPath: string) => {
    const currentDefault = getFolderDefaultPath(folderPath) || folderPath;
    setFolderSettingPath(currentDefault);
    setShowFolderSettings(folderPath);
  };

  const handleSaveFolderSettings = () => {
    if (!showFolderSettings || !folderSettingPath.trim()) return;
    setFolderDefaultPath(showFolderSettings, folderSettingPath);
    setShowFolderSettings(null);
  };

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    addToolApprovalResponse,
    stop,
  } = useTauriChat({
    workspacePath: path,
  });

  const isActive = status === "streaming" || status === "submitted";

  // Sync current session messages to useTauriChat state on load
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

      setMessages(
        currentSession.messages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: "text" as const, text: m.content }],
          createdAt: new Date(m.timestamp),
        })) as UIMessage[],
      );
    }
  }, [currentSession?.id, setMessages]);

  useEffect(() => {
    if (!currentSession) return;
    if (isActive) return;

    const signature = pendingSignatureRef.current;
    if (!signature || signature === lastSyncedSignatureRef.current) return;
    lastSyncedSignatureRef.current = signature;
    setMessagesForSession(currentSession.id, pendingMessagesRef.current);
  }, [isActive, currentSession?.id, setMessagesForSession]);

  // Track latest messages, but only persist after streaming finishes.
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
  }, [messages, currentSession?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
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
    const valid = picked.filter((p): p is ImagePart => p !== null);
    if (valid.length === 0) return;

    setAttachedImages((prev) => [...prev, ...valid].slice(0, 4));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) {
        imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;

    e.preventDefault();

    const dataTransfer = new DataTransfer();
    imageFiles.forEach((file) => dataTransfer.items.add(file));
    void handleImagePick(dataTransfer.files);
  };

  return (
    <div className="flex h-screen bg-background">
      {showHistoryPanel && (
        <div className="w-64 border-r flex flex-col bg-card/50">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Chats
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowHistoryPanel(false)}
                className="size-6">
                <PanelRight className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="p-2">
            <Button
              variant="outline"
              className="w-full justify-start text-xs gap-2"
              onClick={() => handleOpenNewChatDialog(path)}
            >
              <Plus className="size-3.5" />
              New Chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {groupedHistory.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-8 text-center space-y-2">
                <MessageSquare className="size-8 mx-auto opacity-30" />
                <p>No chat history yet</p>
                <p className="text-[10px] opacity-60">Start a new chat to begin</p>
              </div>
            ) : (
              groupedHistory.map((group) => {
                const projectName = group.path.split("/").filter(Boolean).pop() || group.path;
                const isExpanded = expandedFolders.has(group.path);
                const isCurrentPath = group.path === path;

                return (
                    <div key={group.path} className="space-y-1">
                      {isExpanded && folderDefaultPaths[group.path] && folderDefaultPaths[group.path] !== group.path && (
                        <div className="text-[10px] text-muted-foreground px-1 ml-6 flex items-center gap-1">
                          <span className="opacity-60">Default:</span>
                          <span className="font-mono truncate">{folderDefaultPaths[group.path]}</span>
                        </div>
                      )}
                      <div
                      className={`flex items-center gap-1 p-2 rounded-lg cursor-pointer transition-colors ${
                        isCurrentPath ? "bg-accent" : "hover:bg-accent/50"
                      }`}
                    >
                      <button
                        onClick={() => toggleFolder(group.path)}
                        className="p-0.5 hover:bg-accent/50 rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-3.5 text-muted-foreground" />
                        )}
                      </button>
                      <Folder className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate flex-1 min-w-0">
                        {projectName}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSessionsForPath(group.path);
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 opacity-0 group-hover:opacity-100 hover:text-muted-foreground hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFolderSettings(group.path);
                        }}
                        title="Folder settings"
                      >
                        <Settings className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 hover:text-primary hover:bg-primary/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenNewChatDialog(group.path);
                        }}
                        title="New chat in this folder"
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="ml-4 space-y-0.5">
                        {group.items.map((session) => (
                          <div
                            key={session.id}
                            className={`group flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-colors ${
                              currentSession?.id === session.id
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-accent/50"
                            }`}
                            onClick={() => handleSelectSession(session.id)}
                          >
                            <MessageSquare className="size-3 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs truncate">{session.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {new Date(session.updatedAt).toLocaleDateString()}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="size-5 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(session.id);
                              }}
                            >
                              <Trash2 className="size-2.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="absolute top-3 left-3 z-10 flex gap-1">
          {!showHistoryPanel && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowHistoryPanel(true)}
              className="size-8 bg-background/80 backdrop-blur-sm border shadow-sm"
              title="Show chat history">
              <MessageSquare className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleOpenNewChatDialog(path)}
            className="size-8 bg-background/80 backdrop-blur-sm border shadow-sm"
            title="New chat">
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="absolute top-3 right-3 z-10 flex gap-1">
          {!showFileTreePanel && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowFileTreePanel(true)}
              className="size-8 bg-background/80 backdrop-blur-sm border shadow-sm"
              title="Show files">
              <Files className="size-4" />
            </Button>
          )}
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-6 relative">
          {selectedFile && (
            <div className="absolute inset-0 z-20 p-4 bg-background/95 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
              <FileViewer
                filePath={selectedFile}
                onClose={() => setSelectedFile(undefined)}
              />
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in">
              <div className="relative">
                <div className="relative bg-card border border-border/60 rounded-2xl p-8">
                  <Code className="size-10 text-primary" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <h1 className="text-xl font-semibold tracking-tight">
                  What would you like to build?
                </h1>
                <p className="text-sm text-muted-foreground max-w-md">
                  I can read, edit, and create files. Just tell me what you want to accomplish.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card/50 px-3 py-1.5 rounded-full border">
                <Folder className="size-3" />
                <span className="truncate max-w-[200px]">{path}</span>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-1">
              {messages.map((message, index) => (
                <div
                  key={message.id || index}
                  className="animate-message-in"
                  style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}>
                  {message.role === "user" ? (
                    <div className="flex justify-end py-2">
                      <div className="flex items-start gap-2.5 max-w-[85%]">
                        <div className="bg-primary/15 border border-primary/20 rounded-2xl rounded-br-md px-4 py-2.5">
                          {message.parts.map((part, i) => {
                            if (part.type === "text") {
                              return (
                                <p
                                  key={i}
                                  className="text-sm leading-relaxed whitespace-pre-wrap">
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
                                  className="mt-2 first:mt-0 rounded-lg border border-primary/20 max-h-64 w-auto"
                                />
                              );
                            }
                            return null;
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2">
                      <div className="flex items-start max-w-full">
                        <div className="min-w-0 flex-1 space-y-2">
                          <MessageUI
                            parts={message.parts}
                            addToolApprovalResponse={addToolApprovalResponse}
                            onFileClick={setSelectedFile}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isActive && (
                <div className="flex items-center gap-3 py-3 px-1 animate-fade-in">
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

        <div className="bg-background">
          <div className="max-w-2xl mx-auto pt-0 pb-4 space-y-2">
            <div className="bg-card border rounded-xl focus-within:border-muted-foreground/50 p-2 transition-colors space-y-2">
              {attachedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1 pt-1">
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
                        className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border flex items-center justify-center hover:bg-accent"
                        aria-label="Remove image"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-center items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask anything... (Shift+Enter for new line)"
                  rows={2}
                  className="ml-1 flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-muted-foreground max-h-[200px]"
                />
                <div className="h-full items-end flex">
                  <Button
                    size="icon-sm"
                    onClick={isActive ? stop : handleSend}
                    disabled={!isActive && !input.trim() && attachedImages.length === 0}
                    className="rounded-lg shrink-0 transition-all duration-200 disabled:opacity-30 cursor-pointer"
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
            <div className="text-[10px] text-muted-foreground text-center px-2">
              <span className="hidden sm:inline">Enter</span> to send · <span className="hidden sm:inline">Shift+Enter</span> for new line · Paste images directly
            </div>
          </div>
        </div>
      </div>

      {showFileTreePanel && (
        <div className="w-72 border-l flex flex-col bg-card/50">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Files
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowFileTreePanel(false)}
              className="size-6">
              <PanelRight className="size-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <FileTree
              rootPath={path}
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
            />
          </div>
        </div>
      )}

      {showNewChatDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border rounded-xl p-4 w-full max-w-md mx-4 space-y-4 shadow-xl animate-in zoom-in-95">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">New Chat</h2>
              <p className="text-sm text-muted-foreground">
                Enter the workspace directory for this chat
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Workspace Path
              </label>
              <Input
                value={newChatPath}
                onChange={(e) => setNewChatPath(e.target.value)}
                placeholder="/path/to/project"
                className="font-mono text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateNewChat();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowNewChatDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateNewChat}
                disabled={!newChatPath.trim()}
              >
                Create Chat
              </Button>
            </div>
          </div>
        </div>
      )}

      {showFolderSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border rounded-xl p-4 w-full max-w-md mx-4 space-y-4 shadow-xl animate-in zoom-in-95">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Folder Settings</h2>
              <p className="text-sm text-muted-foreground">
                Set the default workspace for this folder
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Default Workspace Path
              </label>
              <Input
                value={folderSettingPath}
                onChange={(e) => setFolderSettingPath(e.target.value)}
                placeholder="/path/to/project"
                className="font-mono text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveFolderSettings();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowFolderSettings(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveFolderSettings}
                disabled={!folderSettingPath.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
