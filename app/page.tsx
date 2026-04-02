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
  FolderOpen,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import {
  memo,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { nanoid } from "nanoid";
import { useQueryState } from "nuqs";
import ChatSidebar, {
  type ChatSessionSummary,
} from "@/components/chat-sidebar";
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
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getTitleFromMessages } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const WORKSPACE_STORAGE_KEY = "edit.workspace-path";
const WORKSPACE_RECENTS_STORAGE_KEY = "edit.workspace-recents";
const MAX_RECENT_WORKSPACES = 6;

function getRecentWorkspaces(): string[] {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function pushRecentWorkspace(nextPath: string): string[] {
  const normalizedPath = nextPath.trim();
  if (!normalizedPath) return getRecentWorkspaces();

  const deduped = [
    normalizedPath,
    ...getRecentWorkspaces().filter((path) => path !== normalizedPath),
  ].slice(0, MAX_RECENT_WORKSPACES);

  window.localStorage.setItem(
    WORKSPACE_RECENTS_STORAGE_KEY,
    JSON.stringify(deduped),
  );

  return deduped;
}

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

export default function ChatPage() {
  const [workspacePath, setWorkspacePath] = useState("");
  const [draftWorkspacePath, setDraftWorkspacePath] = useState("");
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [isWorkspaceReady, setIsWorkspaceReady] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isValidatingWorkspace, setIsValidatingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    const savedPath = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "";
    setWorkspacePath(savedPath);
    setDraftWorkspacePath(savedPath);
    setRecentWorkspaces(getRecentWorkspaces());
    setIsWorkspaceReady(Boolean(savedPath));
    setIsWorkspaceLoading(false);
  }, []);

  async function handleWorkspaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextPath = draftWorkspacePath.trim();
    if (!nextPath || isValidatingWorkspace) return;

    setIsValidatingWorkspace(true);
    setWorkspaceError(null);

    try {
      const response = await fetch(
        `/api/files?path=${encodeURIComponent(nextPath)}`,
      );
      const data = (await response.json()) as { error?: string; type?: string };

      if (!response.ok) {
        throw new Error(data.error || "Failed to open workspace");
      }

      if (data.type !== "directory") {
        throw new Error("Workspace path must point to a directory");
      }

      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, nextPath);
      setRecentWorkspaces(pushRecentWorkspace(nextPath));
      setWorkspacePath(nextPath);
      setIsWorkspaceReady(true);
    } catch (error) {
      setWorkspaceError(
        error instanceof Error ? error.message : "Failed to open workspace",
      );
      setIsWorkspaceReady(false);
    } finally {
      setIsValidatingWorkspace(false);
    }
  }

  function handleWorkspaceReset() {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    setWorkspacePath("");
    setDraftWorkspacePath("");
    setPendingSessionId(null);
    setWorkspaceError(null);
    setIsWorkspaceReady(false);
  }

  const handleOpenWorkspaceChat = useCallback(
    (nextWorkspacePath: string, sessionId: string) => {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, nextWorkspacePath);
      setRecentWorkspaces(pushRecentWorkspace(nextWorkspacePath));
      setWorkspacePath(nextWorkspacePath);
      setDraftWorkspacePath(nextWorkspacePath);
      setWorkspaceError(null);
      setIsWorkspaceReady(true);
      setPendingSessionId(sessionId);
    },
    [],
  );

  const handleInitialSessionApplied = useCallback(() => {
    setPendingSessionId(null);
  }, []);

  if (isWorkspaceLoading) {
    return (
      <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.12),transparent_55%)]" />
        <Loader2 className="relative z-10 size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isWorkspaceReady || !workspacePath) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(120,120,120,0.12),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(90,90,90,0.08),transparent_35%)]" />

        <Card className="relative z-10 w-full max-w-xl gap-0 border-border/70 bg-card/95 shadow-xl backdrop-blur">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl">Open workspace</CardTitle>
            <p className="text-sm text-muted-foreground">
              Pick a project folder to start chatting and editing files.
            </p>
          </CardHeader>

          <form onSubmit={handleWorkspaceSubmit}>
            <CardContent>
              <div className="space-y-3">
                <Input
                  autoFocus
                  className="h-11"
                  value={draftWorkspacePath}
                  onChange={(event) => {
                    setDraftWorkspacePath(event.target.value);
                    if (workspaceError) setWorkspaceError(null);
                  }}
                  placeholder="/absolute/path/to/project"
                />
                {workspaceError ? (
                  <p className="text-sm text-destructive">{workspaceError}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Example: `/home/thetanav/c/p/edit`
                  </p>
                )}

                {recentWorkspaces.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Recent workspaces</p>
                    <div className="flex flex-wrap gap-1.5">
                      {recentWorkspaces.map((path) => (
                        <Button
                          key={path}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="max-w-full"
                          onClick={() => {
                            setDraftWorkspacePath(path);
                            setWorkspaceError(null);
                          }}>
                          <span className="truncate">{path}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>

            <CardFooter className="justify-end gap-2">
              <Button
                type="submit"
                className="h-9 px-4"
                disabled={!draftWorkspacePath.trim() || isValidatingWorkspace}>
                {isValidatingWorkspace ? "Opening..." : "Open workspace"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <WorkspaceChat
      key={workspacePath}
      workspacePath={workspacePath}
      recentWorkspaces={recentWorkspaces}
      initialSessionId={pendingSessionId}
      onOpenWorkspaceChat={handleOpenWorkspaceChat}
      onInitialSessionApplied={handleInitialSessionApplied}
      onChangeWorkspaceAction={handleWorkspaceReset}
    />
  );
}

function WorkspaceChat({
  workspacePath,
  recentWorkspaces,
  initialSessionId,
  onOpenWorkspaceChat,
  onInitialSessionApplied,
  onChangeWorkspaceAction,
}: {
  workspacePath: string;
  recentWorkspaces: string[];
  initialSessionId: string | null;
  onOpenWorkspaceChat: (workspacePath: string, sessionId: string) => void;
  onInitialSessionApplied: () => void;
  onChangeWorkspaceAction: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [session, setSession] = useQueryState("s");
  const [hydratedMessages, setHydratedMessages] = useState<UIMessage[] | null>(
    null,
  );
  const [isHydratingSession, setIsHydratingSession] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatWorkspacePath, setNewChatWorkspacePath] = useState("");
  const [newChatWorkspaceError, setNewChatWorkspaceError] = useState<
    string | null
  >(null);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [isFileBarOpen, setIsFileBarOpen] = useState(true);
  const [isSessionDiffDrawerOpen, setIsSessionDiffDrawerOpen] = useState(false);
  const [selectedSessionDiffPath, setSelectedSessionDiffPath] = useState<
    string | undefined
  >();

  const scrollRef = useRef<HTMLDivElement>(null);

  const persistMessages = useCallback(
    async (nextMessages: UIMessage[]) => {
      if (!session || !workspacePath) return;

      await fetch("/api/store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: session,
          workspace: workspacePath,
          messages: nextMessages,
        }),
      });

      const nextTitle = getTitleFromMessages(nextMessages);
      const now = Date.now();

      setChatSessions((current) => {
        const existingIndex = current.findIndex(
          (chat) => chat.id === session && chat.workspacePath === workspacePath,
        );

        if (existingIndex === -1) {
          return [
            {
              id: session,
              workspacePath,
              title: nextTitle,
              createdAt: now,
              updatedAt: now,
            },
            ...current,
          ];
        }

        const next = [...current];
        next[existingIndex] = {
          ...next[existingIndex],
          workspacePath,
          title: nextTitle,
          updatedAt: now,
        };
        return next;
      });
    },
    [session, workspacePath],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    addToolApprovalResponse,
    stop,
  } = useChat<UIMessage>({
    id: session ?? undefined,
    messages: [],
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        path: workspacePath,
        sessionId: session,
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const isActive = status === "streaming" || status === "submitted";
  const isSessionLoading =
    !session || isHydratingSession || hydratedMessages === null;

  useEffect(() => {
    if (!session) {
      void setSession(nanoid());
    }
  }, [session, setSession]);

  useEffect(() => {
    if (!initialSessionId) return;

    if (session === initialSessionId) {
      onInitialSessionApplied();
      return;
    }

    void setSession(initialSessionId);
  }, [initialSessionId, onInitialSessionApplied, session, setSession]);

  useEffect(() => {
    if (!session || !workspacePath) return;

    const sessionId = session;

    let cancelled = false;

    async function hydrateSession() {
      setIsHydratingSession(true);
      setHydratedMessages(null);

      try {
        const response = await fetch(
          `/api/store/${encodeURIComponent(sessionId)}`,
        );

        if (!response.ok) {
          throw new Error("Failed to load chat session");
        }

        const data = (await response.json()) as {
          messages?: UIMessage[] | string;
        } | null;

        let parsedMessages: UIMessage[] = [];

        if (data && Array.isArray(data.messages)) {
          parsedMessages = data.messages;
        } else if (data && typeof data.messages === "string") {
          try {
            const decoded = JSON.parse(data.messages) as unknown;
            if (Array.isArray(decoded)) {
              parsedMessages = decoded as UIMessage[];
            }
          } catch {
            parsedMessages = [];
          }
        }

        if (!cancelled) {
          setHydratedMessages(parsedMessages);
        }
      } catch {
        if (!cancelled) {
          setHydratedMessages([]);
        }
      } finally {
        if (!cancelled) {
          setIsHydratingSession(false);
        }
      }
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [session, workspacePath]);

  useEffect(() => {
    if (hydratedMessages === null) return;

    setMessages(hydratedMessages);
  }, [hydratedMessages, setMessages]);

  useEffect(() => {
    if (isSessionLoading || status !== "ready") return;

    void persistMessages(messages);
  }, [isSessionLoading, messages, persistMessages, status]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isActive]);

  useEffect(() => {
    if (!selectedFile) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedFile(undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedFile]);

  async function handleSend(value: string) {
    if (!value || isActive || !workspacePath || isSessionLoading) return;

    await sendMessage({
      text: value,
    });
  }

  const currentSessionTitle = useMemo(() => {
    if (!session) return "New chat";

    const activeChat = chatSessions.find((chat) => chat.id === session);
    const savedTitle = activeChat?.title?.trim();

    if (savedTitle) return savedTitle;

    return getTitleFromMessages(messages);
  }, [chatSessions, messages, session]);

  const sessionDiffs = useMemo(() => buildSessionDiffs(messages), [messages]);

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

  function handleNewChat(nextWorkspacePath?: string) {
    setNewChatWorkspacePath(nextWorkspacePath ?? workspacePath);
    setNewChatWorkspaceError(null);
    setIsNewChatModalOpen(true);
  }

  function handleCloseNewChatModal() {
    if (isCreatingNewChat) return;
    setIsNewChatModalOpen(false);
    setNewChatWorkspaceError(null);
  }

  async function handleCreateNewChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextWorkspacePath = newChatWorkspacePath.trim();
    if (!nextWorkspacePath || isCreatingNewChat) return;

    setIsCreatingNewChat(true);
    setNewChatWorkspaceError(null);

    try {
      const response = await fetch(
        `/api/files?path=${encodeURIComponent(nextWorkspacePath)}`,
      );
      const data = (await response.json()) as {
        error?: string;
        type?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to open workspace");
      }

      if (data.type !== "directory") {
        throw new Error("Workspace path must point to a directory");
      }

      setSelectedFile(undefined);
      setHydratedMessages([]);
      setMessages([]);
      setIsSessionDiffDrawerOpen(false);
      setSelectedSessionDiffPath(undefined);

      const nextSessionId = nanoid();
      onOpenWorkspaceChat(nextWorkspacePath, nextSessionId);

      setIsNewChatModalOpen(false);
      setNewChatWorkspaceError(null);
    } catch (error) {
      setNewChatWorkspaceError(
        error instanceof Error ? error.message : "Failed to open workspace",
      );
    } finally {
      setIsCreatingNewChat(false);
    }
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0" />
      <ChatSidebar onNewChat={handleNewChat} />

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
                <CommitButton workspacePath={workspacePath} isBusy={isActive} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Change workspace"
                      onClick={onChangeWorkspaceAction}>
                      <FolderOpen className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Change workspace</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2"
                      onClick={() => setIsSessionDiffDrawerOpen((prev) => !prev)}
                      disabled={sessionDiffs.length === 0}>
                      <FileDiffIcon className="size-3.5" />
                      <span className="text-xs">Diffs</span>
                      <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {sessionDiffs.length}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle session diffs</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Toggle file tree"
                      onClick={() => setIsFileBarOpen((prev) => !prev)}>
                      {isFileBarOpen ? (
                        <PanelRightClose className="size-4" />
                      ) : (
                        <PanelRightOpen className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle file tree</TooltipContent>
                </Tooltip>
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
                      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border/70 bg-card/70 p-8 text-center shadow-sm backdrop-blur-sm">
                        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-card">
                          <Code className="size-6 text-primary" />
                        </div>
                        <div className="space-y-1">
                          <h1 className="text-xl font-semibold">
                            What do you want to build?
                          </h1>
                          <p className="text-sm text-muted-foreground">
                            Start a chat for this workspace and I&apos;ll help
                            you edit code.
                          </p>
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
                    stop={stop}
                  />
                </div>
              </div>
              <FileTreeBar
                rootPath={workspacePath}
                selectedFile={selectedFile}
                isOpen={isFileBarOpen}
                onFileSelect={setSelectedFile}
              />
            </div>
          </section>
        </div>
      </main>

      {selectedFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <button
            type="button"
            aria-label="Close file viewer"
            className="absolute inset-0"
            onClick={() => setSelectedFile(undefined)}
          />

          <div className="relative z-10 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-400">
            <FileViewer
              filePath={selectedFile}
              onClose={() => setSelectedFile(undefined)}
            />
          </div>
        </div>
      ) : null}

      <SessionDiffDrawer
        isOpen={isSessionDiffDrawerOpen}
        diffs={sessionDiffs}
        selectedFilePath={selectedSessionDiffPath}
        onClose={() => setIsSessionDiffDrawerOpen(false)}
        onSelectFile={setSelectedSessionDiffPath}
      />

      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <button
            type="button"
            aria-label="Close new chat modal"
            className="absolute inset-0"
            onClick={handleCloseNewChatModal}
          />

          <Card className="relative z-10 w-full max-w-lg gap-0 border-border/70 shadow-xl">
            <CardHeader>
              <CardTitle>New chat workspace</CardTitle>
            </CardHeader>

            <form onSubmit={handleCreateNewChat}>
              <CardContent>
                <div className="space-y-3">
                  <Input
                    autoFocus
                    value={newChatWorkspacePath}
                    onChange={(event) => {
                      setNewChatWorkspacePath(event.target.value);
                      if (newChatWorkspaceError) setNewChatWorkspaceError(null);
                    }}
                    placeholder="/absolute/path/to/project"
                  />
                  {newChatWorkspaceError ? (
                    <p className="text-sm text-destructive">
                      {newChatWorkspaceError}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Choose where the new chat should run.
                    </p>
                  )}
                  {recentWorkspaces.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Recent workspaces</p>
                      <div className="flex flex-wrap gap-1.5">
                        {recentWorkspaces.map((path) => (
                          <Button
                            key={path}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="max-w-full"
                            onClick={() => {
                              setNewChatWorkspacePath(path);
                              setNewChatWorkspaceError(null);
                            }}>
                            <span className="truncate">{path}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>

              <CardFooter className="justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseNewChatModal}
                  disabled={isCreatingNewChat}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!newChatWorkspacePath.trim() || isCreatingNewChat}>
                  {isCreatingNewChat ? "Creating..." : "Create chat"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
