"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, Code, Folder, Save, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import MessageUI from "@/components/message";
import { FileViewer } from "@/components/file-viewer";
import ChatsBar from "@/components/chats-bar";
import FileBar from "@/components/file-bar";
import { useChatStore, type ChatMessage } from "@/lib/chat-store";
import ChatInput from "@/components/chat-input";
import Loader from "@/components/loader";

function toStoredMessages(messages: UIMessage[]): ChatMessage[] {
  return messages.map((message, index) => {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    return {
      id: message.id || `message-${index}`,
      role: message.role === "assistant" ? "assistant" : "user",
      content: text,
      timestamp: Date.now() + index,
    };
  });
}

function toUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.content
      ? [
          {
            type: "text" as const,
            text: message.content,
          },
        ]
      : [],
  }));
}

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    sessions,
    currentSession,
    isLoaded,
    createSession,
    selectSession,
    setMessagesForSession,
    saveSessionPayload,
    deleteSession,
  } = useChatStore();

  const requestedChatId = searchParams.get("chat");
  const workspacePath = currentSession?.path ?? "";

  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [showFilePane, setShowFilePane] = useState(true);
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedSessionIdRef = useRef<string | null>(null);

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
        path: workspacePath,
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const isActive = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (!isLoaded) return;

    if (requestedChatId) {
      const targetSession = sessions.find(
        (session) => session.id === requestedChatId,
      );

      if (targetSession) {
        if (currentSession?.id !== targetSession.id) {
          selectSession(targetSession.id);
        }
        return;
      }
    }

    if (!currentSession && sessions.length > 0) {
      const nextSession = sessions[0];
      selectSession(nextSession.id);
      router.replace(`/?chat=${nextSession.id}`);
    }
  }, [
    currentSession,
    isLoaded,
    requestedChatId,
    router,
    selectSession,
    sessions,
  ]);

  useEffect(() => {
    const sessionId = currentSession?.id ?? null;

    if (lastSyncedSessionIdRef.current === sessionId) return;

    lastSyncedSessionIdRef.current = sessionId;
    setMessages(currentSession ? toUIMessages(currentSession.messages) : []);
  }, [currentSession, setMessages]);

  useEffect(() => {
    if (!currentSession) return;
    setMessagesForSession(currentSession.id, toStoredMessages(messages));
  }, [currentSession, messages, setMessagesForSession]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isActive]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      200,
    )}px`;
  }, [input]);

  const currentChatLabel = useMemo(() => {
    if (!currentSession) return "No chat selected";
    return `${currentSession.name} · ${currentSession.path}`;
  }, [currentSession]);

  function handleCreateChat(path?: string) {
    const basePath =
      path ||
      currentSession?.path ||
      sessions[0]?.path ||
      "/home/thetanav/Code/project/edit";

    const session = createSession(basePath);
    setSelectedFile(undefined);
    setMessages([]);
    router.push(`/?chat=${session.id}`);
  }

  function handleOpenSession(sessionId: string) {
    selectSession(sessionId);
    setSelectedFile(undefined);
    router.push(`/?chat=${sessionId}`);
  }

  async function handleSaveHistory() {
    if (!currentSession) return;

    setIsSavingHistory(true);
    try {
      await saveSessionPayload({
        ...currentSession,
        messages: toStoredMessages(messages),
        updatedAt: Date.now(),
      });
    } finally {
      setIsSavingHistory(false);
    }
  }

  async function handleSend() {
    const value = input.trim();
    if (!value || isActive || !workspacePath) return;

    if (!currentSession) {
      const created = createSession("/home/thetanav/Code/project/edit");
      router.push(`/?chat=${created.id}`);
      return;
    }

    setInput("");
    await sendMessage({
      text: value,
    });
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ChatsBar
        workspacePath={workspacePath}
        onCreateChat={handleCreateChat}
        onOpenSession={(sessionId) => {
          handleOpenSession(sessionId);
        }}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 min-h-0 flex">
          <section className="flex-1 min-w-0 flex flex-col relative select-none">
            <div className="border-b px-3 py-2 flex items-center justify-between gap-2 bg-background/80 backdrop-blur-sm">
              <div className="text-[11px] text-muted-foreground truncate">
                {currentChatLabel}
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-6 relative"
            >
              {/*{selectedFile && (
                <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-sm p-4">
                  <FileViewer
                    filePath={selectedFile}
                    onClose={() => setSelectedFile(undefined)}
                  />
                </div>
              )}*/}

              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="mx-auto size-14 rounded-2xl border bg-card flex items-center justify-center">
                      <Code className="size-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h1 className="text-xl font-semibold">
                        What do you want to build?
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        Start a chat for the current workspace and I&apos;ll
                        help you edit code.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-1">
                  {messages.map((message, index) => (
                    <div key={message.id || index}>
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
                          <MessageUI
                            parts={message.parts}
                            addToolApprovalResponseAction={
                              addToolApprovalResponse
                            }
                            onFileClickAction={setSelectedFile}
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  {isActive && <Loader />}
                </div>
              )}
            </div>

            <div className="bg-background p-2">
              <ChatInput
                textareaRef={textareaRef}
                input={input}
                setInput={setInput}
                handleSend={handleSend}
                isActive={isActive}
              />
            </div>
          </section>

          {/*{showFilePane && (
            <FileBar
              rootPath={workspacePath}
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
            />
          )}*/}
        </div>
      </main>
    </div>
  );
}
