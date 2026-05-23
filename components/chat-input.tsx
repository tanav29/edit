import { ArrowUp, File, Square, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "@/lib/utils";

type FileSuggestion = {
  name: string;
  path: string;
  relativePath: string;
};

type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
};

type ChatInputProps = {
  onSend: (value: string) => void | Promise<void>;
  isActive: boolean;
  isDisabled?: boolean;
  queuedMessages?: string[];
  onDeleteQueuedMessage?: (index: number) => void;
  stop?: () => void;
  workspacePath?: string | null;
};

function trimTrailingSeparators(path: string) {
  const trimmed = path.trim();
  if (trimmed === "/" || /^[A-Za-z]:[\\/]+$/.test(trimmed)) return trimmed;
  return trimmed.replace(/[\\/]+$/g, "");
}

function getRelativeFilePath(fullPath: string, workspacePath: string) {
  const normalizedWorkspace = trimTrailingSeparators(workspacePath);
  const normalizedPath = fullPath.trim();

  if (normalizedPath === normalizedWorkspace) {
    return "";
  }

  if (normalizedPath.startsWith(normalizedWorkspace)) {
    return normalizedPath
      .slice(normalizedWorkspace.length)
      .replace(/^[\\/]+/, "");
  }

  return normalizedPath;
}

