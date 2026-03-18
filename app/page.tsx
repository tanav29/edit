"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Code } from "lucide-react";

import MessageUI from "@/components/message";
import ChatsBar from "@/components/chats-bar";
import FileBar from "@/components/file-bar";
import ChatInput from "@/components/chat-input";
import Loader from "@/components/loader";
import type { ChatMessage, ChatSession } from "@/lib/chat-types";

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

function sortSessionsByUpdatedAt(sessions: ChatSession[]) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

function makeSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function requestJSON<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const message = await response.text().catch(() => "Request failed");
    throw new Error(message || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedChatId = searchParams.get("chat");

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [showFilePane] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedSessionIdRef = useRef<string | null>(null);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) || null,
    [currentSessionId, sessions],
  );

  const workspacePath = currentSession?.path ?? "";

  async function refreshSessions() {
    const nextSessions = sortSessionsByUpdatedAt(
      await requestJSON<ChatSession[]>("/api/history"),
    );

    setSessions(nextSessions);
    setCurrentSessionId((prev) => {
      if (prev && nextSessions.some((session) => session.id === prev)) {
        return prev;
      }

      return nextSessions[0]?.id ?? null;
    });

    return nextSessions;
  }

  async function saveSessionPayload(session: ChatSession) {
    const normalizedSession: ChatSession = {
      ...session,
      messages: [...session.messages],
      updatedAt: session.updatedAt || Date.now(),
    };

    setSessions((prev) => {
      const exists = prev.some((item) => item.id === normalizedSession.id);
      const next = exists
        ? prev.map((item) =>
            item.id === normalizedSession.id ? normalizedSession : item,
          )
        : [normalizedSession, ...prev];

      return sortSessionsByUpdatedAt(next);
    });

    await requestJSON<{ success: boolean }>("/api/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(normalizedSession),
    });
  }

  async function createSession(
    workspacePathValue: string,
    name?: string,
  ): Promise<ChatSession> {
    const existingForPath = sessions.filter(
      (session) => session.path === workspacePathValue,
    );
    const now = Date.now();

    const newSession: ChatSession = {
      id: makeSessionId(),
      name: name || `Chat ${existingForPath.length + 1}`,
      path: workspacePathValue,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    setSessions((prev) => sortSessionsByUpdatedAt([newSession, ...prev]));
    setCurrentSessionId(newSession.id);

    try {
      await requestJSON<{ success: boolean }>("/api/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newSession),
      });
    } catch (error) {
      console.error("Failed to create session:", error);
    }

    return newSession;
  }

  function selectSession(id: string) {
    setCurrentSessionId(id);
  }

  async function deleteSession(id: string) {
    const session = sessions.find((item) => item.id === id);
    if (!session) return;

    setSessions((prev) => {
      const next = prev.filter((item) => item.id !== id);

      if (currentSessionId === id) {
        setCurrentSessionId(next[0]?.id ?? null);
      }

      return next;
    });

    try {
      await requestJSON<{ success: boolean }>("/api/history", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionPath: session.path,
          sessionId: session.id,
        }),
      });
    } catch (error) {
      console.error("Failed to delete session:", error);
      await refreshSessions().catch((refreshError) =>
        console.error(
          "Failed to refresh sessions after delete error:",
          refreshError,
        ),
      );
    }
  }

  function setMessagesForSession(sessionId: string, messages: ChatMessage[]) {
    setSessions((prev) => {
      let updated = false;

      const next = prev.map((session) => {
        if (session.id !== sessionId) return session;

        updated = true;
        return {
          ...session,
          messages,
          updatedAt: Date.now(),
        };
      });

      return updated ? sortSessionsByUpdatedAt(next) : prev;
    });
  }

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
        sessionId: currentSession?.id,
        sessionName: currentSession?.name,
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const isActive = status === "streaming" || status === "submitted";

  useEffect(() => {
    async function loadSessions() {
      try {
        await refreshSessions();
      } catch (error) {
        console.error("Failed to load sessions:", error);
      } finally {
        setIsLoaded(true);
      }
    }

    void loadSessions();
  }, []);

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
  }, [currentSession, isLoaded, requestedChatId, router, sessions]);

  useEffect(() => {
    const sessionId = currentSession?.id ?? null;

    if (lastSyncedSessionIdRef.current === sessionId) return;

    lastSyncedSessionIdRef.current = sessionId;
    setMessages(currentSession ? toUIMessages(currentSession.messages) : []);
  }, [currentSession, setMessages]);

  useEffect(() => {
    if (!currentSession || isActive) return;
    setMessagesForSession(currentSession.id, toStoredMessages(messages));
  }, [currentSession, isActive, messages]);

  useEffect(() => {
    if (!currentSession || isActive || messages.length === 0) return;

    void saveSessionPayload({
      ...currentSession,
      messages: toStoredMessages(messages),
      updatedAt: Date.now(),
    }).catch((error) => {
      console.error("Failed to save session:", error);
    });
  }, [currentSession, isActive, messages]);

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

  async function handleCreateChat(path?: string) {
    const basePath =
      path ||
      currentSession?.path ||
      sessions[0]?.path ||
      "/home/thetanav/Code/project/edit";

    const session = await createSession(basePath);
    setSelectedFile(undefined);
    setMessages([]);
    router.push(`/?chat=${session.id}`);
  }

  async function handleCreateFolder(path: string) {
    const session = await createSession(path);
    return session;
  }

  function handleOpenSession(sessionId: string) {
    selectSession(sessionId);
    setSelectedFile(undefined);
    router.push(`/?chat=${sessionId}`);
  }

  async function handleSend() {
    const value = input.trim();
    if (!value || isActive || !workspacePath) return;

    if (!currentSession) {
      const created = await createSession("/home/thetanav/Code/project/edit");
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
        sessions={sessions}
        currentSessionId={currentSession?.id ?? null}
        onCreateChatAction={(path) => {
          void handleCreateChat(path);
        }}
        onCreateFolderAction={handleCreateFolder}
        onOpenSessionAction={(sessionId) => {
          handleOpenSession(sessionId);
        }}
        onDeleteSessionAction={(sessionId) => {
          void deleteSession(sessionId);
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
                <div className="max-w-3xl mx-auto space-y-1 select-text">
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
                        <MessageUI
                          parts={message.parts}
                          addToolApprovalResponseAction={
                            addToolApprovalResponse
                          }
                          onFileClickAction={setSelectedFile}
                        />
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
                stop={stop}
              />
            </div>
          </section>

          {showFilePane && (
            <FileBar
              rootPath={workspacePath}
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
            />
          )}
        </div>
      </main>
    </div>
  );
}
