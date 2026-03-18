import { ArrowUp, Square } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "./ui/button";

type ChatInputProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (value: string) => void;
  handleSend: () => void | Promise<void>;
  isActive: boolean;
  stop?: () => void;
};

export default function ChatInput({
  textareaRef,
  input,
  setInput,
  handleSend,
  isActive,
  stop,
}: ChatInputProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-end gap-2 rounded-xl border bg-card p-2 transition-colors focus-within:border-muted-foreground/50">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        <div className="flex h-full items-end gap-2">
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
            className="rounded-lg shrink-0"
          >
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
