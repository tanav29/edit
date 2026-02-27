"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowUp,
  Folder,
  Sparkles,
  PanelLeft,
  PanelRight,
  Plus,
  Square,
} from "lucide-react";
import { FileTree } from "@/components/file-tree";
import { EditsPanel, type EditInfo } from "@/components/edits-panel";
import { useChatStore } from "@/lib/chat-store";
import MessageUI from "@/components/message";
import { FileViewer } from "@/components/file-viewer";

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "/";
  const sessionId = searchParams.get("sessionId");

  const {
    sessions,
    currentSession,
    createSession,
    selectSession,
    addMessage,
    clearCurrentSession,
    setMessagesForSession
  } = useChatStore();

  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [edits, setEdits] = useState<EditInfo[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize session if not already set or if it's a new path
  useEffect(() => {
    if (sessionId) {
      if (!currentSession || currentSession.id !== sessionId) {
        selectSession(sessionId);
      }
    } else if (path && (!currentSession || currentSession.path !== path)) {
      // Check if we already have a session for this path that we should select
      const existingSession = sessions.find(s => s.path === path);
      if (existingSession) {
        selectSession(existingSession.id);
      } else {
        createSession(path);
      }
    }
  }, [path, sessionId, sessions]);

  const { messages, setMessages, sendMessage, status, addToolApprovalResponse, stop } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: {
          path: path,
        },
      }),
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const isActive = status === "streaming" || status === "submitted";

  // Sync current session messages to useChat state on load
  useEffect(() => {
    if (currentSession && messages.length === 0 && currentSession.messages.length > 0) {
      setMessages(currentSession.messages.map(m => ({
        id: m.id,
        role: m.role,
        parts: [{ type: 'text', text: m.content }],
        createdAt: new Date(m.timestamp)
      })));
    }
  }, [currentSession?.id]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = async () => {
    if (!currentSession?.sessionKey || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/history?key=${currentSession.sessionKey}`);
      if (res.ok) {
        const remoteSession = await res.json();
        setMessagesForSession(currentSession.id, remoteSession.messages);
        setMessages(remoteSession.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: 'text', text: m.content }],
          createdAt: new Date(m.timestamp)
        })));
        window.dispatchEvent(new CustomEvent('remote-update'));
      }
    } catch (err) {
      console.error("Manual sync failed", err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (messages.length > 0 && currentSession) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        addMessage({
          id: `msg-${Date.now()}`,
          role: "user",
          content: lastMessage.parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join(""),
          timestamp: Date.now(),
        });
      } else if (lastMessage.role === "assistant") {
        const textContent = lastMessage.parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
        if (textContent) {
          addMessage({
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: textContent,
            timestamp: Date.now(),
          });
        }
      }
    }
  }, [messages]);

  useEffect(() => {
    const seenIds = new Set(edits.map((e) => e.id));
    const newEdits: EditInfo[] = [];
    messages.forEach((message) => {
      if (message.role === "assistant") {
        message.parts.forEach((part: any) => {
          if (part.type === "tool-write" && part.state === "output-available") {
            const toolCallId =
              part.toolCallId || `${Date.now()}-${Math.random()}`;
            if (seenIds.has(toolCallId)) return;

            const input = part.input as { filePath?: string } | undefined;
            const output = part.output as
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
              <div className="text-[10px] opacity-0 group-hover:opacity-100 bg-accent px-1.5 py-0.5 rounded transition-opacity">Change</div>
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 relative">
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
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl" />
                <div className="relative bg-card border border-border/60 rounded-2xl p-4">
                  <Sparkles className="size-8 text-primary" />
                </div>
              </div>
              <div className="text-center space-y-1.5">
                <h1 className="text-lg font-semibold tracking-tight">
                  What can I help with?
                </h1>
                <p className="text-sm text-muted-foreground/70 max-w-xs">
                  Ask me anything. I can run commands, read and write files, and help
                  you think through problems.
                </p>
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
                                  {part.text}
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
              modelName="minimax-m2.5:cloud"
              edits={edits}
              onEditClick={(edit: EditInfo) => setSelectedFile(edit.path)}
              onSync={handleManualSync}
              isSyncing={isSyncing}
            />
          </div>
        </div>
      )}
    </div>
  );
}
