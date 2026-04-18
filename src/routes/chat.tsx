import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import {
  Code,
  Copy,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { memo, useEffect, useReducer, useRef, useState } from "react";

import ChatSidebar from "@/components/chat-sidebar";
import ChatInput from "@/components/chat-input";
import CommitButton from "@/components/commit-button";
import CustomCommandButtons from "@/components/custom-command-buttons";
import FileTreeBar from "@/components/file-tree";
import { FileViewer } from "@/components/file-viewer";
import Loader from "@/components/loader";
import MessageUI from "@/components/message";
import { TerminalInput } from "@/components/terminal-input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSessionParam } from "@/lib/session-param";
import { getTitleFromMessages, parseMessages } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

const MemoMessageUI = memo(MessageUI);

type QueueAction =
  | { type: "enqueue"; value: string }
  | { type: "dequeue" }
  | { type: "delete"; index: number }
  | { type: "reset" };

function queueReducer(state: string[], action: QueueAction) {
  switch (action.type) {
    case "enqueue":
      return [...state, action.value];
    case "dequeue":
      return state.slice(1);
    case "delete":
      return state.filter((_, index) => index !== action.index);
    case "reset":
      return [];
    default:
      return state;
  }
}

export function ChatRouteComponent() {
  const [session] = useSessionParam();
  const [isFileBarOpen, setIsFileBarOpen] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();

  const { data: sessionData, isLoading: isSessionLoading } = useQuery({
    queryKey: ["session", session],
    queryFn: async () => {
      if (!session) return null;
      const res = await fetch(`/api/store/${session}`);
      const data = await res.json();
      return {
        workspace:
          typeof data?.workspace === "string"
            ? data.workspace
            : typeof data?.workspacePath === "string"
              ? data.workspacePath
              : null,
        messages: Array.isArray(data?.messages)
          ? (data.messages as UIMessage[])
          : parseMessages(data?.messages),
      };
    },
    enabled: Boolean(session),
  });

  const workspace = sessionData?.workspace ?? null;

  if (!session) {
    return (
      <EmptyChatPage
        isFileBarOpen={isFileBarOpen}
        setIsFileBarOpen={setIsFileBarOpen}
      />
    );
  }

  if (isSessionLoading) {
    return (
      <ChatLayout
        currentSessionTitle="Select a session"
        isActive={false}
        isFileBarOpen={isFileBarOpen}
        setIsFileBarOpen={setIsFileBarOpen}
        workspace={null}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </ChatLayout>
    );
  }

  return (
    <LoadedSessionChat
      key={session}
      session={session}
      workspace={workspace}
      initialMessages={sessionData?.messages ?? []}
      isFileBarOpen={isFileBarOpen}
      setIsFileBarOpen={setIsFileBarOpen}
      selectedFile={selectedFile}
      setSelectedFile={setSelectedFile}
    />
  );
}

type LoadedSessionChatProps = {
  session: string;
  workspace: string | null;
  initialMessages: UIMessage[];
  isFileBarOpen: boolean;
  setIsFileBarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFile: string | undefined;
  setSelectedFile: React.Dispatch<React.SetStateAction<string | undefined>>;
};

function LoadedSessionChat({
  session,
  workspace,
  initialMessages,
  isFileBarOpen,
  setIsFileBarOpen,
  selectedFile,
  setSelectedFile,
}: LoadedSessionChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [queuedMessages, dispatchQueue] = useReducer(queueReducer, []);
  const isDrainingQueueRef = useRef(false);

  const { messages, sendMessage, status, addToolApprovalResponse, stop } =
    useChat<UIMessage>({
      id: session,
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: {
          id: session,
          path: workspace ?? "",
          sessionId: session,
        },
      }),
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const isActive = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (isActive || queuedMessages.length === 0 || isDrainingQueueRef.current) {
      return;
    }

    const nextMessage = queuedMessages[0];
    isDrainingQueueRef.current = true;
    dispatchQueue({ type: "dequeue" });

    void sendMessage({
      text: nextMessage,
    })
      .catch(() => {
        dispatchQueue({ type: "enqueue", value: nextMessage });
      })
      .finally(() => {
        isDrainingQueueRef.current = false;
      });
  }, [isActive, queuedMessages, sendMessage]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isActive]);

  async function handleSend(value: string) {
    if (!value || !workspace || !session) {
      return;
    }

    if (isActive) {
      dispatchQueue({ type: "enqueue", value });
      return;
    }

    await sendMessage({
      text: value,
    });
  }

  const currentSessionTitle = getTitleFromMessages(messages);

  const renderedMessages = messages.map((message, index) => {
    const userMessageText =
      message.role === "user"
        ? message.parts
            .flatMap((part) =>
              part.type === "text" && typeof part.text === "string"
                ? [part.text]
                : [],
            )
            .join("\n")
        : "";

    return (
      <div key={message.id || index}>
        {message.role === "user" ? (
          <div className="flex justify-end py-2">
            <div className="flex items-center gap-2 max-w-[85%]">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy user message"
                    className="text-muted-foreground"
                    onClick={() => {
                      if (
                        !userMessageText ||
                        typeof navigator === "undefined"
                      ) {
                        return;
                      }

                      void navigator.clipboard.writeText(userMessageText);
                    }}>
                    <Copy className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Copy</TooltipContent>
              </Tooltip>

              <div className="rounded-2xl rounded-br-md border border-primary/25 bg-primary/12 px-4 py-2.5 shadow-sm">
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
          </div>
        ) : (
          <MemoMessageUI
            parts={message.parts}
            addToolApprovalResponseAction={addToolApprovalResponse}
          />
        )}
      </div>
    );
  });

  return (
    <ChatLayout
      currentSessionTitle={currentSessionTitle}
      isActive={isActive}
      isFileBarOpen={isFileBarOpen}
      setIsFileBarOpen={setIsFileBarOpen}
      workspace={workspace}
      selectedFile={selectedFile}
      setSelectedFile={setSelectedFile}>
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
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
          isActive={isActive}
          isDisabled={!session}
          queuedMessages={queuedMessages}
          onDeleteQueuedMessage={(index) => {
            dispatchQueue({ type: "delete", index });
          }}
          stop={stop}
          workspacePath={workspace}
        />
      </div>
      {workspace && (
        <TerminalInput workspacePath={workspace} isDisabled={!session} />
      )}
    </ChatLayout>
  );
}