function getMentionContext(value: string, cursorIndex: number) {
  const beforeCursor = value.slice(0, cursorIndex);
  const match = beforeCursor.match(/(^|[\s([{\"'`])@([^\s@]*)$/);

  if (!match || match.index == null) {
    return null;
  }

  return {
    start: match.index + match[1].length,
    query: match[2] ?? "",
  };
}

async function scanWorkspaceFiles(
  workspacePath: string,
  signal: AbortSignal,
): Promise<FileSuggestion[]> {
  const seen = new Set<string>();
  const suggestions: FileSuggestion[] = [];

  async function walk(dirPath: string) {
    const response = await fetch(
      `/api/files?path=${encodeURIComponent(dirPath)}`,
      {
        signal,
      },
    );
    const text = await response.text();
    let data: (FileTreeNode & { error?: string }) | undefined;

    if (text) {
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        data = undefined;
      }
    }

    if (!response.ok) {
      throw new Error(
        data?.error || response.statusText || "Failed to scan workspace files",
      );
    }

    if (data?.type !== "directory") {
      if (data?.type === "file") {
        const relativePath = getRelativeFilePath(data.path, workspacePath);
        if (!seen.has(data.path)) {
          seen.add(data.path);
          suggestions.push({
            name: data.name,
            path: data.path,
            relativePath,
          });
        }
      }
      return;
    }

    const children = Array.isArray(data.children) ? data.children : [];
    for (const child of children) {
      if (signal.aborted) return;

      if (child.type === "file") {
        if (seen.has(child.path)) continue;
        seen.add(child.path);
        suggestions.push({
          name: child.name,
          path: child.path,
          relativePath: getRelativeFilePath(child.path, workspacePath),
        });
        continue;
      }

      if (child.type === "directory") {
        await walk(child.path);
      }
    }
  }

  await walk(workspacePath);

  return suggestions.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, undefined, {
      sensitivity: "base",
    }),
  );
}

export default function ChatInput({
  onSend,
  isActive,
  isDisabled = false,
  queuedMessages = [],
  onDeleteQueuedMessage,
  stop,
  workspacePath,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [cursorIndex, setCursorIndex] = useState(0);
  const [allFiles, setAllFiles] = useState<FileSuggestion[]>([]);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    if (!workspacePath) return;

    const controller = new AbortController();

    void scanWorkspaceFiles(workspacePath, controller.signal)
      .then((files) => {
        if (!controller.signal.aborted) {
          setAllFiles(files);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAllFiles([]);
        }
      });

    return () => controller.abort();
  }, [workspacePath]);

  const mentionContext = useMemo(
    () => getMentionContext(input, cursorIndex),
    [cursorIndex, input],
  );

  const fileSuggestions = useMemo(() => {
    if (!workspacePath || !mentionContext) return [];

    const query = mentionContext.query.trim().toLowerCase();

    return allFiles
      .map((file) => {
        const name = file.name.toLowerCase();
        const path = file.relativePath.toLowerCase();

        if (!query) {
          return { file, score: 2 };
        }

        if (name === query || path === query) {
          return { file, score: 0 };
        }

        if (name.startsWith(query) || path.startsWith(query)) {
          return { file, score: 1 };
        }

        if (name.includes(query) || path.includes(query)) {
          return { file, score: 2 };
        }

        return null;
      })
      .filter(
        (entry): entry is { file: FileSuggestion; score: number } =>
          entry !== null,
      )
      .sort((left, right) => {
        if (left.score !== right.score) return left.score - right.score;
        return left.file.relativePath.localeCompare(
          right.file.relativePath,
          undefined,
          {
            sensitivity: "base",
          },
        );
      })
      .slice(0, 8)
      .map(({ file }) => file);
  }, [allFiles, mentionContext, workspacePath]);

  function insertMention(file: FileSuggestion) {
    if (!mentionContext) return;

    const nextValue =
      input.slice(0, mentionContext.start) +
      `@${file.relativePath}` +
      input.slice(cursorIndex);

    setInput(nextValue);
    setCursorIndex(mentionContext.start + file.relativePath.length + 1);
    setActiveMentionIndex(0);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const nextCursor = mentionContext.start + file.relativePath.length + 1;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = event.target.value;
    setInput(nextValue);
    setCursorIndex(event.target.selectionStart ?? nextValue.length);
    setActiveMentionIndex(0);
  }

  async function handleSend() {
    const value = input.trim();
    if (!value || isDisabled) return;
    setInput("");
    await onSend(value);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="rounded-xl border bg-card p-2 transition-colors focus-within:border-muted-foreground/50">
        {queuedMessages.length > 0 ? (
          <div className="mb-2 rounded-lg">
            {queuedMessages.map((message, index) => (
              <div
                key={`${index}-${message}`}
                className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1 text-[10px] text-muted-foreground not-last:mb-1">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center font-medium">
                  {index + 1}
                </span>
                <span className="flex-1 wrap-break-word">{message}</span>
                <button
                  type="button"
                  className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-background/80 hover:text-foreground"
                  aria-label={`Remove queued message ${index + 1}`}
                  onClick={() => onDeleteQueuedMessage?.(index)}>
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="relative flex items-end gap-2 overflow-visible">
          {mentionContext && workspacePath ? (
            <div className="absolute bottom-full left-2 right-2 z-20 mb-2 rounded-lg border bg-background p-1 shadow-xl">
              <div className="max-h-56 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Type a file name after @
                </div>

                {fileSuggestions.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    No files match that name.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {fileSuggestions.map((file, index) => {
                      const isActive = index === activeMentionIndex;

                      return (
                        <button
                          key={file.path}
                          type="button"
                          className={cn(
                            "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            "hover:bg-accent/60",
                            isActive && "bg-accent",
                          )}
                          onMouseEnter={() => setActiveMentionIndex(index)}
                          onClick={() => insertMention(file)}>
                          <File className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{file.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {file.relativePath}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onSelect={(event) => {
              setCursorIndex(
                event.currentTarget.selectionStart ?? input.length,
              );
            }}
            onClick={(event) => {
              setCursorIndex(
                event.currentTarget.selectionStart ?? input.length,
              );
            }}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (
                mentionContext &&
                workspacePath &&
                fileSuggestions.length > 0
              ) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveMentionIndex((prev) =>
                    prev < 0 ? 0 : (prev + 1) % fileSuggestions.length,
                  );
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveMentionIndex((prev) =>
                    prev < 0
                      ? fileSuggestions.length - 1
                      : (prev - 1 + fileSuggestions.length) %
                        fileSuggestions.length,
                  );
                  return;
                }

                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  const nextFile =
                    fileSuggestions[activeMentionIndex] ?? fileSuggestions[0];
                  if (nextFile) {
                    insertMention(nextFile);
                  }
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setCursorIndex(
                    event.currentTarget.selectionStart ?? input.length,
                  );
                  return;
                }
              }

              if (event.key === "Escape" && isActive && stop) {
                event.preventDefault();
                stop();
                return;
              }

              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();

                if (isDisabled) {
                  return;
                }

                if (isActive && !input.trim()) {
                  stop?.();
                  return;
                }

                void handleSend();
              }
            }}
            onKeyUp={(event) => {
              setCursorIndex(
                event.currentTarget.selectionStart ?? input.length,
              );
            }}
            placeholder={
              isDisabled
                ? "Select a session or click New chat to start"
                : isActive
                  ? queuedMessages.length > 0
                    ? `${queuedMessages.length} queued. Press Enter to add the next message.`
                    : "Assistant is responding. Press Enter to queue the next message"
                  : "Ask for edits, commands, or debugging help"
            }
            title="Press Enter to send. Shift+Enter for a new line."
            rows={3}
            disabled={isDisabled}
            className="ml-1 max-h-50 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="flex h-full items-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  onClick={() => {
                    const value = input.trim();

                    if (isActive && !value) {
                      stop?.();
                      return;
                    }

                    void handleSend();
                  }}
                  aria-label={
                    isActive && input.trim()
                      ? "Queue message"
                      : isActive
                        ? "Stop generation"
                        : "Send message"
                  }
                  disabled={
                    isDisabled || (!input.trim() && !(isActive && !!stop))
                  }
                  className="rounded-lg shrink-0">
                  {isActive && !input.trim() ? (
                    <Square className="size-3 fill-current" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isActive && input.trim()
                  ? "Queue message"
                  : isActive
                    ? "Stop generation"
                    : "Send message"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
