import { ArrowUp, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type ChatInputProps = {
  onSend: (value: string) => void | Promise<void>;
  isActive: boolean;
  isDisabled?: boolean;
  queuedMessages?: string[];
  onDeleteQueuedMessage?: (index: number) => void;
  stop?: () => void;
};

export default function ChatInput({
  onSend,
  isActive,
  isDisabled = false,
  queuedMessages = [],
  onDeleteQueuedMessage,
  stop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [input]);

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

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
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
