import { ArrowUp, Box, Square } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "./ui/button";

type ChatInputProps = {
  onSend: (value: string) => void | Promise<void>;
  isActive: boolean;
  stop?: () => void;
};

export default function ChatInput({
  onSend,
  isActive,
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
    if (!value || isActive) return;
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

              void handleSend();
            }
          }}
          placeholder="Send a message..."
          rows={3}
          className="ml-1 max-h-50 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="flex h-full items-end gap-1">
          <Button variant={"outline"} size={"icon-sm"}>
            <Box />
          </Button>
          <Button
            size="icon-sm"
            onClick={() => {
              if (isActive) {
                stop?.();
                return;
              }

              void handleSend();
            }}
            disabled={isActive ? !stop : !input.trim()}
            className="rounded-lg shrink-0">
            {isActive ? (
              <Square className="size-3 fill-current" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
