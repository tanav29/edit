"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ToolUIPart,
} from "ai";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUp,
  ArrowLeft,
  Bot,
  Brain,
  Bug,
  Check,
  ChevronDown,
  CircleX,
  File,
  Folder,
  FolderOpen,
  Link,
  Loader2,
  Sparkles,
  Terminal as TerIcon,
  User,
  CommandIcon,
  PenLine,
  BookOpenCheck,
  Globe,
  BookSearch,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { FileTree } from "@/components/file-tree";
import { EditsPanel, type EditInfo } from "@/components/edits-panel";
import {
  Terminal,
  TerminalActions,
  TerminalClearButton,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from "@/components/ai-elements/terminal";

export default function Page() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [tempPath, setTempPath] = useState("/home/thetanav/Code/project/edit");

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

/* ── Path Selector View ───────────────────────────────────── */
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

/* ── Chat View ────────────────────────────────────────────── */
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
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [edits, setEdits] = useState<EditInfo[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Track edits from tool calls
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
    sendMessage({
      parts: [{ type: "text", text: input.trim() }],
    });
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  return (
    <div className="flex h-screen">
      {/* Left Panel - File Tree */}
      {showLeftPanel && (
        <div className="w-64 border-r flex flex-col bg-card/50">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Files
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowLeftPanel(false)}
              className="size-6">
              <PanelLeft className="size-3.5" />
            </Button>
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

      {/* Center Panel - Chat */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Panel toggle buttons */}
        <div className="absolute top-3 left-3 z-10">
          {!showLeftPanel && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowLeftPanel(true)}
              className="size-8 bg-background/80 backdrop-blur-sm border shadow-sm">
              <PanelLeft className="size-4" />
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

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
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
                    <AssistantMessage
                      parts={message.parts}
                      addToolApprovalResponse={addToolApprovalResponse}
                    />
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

        {/* Input area */}
        <div className="bg-background">
          <div className="max-w-2xl mx-auto p-4 pt-0 space-y-2">
            <div className="flex justify-center items-end gap-2 bg-card border rounded-xl focus-within:border-muted-foreground/50 p-2 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
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
                  className="rounded-lg shrink-0 transition-all duration-200 disabled:opacity-30">
                  {isActive ? (
                    <CircleX className="size-4" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Edits & Info */}
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
              onEditClick={(edit) => setSelectedFile(edit.path)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────── */
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

/* ── User message ─────────────────────────────────────────── */
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

/* ── Assistant message ────────────────────────────────────── */
function AssistantMessage({
  parts,
  addToolApprovalResponse,
}: {
  parts: readonly any[];
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  return (
    <div className="py-2">
      <div className="flex items-start max-w-full">
        <div className="min-w-0 flex-1 space-y-2">
          {parts.map((part, partIndex) => {
            const key =
              "toolCallId" in part && part.toolCallId
                ? part.toolCallId
                : partIndex;

            switch (part.type) {
              case "text":
                return (
                  <div key={key} className="text-sm">
                    <Streamdown
                      className="chat-markdown"
                      mode="static"
                      plugins={{ code, mermaid, math, cjk }}
                      shikiTheme={["github-light", "github-dark"]}
                      mermaid={{ config: { theme: "dark" } }}
                      isAnimating={part.state === "streaming"}>
                      {part.text}
                    </Streamdown>
                  </div>
                );

              case "reasoning":
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 text-xs text-muted-foreground/90 py-1">
                    {part.state === "streaming" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Brain className="size-3" />
                    )}
                    <span>Thinking</span>
                  </div>
                );

              case "source-document":
                return (
                  <div
                    key={key}
                    className="inline-flex items-center gap-1.5 text-xs bg-card border border-border/50 rounded-md px-2 py-1 text-muted-foreground">
                    <File className="size-3" />
                    <span className="font-mono">{part.filename}</span>
                  </div>
                );

              case "source-url":
                return (
                  <a
                    key={key}
                    href={part.url}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                    target="_blank"
                    rel="noopener noreferrer">
                    <Link className="size-3" />
                    <span className="underline underline-offset-2">
                      {part.title}
                    </span>
                  </a>
                );

              default:
                if (part.type.startsWith("tool-")) {
                  return (
                    <ToolPart
                      key={key}
                      part={part as ToolUIPart}
                      addToolApprovalResponse={addToolApprovalResponse}
                    />
                  );
                }
                return null;
            }
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Tool part ────────────────────────────────────────────── */
function ToolPart({
  part,
  addToolApprovalResponse,
}: {
  part: ToolUIPart;
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  const toolName = part.type.replace("tool-", "");

  if (part.state === "approval-requested") {
    return (
      <div className="tool-card rounded-xl p-3.5 space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <TerIcon className="size-3 text-amber-400" />
          </div>
          <span className="text-xs font-medium text-foreground/90">
            {toolName}
          </span>
          <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
            needs approval
          </span>
        </div>

        {part.input != null && (
          <div className="bg-background/60 rounded-lg p-2.5 border border-border/30 max-h-48 overflow-auto">
            {Object.entries(part.input as Record<string, unknown>).map(
              ([k, v]) => (
                <div key={k} className="text-xs mb-1 last:mb-0">
                  <span className="text-muted-foreground font-mono">{k}:</span>{" "}
                  <span className="text-foreground/80 font-mono">
                    {typeof v === "object"
                      ? JSON.stringify(v, null, 2)
                      : String(v ?? "")}
                  </span>
                </div>
              ),
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="xs"
            onClick={() => {
              addToolApprovalResponse({
                id: part.approval.id,
                approved: true,
              });
            }}
            className="rounded-lg text-xs">
            Approve
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              addToolApprovalResponse({
                id: part.approval.id,
                approved: false,
              });
            }}
            className="rounded-lg text-xs">
            Decline
          </Button>
        </div>
      </div>
    );
  }

  // Compact inline display for resolved tool calls
  return (
    <details>
      <summary className="flex items-center gap-2 text-xs py-0.5 animate-fade-in text-muted-foreground/90 select-none cursor-pointer">
        {part.state == "output-available" ||
        part.state == "output-denied" ||
        part.state == "approval-responded" ||
        part.state == "output-error" ? (
          <>
            {part.state === "output-error" && <Bug className="size-3" />}
            {part.state === "output-denied" && <CircleX className="size-3" />}
            {part.state === "output-available" && (
              <>
                {toolName == "read" && <BookSearch className="size-3" />}
                {toolName == "bash" && <TerIcon className="size-3" />}
                {toolName == "write" && <PenLine className="size-3" />}
                {toolName == "web-search" && <Globe className="size-3" />}
              </>
            )}
            {part.state === "approval-responded" && !part.approval.approved && (
              <CircleX className="size-3" />
            )}
          </>
        ) : (
          <Loader2 className="size-3 animate-spin" />
        )}
        {part.title && <span>{part.title}</span>}
        {(() => {
          const input = part.input;
          if (
            input &&
            typeof input === "object" &&
            "filePath" in input &&
            typeof (input as { filePath: unknown }).filePath === "string"
          ) {
            return (
              <span className="text-muted-foreground/90">
                {(input as { filePath: string }).filePath}
              </span>
            );
          }
          if (
            input &&
            typeof input === "object" &&
            "command" in input &&
            typeof (input as { command: unknown }).command === "string"
          ) {
            return (
              <span className="text-muted-foreground/90">
                {(input as { command: string }).command}
              </span>
            );
          }
          return null;
        })()}
        {(() => {
          // Show compact status for write tool
          if (
            part.state === "output-available" &&
            toolName === "write" &&
            part.output &&
            typeof part.output === "object"
          ) {
            const out = part.output as Record<string, unknown>;
            const label =
              out.action === "created"
                ? "created"
                : out.action === "edited"
                  ? `${String(out.editCount)} edit(s)`
                  : "written";
            return <span className="text-emerald-500/80 ml-1">{label}</span>;
          }
          // Show compact range for read tool
          if (
            part.state === "output-available" &&
            toolName === "read" &&
            part.output &&
            typeof part.output === "object" &&
            "range" in (part.output as Record<string, unknown>)
          ) {
            const out = part.output as Record<string, unknown>;
            return (
              <span className="text-muted-foreground/60 ml-1">
                lines {String(out.range)} of {String(out.totalLines)}
              </span>
            );
          }
          return null;
        })()}
      </summary>
      <div className="text-xs max-h-72 overflow-y-auto overflow-x-hidden wrap-break-word animate-fade-in mt-2">
        <ToolOutput toolName={toolName} output={part.output} />
      </div>
    </details>
  );
}

/* ── Formatted tool output ────────────────────────────────── */
function ToolOutput({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) {
  if (!output) return null;

  const data = output as Record<string, unknown>;

  // Error display for any tool
  if (data.error) {
    return (
      <div className="text-red-400 font-mono whitespace-pre-wrap">
        {String(data.error)}
      </div>
    );
  }

  // Read tool: show file content with line numbers
  if (toolName === "read" && data.content) {
    return (
      <div className="space-y-2 tool-card rounded-lg p-3.5">
        <div className="flex items-center gap-3 text-muted-foreground/70 text-[10px] pb-1 border-b border-border/30">
          <span>{String(data.filePath)}</span>
          <span>
            {String(data.range)} of {String(data.totalLines)} lines
          </span>
          {data.size != null && (
            <span>{formatFileSize(Number(data.size))}</span>
          )}
        </div>
        <pre className="font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed">
          {String(data.content)}
        </pre>
        {data.hint != null && (
          <div className="text-muted-foreground/60 text-[10px] pt-1 border-t border-border/30 italic">
            {String(data.hint)}
          </div>
        )}
      </div>
    );
  }

  // Write tool: show edit summary
  if (toolName === "write") {
    const editsArr = Array.isArray(data.edits)
      ? (data.edits as Array<Record<string, unknown>>)
      : [];

    return (
      <div className="space-y-2 tool-card rounded-lg p-3.5">
        <div className="flex items-center gap-2 text-[10px] pb-1 border-b border-border/30">
          <span
            className={
              data.action === "created"
                ? "text-emerald-400"
                : data.action === "edited"
                  ? "text-amber-400"
                  : "text-blue-400"
            }>
            {String(data.action ?? "").toUpperCase()}
          </span>
          <span className="text-muted-foreground/70">
            {String(data.filePath)}
          </span>
        </div>
        {editsArr.map((edit, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
            <span className="font-mono">L{String(edit.range)}</span>
            <span className="text-red-400/70">
              -{String(edit.linesRemoved)}
            </span>
            <span className="text-emerald-400/70">
              +{String(edit.linesAdded)}
            </span>
            {edit.description != null && (
              <span className="text-muted-foreground/50 ml-1">
                {String(edit.description)}
              </span>
            )}
          </div>
        ))}
        {data.message != null && (
          <div className="text-muted-foreground/60 text-[10px]">
            {String(data.message)}
          </div>
        )}
        {data.previousLineCount !== undefined && (
          <div className="text-muted-foreground/50 text-[10px]">
            {String(data.previousLineCount)} &rarr; {String(data.newLineCount)}{" "}
            lines
          </div>
        )}
      </div>
    );
  }

  if (toolName === "bash" && data.stdout) {
    console.log("Bash output:", data.stdout);
    return (
      <Terminal
        autoScroll={false}
        isStreaming={false}
        onClear={() => {}}
        output={String(data.stdout)}>
        <TerminalHeader>
          <TerminalTitle>{String(data.path)}</TerminalTitle>
          <div className="flex items-center gap-1">
            <TerminalStatus />
            <TerminalActions>
              <TerminalCopyButton onCopy={() => {}} />
            </TerminalActions>
          </div>
        </TerminalHeader>
        <TerminalContent />
      </Terminal>
    );
  }

  // Default: JSON dump
  return (
    <pre className="tool-card rounded-lg p-3.5">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
