"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUp,
  CircleX,
  Folder,
  FolderOpen,
  Sparkles,
  PanelLeft,
  PanelRight,
  Plus,
  Trash2,
  MessageSquare,
  Square,
} from "lucide-react";
import { FileTree } from "@/components/file-tree";
import { EditsPanel, type EditInfo } from "@/components/edits-panel";
import { useChatStore } from "@/lib/chat-store";
import MessageUI from "@/components/message";
import { FileViewer } from "@/components/file-viewer";

export default function Page() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [tempPath, setTempPath] = useState("/home/thetanav/Code/minis");

  if (selectedPath === null) {
    return (
      <PathSelector
        path={tempPath}
        onPathChange={setTempPath}
        onConfirm={() => setSelectedPath(tempPath)}
      />
    );
  }

  return (
    <ChatView path={selectedPath} onChangePath={() => setSelectedPath(null)} />
  );
}

function PathSelector({
  path,
  onPathChange,
  onConfirm,
}: {
  path: string;
  onPathChange: (path: string) => void;
  onConfirm: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onConfirm();
    }
  };

  return (
    <div className="flex flex-col h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl" />
            <div className="relative bg-card border border-border/60 rounded-2xl p-4">
              <FolderOpen className="size-10 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">
              Choose Workspace
            </h1>
            <p className="text-sm text-muted-foreground/70 max-w-xs">
              Select a directory to work in. You can change this later.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center px-3 py-3 bg-card border rounded-xl focus-within:border-primary/50 transition-colors">
            <Folder className="size-5 text-muted-foreground shrink-0 mr-3" />
            <Input
              type="text"
              value={path}
              onChange={(e) => onPathChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="/path/to/your/project"
              className="h-9 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm bg-transparent"
              autoFocus
            />
          </div>
          <Button
            onClick={onConfirm}
            className="w-full h-10 rounded-xl text-sm font-medium">
            Open Workspace
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatView({
  path,
  onChangePath,
}: {
  path: string;
  onChangePath: () => void;
}) {
  const [input, setInput] = useState("");
  const [currentPath, setCurrentPath] = useState(path);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showChatList, setShowChatList] = useState(false);
  const [edits, setEdits] = useState<EditInfo[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    sessions,
    currentSession,
    createSession,
    selectSession,
    deleteSession,
    addMessage,
    clearCurrentSession,
  } = useChatStore();

  const pathSessions = sessions.filter((s) => s.path === currentPath);

  const { messages, sendMessage, status, addToolApprovalResponse, stop } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: {
          path: currentPath,
        },
      }),
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const isActive = status === "streaming" || status === "submitted";

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
      createSession(currentPath);
    }

    sendMessage({
      parts: [{ type: "text", text: input.trim() }],
    });
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleNewChat = () => {
    clearCurrentSession();
  };

  const getProjectName = (sessionPath: string) => {
    const parts = sessionPath.split("/");
    return parts[parts.length - 1] || sessionPath;
  };

  return (
    <div className="flex h-screen">
      {showChatList && (
        <div className="w-56 border-r flex flex-col bg-card/50">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Chats
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleNewChat}
              className="size-6"
              title="New chat">
              <Plus className="size-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {pathSessions.length === 0 ? (
              <div className="text-xs text-muted-foreground/70 p-2 text-center">
                No chats yet
              </div>
            ) : (
              pathSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors ${
                    currentSession?.id === session.id
                      ? "bg-accent"
                      : "hover:bg-accent/50"
                  }`}>
                  <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate flex-1">
                    {session.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive">
                    <Trash2 className="size-3" />
                  </button>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t">
            <button
              onClick={onChangePath}
              className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 text-left text-xs text-muted-foreground">
              <Folder className="size-3.5" />
              <span className="truncate">{getProjectName(currentPath)}</span>
            </button>
          </div>
        </div>
      )}

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
                onClick={() => setShowChatList(!showChatList)}
                className="size-6"
                title={showChatList ? "Hide chats" : "Show chats"}>
                <MessageSquare className="size-3.5" />
              </Button>
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
              rootPath={currentPath}
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
            />
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
          {!showChatList && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowChatList(true)}
              className="size-8 bg-background/80 backdrop-blur-sm border shadow-sm"
              title="Show chats">
              <MessageSquare className="size-4" />
            </Button>
          )}
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
            <EmptyState />
          ) : (
            <div className="max-w-2xl mx-auto space-y-1">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className="animate-message-in"
                  style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}>
                  {message.role === "user" ? (
                    <UserMessage parts={message.parts} />
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
              currentPath={currentPath}
              modelName="minimax-m2.5:cloud"
              edits={edits}
              onEditClick={(edit: EditInfo) => setSelectedFile(edit.path)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
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
  );
}

function UserMessage({ parts }: { parts: readonly any[] }) {
  return (
    <div className="flex justify-end py-2">
      <div className="flex items-start gap-2.5 max-w-[85%]">
        <div className="bg-primary/15 border border-primary/20 rounded-2xl rounded-br-md px-4 py-2.5">
          {parts.map((part, i) => {
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
  );
}
