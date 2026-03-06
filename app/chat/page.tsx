"use client";

import { useTauriChat, type UIMessage, type TextPart } from "@/lib/use-tauri-chat";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowUp,
  Folder,
  PanelLeft,
  PanelRight,
  Plus,
  Square,
  Code,
} from "lucide-react";
import { FileTree } from "@/components/file-tree";
import { EditsPanel, type EditInfo } from "@/components/edits-panel";
import { useChatStore } from "@/lib/chat-store";
import MessageUI from "@/components/message";
import { FileViewer } from "@/components/file-viewer";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background text-muted-foreground">Loading...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "/";
  const sessionId = searchParams.get("sessionId");

  const {
    sessions,
    currentSession,
    createSession,
    selectSession,
    setMessagesForSession,
    saveSessionPayload,
    isGenUIEnabled,
  } = useChatStore();

  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [edits, setEdits] = useState<EditInfo[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedSessionIdRef = useRef<string | null>(null);
  const lastSyncedSignatureRef = useRef<string>("");
  const pendingSignatureRef = useRef<string>("");
  const pendingMessagesRef = useRef<
    { id: string; role: "user" | "assistant"; content: string; timestamp: number }[]
  >([]);

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

  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  const handleSaveHistory = async () => {
    if (!currentSession || isActive || isSavingHistory) return;
    setIsSavingHistory(true);
    try {
      const mapped = pendingMessagesRef.current;
      const payload = {
        ...currentSession,
        messages: mapped,
        updatedAt: Date.now(),
      };
      await saveSessionPayload(payload);
    } catch (e) {
      console.error("Failed to save history", e);
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handleManualSync = async () => {
    if (!currentSession?.sessionKey || isSyncing) return;
    setIsSyncing(true);
    try {
      const { getSessionByKey } = await import("@/lib/tauri-api");
      const remoteSession = await getSessionByKey(currentSession.sessionKey);

      setMessagesForSession(currentSession.id, remoteSession.messages);
      setMessages(
        (remoteSession.messages || []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          parts: [{ type: "text" as const, text: m.content }],
          createdAt: new Date(m.timestamp),
        })) as UIMessage[],
      );
      window.dispatchEvent(new CustomEvent("remote-update"));
    } catch (err) {
      console.error("Manual sync failed", err);
    } finally {
      setIsSyncing(false);
    }
  };

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
    const seenIds = new Set(edits.map((e) => e.id));
    const newEdits: EditInfo[] = [];
    messages.forEach((message) => {
      if (message.role === "assistant") {
        message.parts.forEach((part: unknown) => {
          const p = part as {
            type?: string
            state?: string
            toolCallId?: string
            input?: unknown
            output?: unknown
          }

          if ((p.type === "tool-write") && p.state === "output-available") {
            const toolCallId = p.toolCallId || `${Date.now()}-${Math.random()}`;
            if (seenIds.has(toolCallId)) return;

            const input = p.input as { filePath?: string } | undefined;
            const output = p.output as
              | {
                  filePath?: string;
                  action?: string;
                }
              | undefined;

            const filePath = output?.filePath || input?.filePath;
            if (filePath) {
              const action = output?.action;
              newEdits.push({
                id: toolCallId,
                path: filePath,
                type:
                  action === "created"
                    ? "create"
                    : action === "overwritten"
                      ? "modify"
                      : "modify",
                timestamp: new Date(),
              });
            }
          }
        });
      }
    });
    if (newEdits.length > 0) {
      setEdits((prev) => [...prev, ...newEdits]);
    }
  }, [messages]);

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
    if (!input.trim() || isActive) return;

    if (!currentSession) {
      createSession(path);
    }

    sendMessage({
      parts: [{ type: "text", text: input.trim() }],
    });
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleGoHome = () => {
    router.push("/");
  };

  const getProjectName = (sessionPath: string) => {
    const parts = sessionPath.split("/");
    return parts[parts.length - 1] || sessionPath;
  };

  return (
    <div className="flex h-screen bg-background">
      {showLeftPanel && (
        <div className="w-64 border-r flex flex-col bg-card/50">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Files
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowLeftPanel(false)}
                className="size-6">
                <PanelLeft className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <FileTree
              rootPath={path}
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
            />
          </div>
          <div className="p-2 border-t">
            <button
              onClick={handleGoHome}
              className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 text-left text-xs text-muted-foreground group">
              <Folder className="size-3.5" />
              <span className="truncate flex-1">{getProjectName(path)}</span>
              <div className="text-[10px] opacity-0 group-hover:opacity-100 bg-accent px-1.5 py-0.5 rounded transition-opacity">
                Change
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="absolute top-3 left-3 z-10 flex gap-1">
          {!showLeftPanel && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowLeftPanel(true)}
              className="size-8 bg-background/80 backdrop-blur-sm border shadow-sm">
              <PanelLeft className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleGoHome}
            className="size-8 bg-background/80 backdrop-blur-sm border shadow-sm"
            title="Go to Home">
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="absolute top-3 right-3 z-10">
          {!showRightPanel && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowRightPanel(true)}
              className="size-8 bg-background/80 backdrop-blur-sm border shadow-sm">
              <PanelRight className="size-4" />
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
            <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
              <div className="relative">
                <div className="relative bg-card border border-border/60 rounded-2xl p-6">
                  <Code className="size-6 text-primary" />
                </div>
              </div>
              <div className="text-center space-y-1.5">
                <h1 className="text-lg font-semibold tracking-tight">
                  What would you code today?
                </h1>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-1">
              {messages.map((message, index) => (
                <div
                  key={index}
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
            <div className="flex justify-center items-end gap-2 bg-card border rounded-xl focus-within:border-muted-foreground/50 p-2 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Send a message..."
                rows={2}
                className="ml-1 flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-muted-foreground max-h-[200px]"
              />
              <div className="h-full items-end flex">
                <Button
                  size="icon-sm"
                  onClick={isActive ? stop : handleSend}
                  disabled={!isActive && !input.trim()}
                  className="rounded-lg shrink-0 transition-all duration-200 disabled:opacity-30 cursor-pointer">
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
      </div>

      {showRightPanel && (
        <div className="w-72 border-l flex flex-col bg-card/50">
          <div className="flex items-center justify-start p-3 border-b">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowRightPanel(false)}
              className="size-6">
              <PanelRight className="size-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <EditsPanel
              currentPath={path}
              modelName="qwen3:32b"
              edits={edits}
              onEditClick={(edit: EditInfo) => setSelectedFile(edit.path)}
              onSync={handleManualSync}
              isSyncing={isSyncing}
              onSaveHistory={handleSaveHistory}
              isSavingHistory={isSavingHistory}
              canSaveHistory={Boolean(currentSession) && !isActive}
            />
          </div>
        </div>
      )}
    </div>
  );
}
