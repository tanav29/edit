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
  Folder,
  FolderOpen,
  Sparkles,
  Square,
  Smartphone,
  Loader2,
  RefreshCw
} from "lucide-react";
import { useChatStore, ChatSession } from "@/lib/chat-store";
import MessageUI from "@/components/message";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

export default function MobileRemotePage() {
  const { key } = useParams();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectSession, currentSession } = useChatStore();

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`/api/history?key=${key}`);
        if (res.ok) {
          const data = await res.json();
          setSession(data);
          // We don't necessarily need to put it in the local store 
          // but we need its path for the chat transport
        } else {
          setError("Session not found or remote mode disabled.");
        }
      } catch (err) {
        setError("Failed to connect to PC.");
      } finally {
        setLoading(false);
      }
    }
    if (key) fetchSession();
  }, [key]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 animate-pulse">
        <Smartphone className="size-12 text-primary" />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Connecting to PC...</span>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <Smartphone className="size-8 text-destructive" />
        </div>
        <h1 className="text-xl font-bold">Connection Failed</h1>
        <p className="text-muted-foreground">{error || "Invalid session key."}</p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    );
  }

  return <MobileChatView session={session} />;
}

function MobileChatView({ session }: { session: ChatSession }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, setMessages, sendMessage, status, addToolApprovalResponse, stop } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: {
          path: session.path,
        },
      }),
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/history?key=${session.sessionKey}`);
      if (res.ok) {
        const remoteSession = await res.json();
        setMessages(remoteSession.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: 'text', text: m.content }],
          createdAt: new Date(m.timestamp)
        })));
      }
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Load initial messages
  useEffect(() => {
    if (session.messages.length > 0 && messages.length === 0) {
      setMessages(session.messages.map(m => ({
        id: m.id,
        role: m.role,
        parts: [{ type: 'text', text: m.content }],
        createdAt: new Date(m.timestamp)
      })));
    }
  }, [session.id]);

  // REMOVED automatic polling for remote updates
  // useEffect(() => { ... }, [...]);

  const isActive = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 150) + "px";
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
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Mobile Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-semibold truncate max-w-[120px]">
            {session.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:bg-primary/10 transition-colors"
            onClick={handleManualSync}
            disabled={isSyncing}
          >
            <RefreshCw className={cn("size-4 text-muted-foreground", isSyncing && "animate-spin text-primary")} />
          </Button>
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground bg-accent/50 px-2 py-1 rounded">
            Remote
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-full space-y-4">
          {messages.map((message, index) => (
            <div key={index} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {message.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 text-sm shadow-sm max-w-[85%]">
                     {message.parts.filter(p => p.type === 'text').map((p: any) => p.text).join('')}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                   <MessageUI
                      parts={message.parts}
                      addToolApprovalResponse={addToolApprovalResponse}
                    />
                </div>
              )}
            </div>
          ))}
          
          {isActive && (
            <div className="flex gap-1 items-center py-2">
              <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <span className="size-1.5 rounded-full bg-primary animate-bounce" />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background/80 backdrop-blur-lg border-t pb-safe">
        <div className="flex items-end gap-2 bg-card border rounded-2xl p-2 shadow-sm focus-within:ring-1 ring-primary/20 transition-all">
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
            placeholder="Edit from mobile..."
            className="flex-1 bg-transparent resize-none outline-none text-[15px] p-2 placeholder:text-muted-foreground/50 min-h-[40px] max-h-[150px]"
          />
          <Button
            size="icon"
            onClick={isActive ? stop : handleSend}
            disabled={!isActive && !input.trim()}
            className="rounded-xl shrink-0 h-10 w-10 transition-transform active:scale-95"
          >
            {isActive ? (
              <Square className="size-4 fill-current" />
            ) : (
              <ArrowUp className="size-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
