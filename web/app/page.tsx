"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type ToolUIPart } from "ai";
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
  Bot,
  Brain,
  Bug,
  Check,
  ChevronDown,
  CircleX,
  File,
  Folder,
  Link,
  Loader2,
  Sparkles,
  Terminal,
  User,
} from "lucide-react";

export default function Page() {
  const [input, setInput] = useState("");
  const [path, setPath] = useState("home/thetanav/Code/minis/");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, addToolApprovalResponse, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        path
      }
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const isActive = status === "streaming" || status === "submitted";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
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
    <div className="flex flex-col h-screen">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-2xl mx-auto space-y-1">
            {messages.map((message, index) => (
              <div
                key={index}
                className="animate-message-in"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
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

            {/* Streaming indicator */}
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
          <div className="flex items-center gap-2 px-2">
            <Folder className="size-4 text-muted-foreground shrink-0" />
            <Input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="Enter working directory path..."
              className="h-8 text-xs bg-card border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
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
                className="rounded-lg shrink-0 transition-all duration-200 disabled:opacity-30"
              >
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
          Ask me anything. I can run commands, read and write files, and help you think through problems.
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
                <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
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
  addToolApprovalResponse: (response: { id: string; approved: boolean }) => void;
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
                  <div key={key} className="chat-markdown text-sm">
                    <Streamdown
                      plugins={{ code, mermaid, math, cjk }}
                      isAnimating={part.state === "streaming"}
                    >
                      {part.text}
                    </Streamdown>
                  </div>
                );

              case "reasoning":
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 text-xs text-muted-foreground/90 py-1"
                  >
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
                    className="inline-flex items-center gap-1.5 text-xs bg-card border border-border/50 rounded-md px-2 py-1 text-muted-foreground"
                  >
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
                    rel="noopener noreferrer"
                  >
                    <Link className="size-3" />
                    <span className="underline underline-offset-2">{part.title}</span>
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
  addToolApprovalResponse: (response: { id: string; approved: boolean }) => void;
}) {
  const toolName = part.type.replace("tool-", "");
  console.log(part.output!)
  if (part.state === "approval-requested") {
    return (
      <div className="tool-card rounded-xl p-3.5 space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Terminal className="size-3 text-amber-400" />
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
            {Object.entries(part.input as Record<string, unknown>).map(([k, v]) => (
              <div key={k} className="text-xs mb-1 last:mb-0">
                <span className="text-muted-foreground font-mono">{k}:</span>{" "}
                <span className="text-foreground/80 font-mono">
                  {typeof v === "object"
                    ? JSON.stringify(v, null, 2)
                    : String(v ?? "")}
                </span>
              </div>
            ))}
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
            className="rounded-lg text-xs"
          >
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
            className="rounded-lg text-xs"
          >
            Decline
          </Button>
        </div>
      </div>
    );
  }

  // Compact inline display for resolved tool calls
  return (
    <details>
      <summary className="flex items-center gap-2 text-xs py-0.5 animate-fade-in text-muted-foreground/90">
        {part.state == "output-available" || part.state == "output-denied" || part.state == "approval-responded" || part.state == "output-error" ? (
          <>
            {part.state === "output-error" && (
              <Bug className="size-3" />
            )}
            {part.state === "output-denied" && (
              <CircleX className="size-3" />
            )}
            {part.state === "output-available" && (
              <Check className="size-3" />
            )}
            {part.state === "approval-responded" && !part.approval.approved && (
              <CircleX className="size-3" />
            )}
          </>
        ) : (
          <Loader2 className="size-3 animate-spin" />
        )}
        {part.title && (
          <span>{part.title}</span>
        )}
        {(() => {
          const input = part.input;
          if (input && typeof input === 'object' && 'filePath' in input && typeof (input as { filePath: unknown }).filePath === 'string') {
            return <span className="text-muted-foreground/90">{(input as { filePath: string }).filePath}</span>;
          }
          if (input && typeof input === 'object' && 'command' in input && typeof (input as { command: unknown }).command === 'string') {
            return <span className="text-muted-foreground/90">{(input as { command: string }).command}</span>;
          }
          return null;
        })()}
        <ChevronDown className="size-3" />
      </summary>
      <div className="text-xs max-h-48 overflow-y-auto overflow-x-hidden wrap-break-word rounded-lg p-3.5 tool-card animate-fade-in mt-2">
        {part.output! && <pre>{JSON.stringify(part.output, null, 2)}</pre>}
      </div>
    </details>
  );
}
