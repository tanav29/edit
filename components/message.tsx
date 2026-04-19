"use client";

import React, { useMemo } from "react";
import { useJsonRenderMessage } from "@json-render/react";
import { PatchDiff } from "@pierre/diffs/react";
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
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { Streamdown } from "streamdown";
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

function getInputString(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;

  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export default function MessageUI({
  parts,
  addToolApprovalResponseAction,
}: {
  parts: MessagePart[];
  addToolApprovalResponseAction: (response: ToolApprovalResponse) => void;
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
                plugins={{
                  code: code,
                  mermaid: mermaid,
                  math: math,
                  cjk: cjk,
                }}
                shikiTheme={["github-light", "github-dark"]}
                mermaid={{ config: { theme: "dark" } }}
                animated
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
              />
            );
          }
          return null;
      }
    });
  }, [parts, addToolApprovalResponseAction]);
  return <>{renderedParts}</>;
}

function ToolPart({
  part,
  addToolApprovalResponseAction,
}: {
  part: ToolUIPart;
  addToolApprovalResponseAction: (response: ToolApprovalResponse) => void;
}) {
  const toolName = part.type.replace("tool-", "");
  const filePath = getInputString(part.input, "filePath");
  const filePaths = getInputString(part.input, "filePaths");
  const pattern = getInputString(part.input, "pattern");
  const patterns = getInputString(part.input, "patterns");
  const command = getInputString(part.input, "command");
  const compactCommand = command?.replace(/\s+/g, " ").trim();
  const query = getInputString(part.input, "query");
  const queries = getInputString(part.input, "queries");
  const url = getInputString(part.input, "url");
  const urls = getInputString(part.input, "urls");

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
      <summary className="flex items-center gap-2 py-1 text-sm animate-fade-in text-muted-foreground/90 select-none cursor-pointer outline-none">
        {part.state === "output-available" && (
          <>
            {toolName == "read" && (
              <span className="text-muted-foreground/90 flex items-center gap-2">
                <BookSearch className="size-4" />
                Read
              </span>
            )}
            {toolName == "glob" && (
              <span className="text-muted-foreground/90 flex items-center gap-2">
                <Asterisk className="size-4" /> Searched for{" "}
                {patterns && patterns.length} patterns
              </span>
            )}
            {toolName == "bash" && (
              <span className="text-muted-foreground/90 flex items-center gap-2 min-w-0">
                <TerIcon className="size-4 shrink-0" />
                <span className="truncate">Bash {compactCommand}</span>
              </span>
            )}
            {toolName == "patch" && (
              <span className="text-muted-foreground/90 flex items-center gap-2">
                <Edit className="size-4" />
                {filePath}
              </span>
            )}
            {toolName == "grep" && (
              <span className="text-muted-foreground/90 flex items-center gap-2">
                <BookSearch className="size-4" /> Grep {pattern}
              </span>
            )}
            {toolName == "web" && (
              <span className="text-muted-foreground/90 flex items-center gap-2">
                <Globe className="size-4" />
                Searched the web for
                <span className="flex flex-wrap gap-1 items-center">
                  {queries ? (
                    queries.split(",").map((q, i) => (
                      <span key={i} className="text-sm py-0.5 rounded">
                        {q.trim()}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs">{query}</span>
                  )}
                </span>
              </span>
            )}
            {toolName == "scrape" && (
              <span className="text-muted-foreground/90 flex items-center gap-2">
                <ScrollText className="size-4" />
                Scraped
                <span className="flex flex-wrap gap-1 items-center">
                  {urls ? (
                    urls.split(",").map((u, i) => {
                      const urlObj = new URL(u.trim());
                      return (
                        <span key={i} className="text-sm">
                          {urlObj.hostname}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-xs">{url}</span>
                  )}
                </span>
              </span>
            )}
          </>
        )}
        {(() => {
          if (
            part.state === "output-available" &&
            toolName === "read" &&
            part.output &&
            typeof part.output === "object"
          ) {
            const out = part.output as Record<string, unknown>;
            if (Array.isArray(out.files) && out.files.length > 1) {
              return (
                <span>
                  {String(out.successCount)}/{String(out.count)} files
                </span>
              );
            }
            if ("range" in out) {
              return (
                <span>
                  lines {String(out.range)} of {String(out.totalLines)}
                </span>
              );
            }
          }
          if (
            part.state === "output-available" &&
            toolName === "web" &&
            part.output &&
            typeof part.output === "object"
          ) {
            const out = part.output as Record<string, unknown>;
            if (Array.isArray(out.searches) && out.searches.length > 1) {
              return (
                <span className="text-muted-foreground/60 ml-2">
                  {String(out.totalResults)} results
                </span>
              );
            }
          }
          if (
            part.state === "output-available" &&
            toolName === "scrape" &&
            part.output &&
            typeof part.output === "object"
          ) {
            const out = part.output as Record<string, unknown>;
            if (Array.isArray(out.pages) && out.pages.length > 1) {
              return (
                <span className="text-muted-foreground/60 ml-2">
                  {String(out.successCount)}/{String(out.count)} pages
                </span>
              );
            }
          }
          if (
            part.state === "output-available" &&
            toolName === "patch" &&
            part.output &&
            typeof part.output === "object"
          ) {
            const out = part.output as Record<string, unknown>;
            const editCount =
              typeof out.editCount === "number" ? out.editCount : 1;
            const patchAdditions =
              typeof out.patchAdditions === "number" ? out.patchAdditions : 0;
            const patchDeletions =
              typeof out.patchDeletions === "number" ? out.patchDeletions : 0;
            const label =
              out.action === "created"
                ? "created"
                : out.action === "edited"
                  ? `${String(editCount)} edit${editCount > 1 ? "s" : ""}`
                  : "written";
            return (
              <span className="text-muted-foreground/70 ml-1">
                {label} (+{String(patchAdditions)}/-{String(patchDeletions)})
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

  // Handle parallel read (multiple files)
  if (
    toolName === "read" &&
    Array.isArray(data.files) &&
    data.files.length > 1
  ) {
    const files = data.files as Array<Record<string, unknown>>;
    return (
      <div className="space-y-2 rounded-lg border border-border/40 bg-card/70 p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Read {String(data.successCount)} of {String(data.count)} files
        </div>
        {files.map((file, idx) => (
          <div key={idx} className="rounded-md bg-background/60 p-2">
            <div className="text-xs font-mono text-muted-foreground mb-1">
              {String(file.relativePath ?? file.filePath)}
            </div>
            {!file.error ? (
              <>
                <div className="text-[10px] text-muted-foreground/60 mb-1">
                  {String(file.range)} of {String(file.totalLines)}
                </div>
                <pre className="text-xs overflow-auto max-h-32 bg-background/40 p-1 rounded border border-border/20">
                  {String(file.content ?? "")}
                </pre>
              </>
            ) : (
              <div className="text-xs text-red-400">{String(file.error)}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (toolName === "read" && data.content) {
    return null;
  }

  if (toolName === "patch") {
    const patch = typeof data.patch === "string" ? data.patch : null;

    return (
      <div className="tool-card rounded-lg border border-border/40 h-96 overflow-auto">
        {patch ? (
          <PatchDiff
            patch={patch}
            options={{
              diffStyle: "unified",
            }}
          />
        ) : null}
      </div>
    );
  }

  // Handle parallel web search (multiple queries)
  if (
    toolName === "web" &&
    Array.isArray(data.searches) &&
    data.searches.length > 1
  ) {
    const searches = data.searches as Array<Record<string, unknown>>;
    return (
      <div className="space-y-3 rounded-lg border border-border/40 bg-card/70 p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {String(data.totalResults)} results from {String(data.count)} queries
        </div>
        {searches.map((search, queryIdx) => (
          <div key={queryIdx} className="rounded-md bg-background/60 p-2">
            <div className="text-xs font-semibold text-blue-400 mb-2">
              {String(search.query)}
            </div>
            {!search.error ? (
              <div className="space-y-1">
                {Array.isArray(search.results) && search.results.length > 0 ? (
                  (search.results as Array<Record<string, unknown>>).map(
                    (result, idx) => (
                      <a
                        key={idx}
                        href={String(result.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-primary hover:underline truncate">
                        {String(result.title)}
                      </a>
                    ),
                  )
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No results
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-red-400">{String(search.error)}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Handle parallel scrape (multiple URLs)
  if (
    toolName === "scrape" &&
    Array.isArray(data.pages) &&
    data.pages.length > 1
  ) {
    const pages = data.pages as Array<Record<string, unknown>>;
    return (
      <div className="space-y-2 rounded-lg border border-border/40 bg-card/70 p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Scraped {String(data.successCount)} of {String(data.count)} pages
        </div>
        {pages.map((page, idx) => (
          <div key={idx} className="rounded-md bg-background/60 p-2">
            <a
              href={String(page.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-blue-400 hover:underline truncate block mb-1">
              {String(page.url)}
            </a>
            {!page.error ? (
              <>
                {page.title && (
                  <div className="text-xs font-semibold text-foreground/80 mb-1">
                    {String(page.title)}
                  </div>
                )}
                <pre className="text-xs overflow-auto max-h-32 bg-background/40 p-1 rounded border border-border/20 whitespace-pre-wrap">
                  {String(page.content ?? "").slice(0, 200)}...
                </pre>
              </>
            ) : (
              <div className="text-xs text-red-400">{String(page.error)}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (toolName === "grep") {
    const matches = Array.isArray(data.matches)
      ? (data.matches as Array<Record<string, unknown>>)
      : [];

    return (
      <div className="space-y-2 rounded-lg border border-border/40 bg-card/70 p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {String(data.total ?? matches.length)} matches
        </div>
        {matches.length === 0 ? (
          <div className="text-xs text-muted-foreground">No matches</div>
        ) : (
          matches.map((match, index) => (
            <div
              key={index}
              className="space-y-1 rounded-md bg-background/60 p-2">
              <div className="font-mono text-[11px] text-muted-foreground">
                {String(match.relativePath ?? match.filePath)}:
                {String(match.line)}:{String(match.column)}
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word font-mono text-xs">
                {String(match.text ?? "")}
              </pre>
            </div>
          ))
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
      stderr.trimEnd() ? stderr.trimEnd() : "",
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
            <TerminalStatus
              label={statusText}
              failed={hasExitCode && data.exitCode !== 0}
            />
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