type ChatLayoutProps = {
  children: React.ReactNode;
  currentSessionTitle: string;
  isActive: boolean;
  isFileBarOpen: boolean;
  setIsFileBarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  workspace: string | null;
  selectedFile: string | undefined;
  setSelectedFile: React.Dispatch<React.SetStateAction<string | undefined>>;
};

function ChatLayout({
  children,
  currentSessionTitle,
  isActive,
  isFileBarOpen,
  setIsFileBarOpen,
  workspace,
  selectedFile,
  setSelectedFile,
}: ChatLayoutProps) {
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
                <CustomCommandButtons
                  workspacePath={workspace ?? ""}
                  isBusy={isActive}
                />
                <CommitButton
                  workspacePath={workspace ?? ""}
                  isBusy={isActive}
                />
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
                  <TooltipContent side="bottom">
                    Toggle file tree
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {children}
              </div>
              <FileTreeBar rootPath={workspace} isOpen={isFileBarOpen} />
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
          <div className="relative z-10 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none">
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

function EmptyChatPage({
  isFileBarOpen,
  setIsFileBarOpen,
}: {
  isFileBarOpen: boolean;
  setIsFileBarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <ChatLayout
      currentSessionTitle="Select a session"
      isActive={false}
      isFileBarOpen={isFileBarOpen}
      setIsFileBarOpen={setIsFileBarOpen}
      workspace={null}
      selectedFile={undefined}
      setSelectedFile={() => undefined}>
      <div className="relative flex-1 overflow-y-auto px-4 py-6">
        <div className="flex h-full items-center justify-center">
          <div className="w-full max-w-md text-center flex flex-col items-center justify-center gap-4">
            <Code className="size-10 text-primary" />
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Lets build</h1>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-background/85 p-2 pt-0">
        <ChatInput
          onSend={async () => {}}
          isActive={false}
          isDisabled
          queuedMessages={[]}
          onDeleteQueuedMessage={() => {}}
          stop={() => {}}
          workspacePath={null}
        />
      </div>
      <TerminalInput workspacePath="" isDisabled />
    </ChatLayout>
  );
}
