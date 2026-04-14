"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Terminal as TerminalIcon } from "lucide-react";

interface TerminalInputProps {
  workspacePath: string;
  isDisabled?: boolean;
}

export function TerminalInput({
  workspacePath,
  isDisabled = false,
}: TerminalInputProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const runCommand = async (cmd: string) => {
    if (!cmd.trim() || isRunning || !workspacePath) return;

    setIsRunning(true);
    setInput("");
    setOutput((prev) => [...prev, `$ ${cmd}`]);

    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: workspacePath, command: cmd }),
      });

      const data = await res.json();

      if (!res.ok) {
        setOutput((prev) => [
          ...prev,
          `Error: ${data.error || data.message || "Unknown error"}`,
        ]);
      } else {
        const out = data.output || "";
        if (out) {
          setOutput((prev) => [...prev, out]);
        }
      }
    } catch (error) {
      setOutput((prev) => [
        ...prev,
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        setHistory((prev) => [...prev, input]);
        setHistoryIndex(-1);
        runCommand(input);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex] || "");
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput("");
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setOutput([]);
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setOutput((prev) => [...prev, "^C"]);
    }
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  return (
    <div
      className="flex flex-col border-t bg-card text-card-foreground"
      onClick={focusInput}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsCollapsed(!isCollapsed);
        }}
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <TerminalIcon className="size-3.5" />
        <span className="font-medium">Terminal</span>
        {isCollapsed ? (
          <ChevronUp className="size-3.5 ml-auto" />
        ) : (
          <ChevronDown className="size-3.5 ml-auto" />
        )}
      </button>

      {!isCollapsed && (
        <>
          <div
            ref={outputRef}
            className="flex-1 max-h-48 overflow-auto bg-black p-3 font-mono text-xs leading-relaxed text-neutral-400"
          >
            {output.length === 0 ? (
              <div className="text-neutral-600">
                Type a command and press Enter to run. Use ↑↓ for history.
              </div>
            ) : (
              output.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {line}
                </div>
              ))
            )}
            {isRunning && (
              <div className="animate-pulse text-emerald-500">Running...</div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border/50 bg-muted/30 px-3 py-2">
            <span className="text-emerald-500 font-mono text-xs">$</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isDisabled || isRunning}
              placeholder={isDisabled ? "Select a workspace first" : "Enter command..."}
              className="flex-1 bg-transparent font-mono text-xs text-foreground placeholder:text-neutral-600 focus:outline-none disabled:opacity-50"
              autoFocus
            />
          </div>
        </>
      )}
    </div>
  );
}
