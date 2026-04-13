"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import {
  Code,
  FileDiff as FileDiffIcon,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { useQueryState } from "nuqs";
import ChatSidebar from "@/components/chat-sidebar";
import ChatInput from "@/components/chat-input";
import CommitButton from "@/components/commit-button";
import FileTreeBar from "@/components/file-tree";
import { FileViewer } from "@/components/file-viewer";
import Loader from "@/components/loader";
import MessageUI from "@/components/message";
import SessionDiffDrawer, {
  type SessionFileDiff,
} from "@/components/session-diff-drawer";
import { Button } from "@/components/ui/button";
import { getTitleFromMessages } from "@/lib/utils";
import { api } from "@/lib/eden";
import { useQuery } from "@tanstack/react-query";

const MemoMessageUI = memo(MessageUI);

function buildSessionDiffs(messages: UIMessage[]): SessionFileDiff[] {
  const byPath = new Map<string, SessionFileDiff>();
  let cursor = 0;

  for (const message of messages) {
    if (!Array.isArray(message.parts)) continue;

    for (const part of message.parts as Array<Record<string, unknown>>) {
      cursor += 1;

      if (part.type !== "tool-write" || part.state !== "output-available") {
        continue;
      }

      const output = part.output;
      if (!output || typeof output !== "object") continue;

      const out = output as Record<string, unknown>;
      const filePath =
        typeof out.filePath === "string" && out.filePath.trim().length > 0
          ? out.filePath
          : undefined;
      const patch = typeof out.patch === "string" ? out.patch : undefined;
      const additions =
        typeof out.patchAdditions === "number" ? out.patchAdditions : 0;
      const deletions =
        typeof out.patchDeletions === "number" ? out.patchDeletions : 0;
      const action = out.action === "created" ? "created" : "edited";

      if (!filePath || !patch) continue;

      const existing = byPath.get(filePath);

      if (!existing) {
        byPath.set(filePath, {
          filePath,
          patch,
          edits: 1,
          action,
          additions,
          deletions,
          updatedAt: cursor,
        });
        continue;
      }

      byPath.set(filePath, {
        ...existing,
        patch,
        edits: existing.edits + 1,
        additions,
        deletions,
        updatedAt: cursor,
      });
    }
  }

  return [...byPath.values()];
}

export default function Page() {
  return (
    <Suspense fallback={<div className="h-screen bg-background" />}>
      <ChatPage />
    </Suspense>
  );
}

