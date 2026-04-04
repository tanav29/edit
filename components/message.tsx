"use client";

import React, { useMemo } from "react";
import { useJsonRenderMessage } from "@json-render/react";
import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from "./ai-elements/terminal";
import { type ToolUIPart } from "ai";
import {
  BookSearch,
  Globe,
  PenLine,
  Terminal as TerIcon,
  Bug,
  Link,
  Loader2,
  File,
  CircleX,
  ScrollText,
  Asterisk,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { Streamdown, type CodeHighlighterPlugin } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";

type ToolApprovalResponse = {
  id: string;
  approved: boolean;
};

type MessagePart = {
  type: string;
  state?: string;
  text?: string;
  title?: string;
  filename?: string;
  url?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
};

type FilePathInput = {
  filePath: string;
};

function getInputString(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;

  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function hasFilePathInput(input: unknown): input is FilePathInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "filePath" in input &&
    typeof (input as FilePathInput).filePath === "string"
  );
}

export default function MessageUI({
  parts,
  addToolApprovalResponseAction,
  onFileClickAction,
  onWriteDiffOpenAction,
}: {
  parts: MessagePart[];
  addToolApprovalResponseAction: (response: ToolApprovalResponse) => void;
  onFileClickAction?: (path: string) => void;
  onWriteDiffOpenAction?: (path: string) => void;
}) {
  useJsonRenderMessage(parts);

  const renderedParts = useMemo(() => {
    return parts.map((part, partIndex) => {
      const key = part.toolCallId ? part.toolCallId : partIndex;

      switch (part.type) {
        case "text":
          return (
            <div key={key} className="text-md">
              <Streamdown
                className="chat-markdown my-2"
                mode="static"
                plugins={{ code: code as unknown as CodeHighlighterPlugin, mermaid, math, cjk }}
                shikiTheme={["github-light", "github-dark"]}
                mermaid={{ config: { theme: "dark" } }}
                isAnimating={part.state === "streaming"}>
                {part.text}
              </Streamdown>
            </div>
          );

        case "source-document":
          return (
            <div
              key={key}
              className="inline-flex items-center gap-1.5 text-xs bg-card border border-border/50 rounded-md px-2 py-1 text-muted-foreground">
              <File className="size-3" />
              <span className="font-mono">{part.filename}</span>
            </div>
          );

        case "source-url":
          return (
            <a
              key={key}
              href={part.url}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer">
              <Link className="size-3" />
              <span className="underline underline-offset-2">{part.title}</span>
            </a>
          );

        default:
          if (part.type.startsWith("tool-")) {
            return (
              <ToolPart
                key={key}
                part={part as ToolUIPart}
                addToolApprovalResponseAction={addToolApprovalResponseAction}
                onFileClickAction={onFileClickAction}
                onWriteDiffOpenAction={onWriteDiffOpenAction}
              />
            );
          }
          return null;
      }
    });
  }, [
    parts,
    addToolApprovalResponseAction,
    onFileClickAction,
    onWriteDiffOpenAction,
  ]);
  return <>{renderedParts}</>;
}

