import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type ChatInputProps = {
  onSend: (value: string) => void | Promise<void>;
  isActive: boolean;
  isDisabled?: boolean;
  stop?: () => void;
};

export default function ChatInput({
  onSend,
  isActive,
  isDisabled = false,
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
    if (!value || isActive || isDisabled) return;
    setInput("");
    await onSend(value);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-end gap-2 rounded-xl border bg-card p-2 transition-colors focus-within:border-muted-foreground/50">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();

                if (isActive) {
                  stop?.();
                  return;
                }

                if (isDisabled) {
                  return;
                }

                void handleSend();
              }
            }}
            placeholder={
              isDisabled
                ? "Select a session or click New chat to start"
                : isActive
                  ? "Assistant is responding. Press Stop to interrupt"
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
                  if (isActive) {
                    stop?.();
                    return;
                  }

                  void handleSend();
                }}
                aria-label={isActive ? "Stop generation" : "Send message"}
                disabled={isDisabled || (isActive ? !stop : !input.trim())}
                className="rounded-lg shrink-0">
                {isActive ? (
                  <Square className="size-3 fill-current" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isActive ? "Stop generation" : "Send message"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
