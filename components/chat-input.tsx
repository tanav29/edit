import { ArrowUp, Square } from "lucide-react";
import { Button } from "./ui/button";

export default function ChatInput({
  textareaRef,
  input,
  setInput,
  handleSend,
  isActive,
}: any) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-end gap-2 rounded-xl border bg-card p-2 focus-within:border-muted-foreground/50 transition-colors">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Send a message..."
          rows={3}
          className="ml-1 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground max-h-[200px]"
        />
        <div className="flex h-full items-end gap-2">
          <Button
            size="icon-sm"
            onClick={isActive ? stop : () => handleSend()}
            disabled={isActive ? false : !input.trim()}
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