function ToolPart({
  part,
  addToolApprovalResponseAction,
  onFileClickAction,
  onWriteDiffOpenAction,
}: {
  part: ToolUIPart;
  addToolApprovalResponseAction: (response: ToolApprovalResponse) => void;
  onFileClickAction?: (path: string) => void;
  onWriteDiffOpenAction?: (path: string) => void;
}) {
  const toolName = part.type.replace("tool-", "");
  const filePath = getInputString(part.input, "filePath");
  const pattern = getInputString(part.input, "pattern");
  const command = getInputString(part.input, "command");
  const query = getInputString(part.input, "query");
  const url = getInputString(part.input, "url");

  const toolOutput = useMemo(
    () => <ToolOutput toolName={toolName} output={part.output} />,
    [toolName, part.output],
  );

  if (part.state === "approval-requested") {
    return (
      <div className="tool-card rounded-xl p-3.5 space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <TerIcon className="size-3 text-amber-400" />
          </div>
          <span className="text-xs font-medium text-foreground/90">
            {toolName}
          </span>
          <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
            needs approval
          </span>
        </div>

        {part.input != null && (
          <div className="bg-background/60 rounded-lg p-2.5 border border-border/30 max-h-48 overflow-auto">
            {Object.entries(part.input as Record<string, unknown>).map(
              ([k, v]) => (
                <div key={k} className="text-xs mb-1 last:mb-0">
                  <span className="text-muted-foreground font-mono">{k}:</span>{" "}
                  <span className="text-foreground/80 font-mono">
                    {typeof v === "object"
                      ? JSON.stringify(v, null, 2)
                      : String(v ?? "")}
                  </span>
                </div>
              ),
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              addToolApprovalResponseAction({
                id: part.approval.id,
                approved: true,
              });
            }}
            className="rounded-lg text-xs">
            Approve
            <kbd>A</kbd>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              addToolApprovalResponseAction({
                id: part.approval.id,
                approved: false,
              });
            }}
            className="rounded-lg text-xs">
            Decline
            <kbd>D</kbd>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <details>
      <summary
        onClick={() => {
          if (toolName === "write" && hasFilePathInput(part.input)) {
            onWriteDiffOpenAction?.(part.input.filePath);
            return;
          }
          if (hasFilePathInput(part.input) && onFileClickAction) {
            onFileClickAction(part.input.filePath);
          }
        }}
        className="flex items-center gap-2 text-xs py-0.5 animate-fade-in text-muted-foreground/90 select-none cursor-pointer outline-none">
        {part.state == "output-available" ||
        part.state == "output-denied" ||
        part.state == "approval-responded" ||
        part.state == "output-error" ? (
          <>
            {part.state === "output-error" && <Bug className="size-3" />}
            {part.state === "output-denied" && <CircleX className="size-3" />}
            {part.state === "output-available" && (
              <>
                {toolName == "read" && (
                  <span className="text-muted-foreground/90 flex items-center gap-1">
                    <BookSearch className="size-3" /> Read &quot;
                    {filePath}
                    &quot;
                  </span>
                )}
                {toolName == "glob" && (
                  <span className="text-muted-foreground/90 flex items-center gap-1">
                    <Asterisk className="size-3" /> Glob &quot;{pattern}&quot;
                  </span>
                )}
                {toolName == "bash" && (
                  <span className="text-muted-foreground/90 flex items-center gap-1">
                    <TerIcon className="size-3" /> Bash &quot;{command}&quot;
                  </span>
                )}
                {toolName == "write" && (
                  <span className="text-muted-foreground/90 flex items-center gap-1">
                    <PenLine className="size-3" /> Write &quot;{filePath}&quot;
                  </span>
                )}
                {toolName == "web" && (
                  <span className="text-muted-foreground/90 flex items-center gap-1">
                    <Globe className="size-3" /> Web &quot;{query}&quot;
                  </span>
                )}
                {toolName == "scrape" && (
                  <span className="text-muted-foreground/90 flex gap-1 items-center">
                    <ScrollText className="size-3" /> Scrape &quot;{url}&quot;
                  </span>
                )}
              </>
            )}
            {part.state === "approval-responded" && !part.approval.approved && (
              <CircleX className="size-3" />
            )}
          </>
        ) : (
          <Loader2 className="size-3 animate-spin" />
        )}
        {(() => {
          if (
            part.state === "output-available" &&
            toolName === "write" &&
            part.output &&
            typeof part.output === "object"
          ) {
            const out = part.output as Record<string, unknown>;
            const label =
              out.action === "created"
                ? "created"
                : out.action === "edited"
                  ? `${String(out.editCount)} edit(s)`
                  : "written";
            return <span className="text-emerald-500/80 ml-1">{label}</span>;
          }
          if (
            part.state === "output-available" &&
            toolName === "read" &&
            part.output &&
            typeof part.output === "object" &&
            "range" in (part.output as Record<string, unknown>)
          ) {
            const out = part.output as Record<string, unknown>;
            return (
              <span className="text-muted-foreground/60 ml-1">
                lines {String(out.range)} of {String(out.totalLines)}
              </span>
            );
          }
          return null;
        })()}
      </summary>
      <div className="mt-2">{toolOutput}</div>
    </details>
  );
}

const ToolOutput = React.memo(function ToolOutput({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) {
  if (!output) return null;

  const data = output as Record<string, unknown>;

  if (data.error) {
    return (
      <div className="text-red-400 font-mono whitespace-pre-wrap max-h-48">
        {String(data.error)}
      </div>
    );
  }

  if (toolName === "read" && data.content) {
    return null;
  }

  if (toolName === "write") {
    const editsArr = Array.isArray(data.edits)
      ? (data.edits as Array<Record<string, unknown>>)
      : [];

    return (
      <div className="space-y-2 tool-card rounded-lg p-3.5">
        <div className="flex items-center gap-2 text-[10px] pb-1 border-b border-border/30">
          <span
            className={
              data.action === "created"
                ? "text-emerald-400"
                : data.action === "edited"
                  ? "text-amber-400"
                  : "text-blue-400"
            }>
            {String(data.action ?? "").toUpperCase()}
          </span>
          <span className="text-muted-foreground/70">
            {String(data.filePath)}
          </span>
        </div>
        {editsArr.map((edit, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
            <span className="font-mono">L{String(edit.range)}</span>
            <span className="text-red-400/70">
              -{String(edit.linesRemoved)}
            </span>
            <span className="text-emerald-400/70">
              +{String(edit.linesAdded)}
            </span>
            {edit.description != null && (
              <span className="text-muted-foreground/50 ml-1">
                {String(edit.description)}
              </span>
            )}
          </div>
        ))}
        {data.message != null && (
          <div className="text-muted-foreground/60 text-[10px]">
            {String(data.message)}
          </div>
        )}
        {data.previousLineCount !== undefined && (
          <div className="text-muted-foreground/50 text-[10px]">
            {String(data.previousLineCount)} &rarr; {String(data.newLineCount)}{" "}
            lines
          </div>
        )}
      </div>
    );
  }

  if (toolName === "bash") {
    const stdout = typeof data.stdout === "string" ? data.stdout : "";
    const stderr = typeof data.stderr === "string" ? data.stderr : "";
    const hasExitCode = typeof data.exitCode === "number";
    const hasOutput = stdout.length > 0 || stderr.length > 0;
    const statusText = hasExitCode
      ? data.exitCode === 0
        ? "Success"
        : `Exit ${String(data.exitCode)}`
      : "Ready";
    const mergedOutput = [
      stdout.trimEnd(),
      stderr.trimEnd() ? `\n[stderr]\n${stderr.trimEnd()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (!hasOutput && !hasExitCode) {
      return null;
    }

    return (
      <Terminal
        autoScroll={false}
        isStreaming={false}
        onClear={() => {}}
        output={mergedOutput || "(no output)"}>
        <TerminalHeader>
          <TerminalTitle>{String(data.path)}</TerminalTitle>
          <div className="flex items-center gap-1">
            <TerminalStatus label={statusText} failed={hasExitCode && data.exitCode !== 0} />
            <TerminalActions>
              <TerminalCopyButton
                onCopyAction={() => {
                  if (typeof navigator === "undefined") return;
                  void navigator.clipboard.writeText(mergedOutput || "");
                }}
              />
            </TerminalActions>
          </div>
        </TerminalHeader>
        <TerminalContent />
      </Terminal>
    );
  }

  return (
    <pre className="tool-card rounded-lg p-3.5 max-h-48 text-xs overflow-y-auto wrap-break-word">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
});