function ChatPage() {
  const [session] = useQueryState("s");
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [isFileBarOpen, setIsFileBarOpen] = useState(true);
  const [isSessionDiffDrawerOpen, setIsSessionDiffDrawerOpen] = useState(false);
  const [selectedSessionDiffPath, setSelectedSessionDiffPath] = useState<
    string | undefined
  >();
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { isLoading: isSessionLoading } = useQuery({
    queryKey: ["session", session],
    queryFn: async () => {
      if (!session) return null;
      const res = await fetch(`/api/store/${session}`);
      const data = await res.json();
      setWorkspace(data.workspace);
      return data.messages;
    },
    enabled: Boolean(session),
  });

  const { messages, sendMessage, status, addToolApprovalResponse, stop } =
    useChat<UIMessage>({
      id: session ?? undefined,
      messages: [],
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: {
          path: workspace,
          sessionId: session,
        },
      }),
      onData: () => {},
      onFinish: async () => {
        if (!session || !workspace) {
          return;
        }

        await api.store.post({
          id: session,
          workspace: workspace,
          messages: messages,
        });
      },
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const isActive = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isActive]);

  async function handleSend(value: string) {
    if (!value || isActive || !workspace || !session) {
      return;
    }

    await sendMessage({
      text: value,
    });
  }

  const currentSessionTitle = useMemo(() => {
    if (!session) return "Select a session";
    return getTitleFromMessages(messages);
  }, [messages, session]);

  const renderedMessages = useMemo(
    () =>
      messages.map((message, index) => (
        <div key={message.id || index}>
          {message.role === "user" ? (
            <div className="flex justify-end py-2">
              <div className="max-w-[85%] rounded-2xl rounded-br-md border border-primary/25 bg-primary/12 px-4 py-2.5 shadow-sm">
                {message.parts.map((part, partIndex) => {
                  if (part.type !== "text") return null;

                  return (
                    <p
                      key={partIndex}
                      className="whitespace-pre-wrap text-sm leading-relaxed">
                      {part.text}
                    </p>
                  );
                })}
              </div>
            </div>
          ) : (
            <MemoMessageUI
              parts={message.parts}
              addToolApprovalResponseAction={addToolApprovalResponse}
              onFileClickAction={setSelectedFile}
              onWriteDiffOpenAction={(filePath) => {
                setSelectedSessionDiffPath(filePath);
                setIsSessionDiffDrawerOpen(true);
              }}
            />
          )}
        </div>
      )),
    [addToolApprovalResponse, messages],
  );

  const sessionDiffs = useMemo(() => buildSessionDiffs(messages), [messages]);

  // for diffs
  useEffect(() => {
    if (sessionDiffs.length === 0) {
      setSelectedSessionDiffPath(undefined);
      return;
    }

    if (
      selectedSessionDiffPath &&
      sessionDiffs.some((diff) => diff.filePath === selectedSessionDiffPath)
    ) {
      return;
    }

    setSelectedSessionDiffPath(sessionDiffs[0]?.filePath);
  }, [selectedSessionDiffPath, sessionDiffs]);

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0" />
      <ChatSidebar />

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <section className="relative flex min-w-0 flex-1 flex-col select-none">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/95 px-3 py-2">
              <div className="min-w-0 space-y-0.5">
                <div className="truncate text-sm font-medium">
                  {currentSessionTitle}
                </div>
              </div>

              <div className="flex items-center gap-1 rounded-md">
                <CommitButton
                  workspacePath={workspace ?? ""}
                  isBusy={isActive}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title="Toggle session diffs"
                  className="h-8 gap-1.5 px-2"
                  onClick={() => setIsSessionDiffDrawerOpen((prev) => !prev)}
                  disabled={sessionDiffs.length === 0}>
                  <FileDiffIcon className="size-3.5" />
                  <span className="text-xs">Diffs</span>
                  <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {sessionDiffs.length}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="Toggle file tree"
                  aria-label="Toggle file tree"
                  onClick={() => setIsFileBarOpen((prev) => !prev)}>
                  {isFileBarOpen ? (
                    <PanelRightClose className="size-4" />
                  ) : (
                    <PanelRightOpen className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div
                  ref={scrollRef}
                  className="relative flex-1 overflow-y-auto px-4 py-6">
                  {isSessionLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="w-full max-w-md text-center flex flex-col items-center justify-center gap-4">
                        <Code className="size-10 text-primary" />
                        <div className="space-y-1">
                          <h1 className="text-xl font-semibold">Lets build</h1>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mx-auto w-full max-w-4xl space-y-1 select-text">
                      {renderedMessages}

                      {isActive && <Loader />}
                    </div>
                  )}
                </div>

                <div className="bg-background/85 p-2 pt-0">
                  <ChatInput
                    onSend={handleSend}
                    isActive={isActive || isSessionLoading}
                    isDisabled={!session}
                    stop={stop}
                  />
                </div>
              </div>
              <FileTreeBar rootPath={workspace} isOpen={isFileBarOpen} />
            </div>
          </section>
        </div>
      </main>

      <SessionDiffDrawer
        isOpen={isSessionDiffDrawerOpen}
        diffs={sessionDiffs}
        selectedFilePath={selectedSessionDiffPath}
        onClose={() => setIsSessionDiffDrawerOpen(false)}
        onSelectFile={setSelectedSessionDiffPath}
      />

      {selectedFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <button
            type="button"
            aria-label="Close file viewer"
            className="absolute inset-0"
            onClick={() => setSelectedFile(undefined)}
          />
          <div className="relative z-10 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-6xl">
            <FileViewer
              filePath={selectedFile}
              onClose={() => setSelectedFile(undefined)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
