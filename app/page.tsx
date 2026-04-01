"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { Code, Loader2, PencilLine } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { nanoid } from "nanoid";
import { useQueryState } from "nuqs";
import ChatInput from "@/components/chat-input";
import CommitButton from "@/components/commit-button";
import FileBar from "@/components/file-bar";
import { FileViewer } from "@/components/file-viewer";
import Loader from "@/components/loader";
import MessageUI from "@/components/message";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const WORKSPACE_STORAGE_KEY = "edit.workspace-path";

export default function ChatPage() {
  const [workspacePath, setWorkspacePath] = useState("");
  const [draftWorkspacePath, setDraftWorkspacePath] = useState("");
  const [isWorkspaceReady, setIsWorkspaceReady] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isValidatingWorkspace, setIsValidatingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    const savedPath = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "";
    setWorkspacePath(savedPath);
    setDraftWorkspacePath(savedPath);
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
    setWorkspaceError(null);
    setIsWorkspaceReady(false);
  }

  if (isWorkspaceLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isWorkspaceReady || !workspacePath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <Card className="w-full max-w-lg gap-0">
          <CardHeader>
            <CardTitle>Choose a workspace</CardTitle>
          </CardHeader>

          <form onSubmit={handleWorkspaceSubmit}>
            <CardContent>
              <div className="space-y-3">
                <Input
                  autoFocus
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
              </div>
            </CardContent>

            <CardFooter className="justify-end gap-2">
              <Button
                type="submit"
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
      onChangeWorkspace={handleWorkspaceReset}
    />
  );
}

function WorkspaceChat({
  workspacePath,
  onChangeWorkspace,
}: {
  workspacePath: string;
  onChangeWorkspace: () => void;
}) {
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [session, setSession] = useQueryState("s");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, addToolApprovalResponse, stop } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: {
          path: workspacePath,
        },
      }),
      onFinish: () => {
        // save to sqlite
        console.log(messages);
      },
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const isActive = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (!session) {
      setSession(nanoid());
    } else {
      console.log("session:", session);
      console.log("load previous messages for this session from sqlite");
    }
  }, []);

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

  async function handleSend() {
    const value = input.trim();
    if (!value || isActive || !workspacePath) return;

    setInput("");
    await sendMessage({
      text: value,
    });
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <section className="relative flex min-w-0 flex-1 flex-col select-none">
            <div className="flex items-center justify-between gap-3 border-b bg-background/80 px-3 py-2 backdrop-blur-sm">
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground">
                  Workspace
                </div>
                <div className="truncate text-xs">{workspacePath}</div>
              </div>

              <div className="flex gap-1">
                <CommitButton workspacePath={workspacePath} isBusy={isActive} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onChangeWorkspace}
                  disabled={isActive}>
                  <PencilLine className="size-4" />
                  Change
                </Button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="relative flex-1 overflow-y-auto px-4 py-6">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="space-y-3 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-card">
                      <Code className="size-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h1 className="text-xl font-semibold">
                        What do you want to build?
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        Start a chat for this workspace and I&apos;ll help you
                        edit code.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-5xl space-y-1 select-text">
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
                                  className="whitespace-pre-wrap text-sm leading-relaxed">
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

          <FileBar
            rootPath={workspacePath}
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
          />
        </div>
      </main>

      {selectedFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
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
    </div>
  );
}
