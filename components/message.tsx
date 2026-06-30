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
import { tool, type ToolUIPart } from "ai";
import {
    BookSearch,
    Globe,
    Terminal as TerIcon,
    Link,
    File,
    ScrollText,
    Asterisk,
    Edit,
    FolderTree,
    FilePenLine,
    Hammer,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { cn } from "@/lib/utils";

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

function getInputValue(input: unknown, key: string): unknown {
    if (typeof input !== "object" || input === null) return undefined;
    return (input as Record<string, unknown>)[key];
}

function getInputString(input: unknown, key: string): string | undefined {
    const value = getInputValue(input, key);
    if (typeof value === "string") return value;
    if (
        Array.isArray(value) &&
        value.length === 1 &&
        typeof value[0] === "string"
    ) {
        return value[0];
    }
    return undefined;
}

function getInputStringList(input: unknown, key: string): string[] | undefined {
    const value = getInputValue(input, key);
    if (typeof value === "string") return [value];
    if (
        Array.isArray(value) &&
        value.every((item) => typeof item === "string")
    ) {
        return value as string[];
    }
    return undefined;
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
        const result: React.ReactNode[] = [];
        let toolBuffer: React.ReactNode[] = [];
        let lastWasTool = false;

        const flushTools = (n: number) => {
            if (toolBuffer.length == 0) return;
            else {
                result.push(
                    <details className="flex flex-col text-sm text-muted-foreground/90 select-none outline-none font-mono">
                        <summary className="gap-2 flex">
                            {toolBuffer.length}{" "}
                            {toolBuffer.length > 1 ? "tools" : "tool"} called
                        </summary>
                        <div className="flex flex-col py-3 px-2">
                            {toolBuffer}
                        </div>
                    </details>,
                );
            }
            toolBuffer = [];
        };

        parts.forEach((part, partIndex) => {
            const key = part.toolCallId ?? `part-${partIndex}`;
            const isTool = part.type.startsWith("tool-");
            let rendered: React.ReactNode = null;

            switch (part.type) {
                case "text":
                    rendered = (
                        <div key={key} className="text-sm my-3">
                            <Streamdown
                                plugins={{
                                    code: code,
                                    mermaid: mermaid,
                                    math: math,
                                    cjk: cjk,
                                }}
                                shikiTheme={["github-light", "github-dark"]}
                                mermaid={{ config: { theme: "dark" } }}
                            >
                                {part.text}
                            </Streamdown>
                        </div>
                    );
                    break;

                case "reasoning":
                    rendered = <p key={key}>Thinking...</p>;
                    break;

                // maek that working and clickable
                case "source-document":
                    rendered = (
                        <div
                            key={key}
                            className="inline-flex items-center gap-1.5 text-xs bg-card border border-border/50 rounded-md px-2 py-1 text-muted-foreground"
                        >
                            <File className="size-3" />
                            <span className="font-mono">{part.filename}</span>
                        </div>
                    );
                    break;

                case "source-url":
                    rendered = (
                        <a
                            key={key}
                            href={part.url}
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Link className="size-3" />
                            <span className="underline underline-offset-2">
                                {part.title}
                            </span>
                        </a>
                    );
                    break;

                default:
                    if (
                        part.type == "tool-edit" &&
                        part.state === "output-available" &&
                        part.output
                    ) {
                        rendered = (
                            <div
                                key={key}
                                className="w-full max-h-108 mt-2 overflow-y-scroll border rounded-lg overflow-hidden"
                            >
                                <PatchDiff
                                    patch={
                                        (part.output as { patch: string }).patch
                                    }
                                    options={{
                                        collapsed: true,
                                        overflow: "wrap",
                                        diffStyle: "unified",
                                        unsafeCSS:
                                            "* { font-family: var(--font-geist-mono), monospace !important; }",
                                    }}
                                />
                            </div>
                        );
                    } else if (part.type.startsWith("tool-")) {
                        rendered = (
                            <ToolPart
                                key={key}
                                part={part as ToolUIPart}
                                addToolApprovalResponseAction={
                                    addToolApprovalResponseAction
                                }
                            />
                        );
                    }
                    break;
            }

            if (isTool) {
                toolBuffer.push(rendered);
                lastWasTool = true;
            } else {
                if (rendered != null) result.push(rendered);
                if (lastWasTool) {
                    flushTools(result.length);
                    lastWasTool = false;
                }
            }
        });

        flushTools(result.length);
        return result;
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
    const pattern = getInputString(part.input, "pattern");
    const patterns = getInputStringList(part.input, "patterns");
    const command = getInputString(part.input, "command");
    const compactCommand = command?.replace(/\s+/g, " ").trim();
    const query = getInputString(part.input, "query");
    const queries = getInputStringList(part.input, "queries");
    const url = getInputString(part.input, "url");
    const urls = getInputStringList(part.input, "urls");
    const directoryPath = getInputString(part.input, "path") ?? ".";

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
                        {Object.entries(
                            part.input as Record<string, unknown>,
                        ).map(([k, v]) => (
                            <div key={k} className="text-xs mb-1 last:mb-0">
                                <span className="text-muted-foreground font-mono">
                                    {k}:
                                </span>{" "}
                                <span className="text-foreground/80 font-mono">
                                    {typeof v === "object"
                                        ? JSON.stringify(v, null, 2)
                                        : String(v ?? "")}
                                </span>
                            </div>
                        ))}
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
                        className="rounded-lg text-xs"
                    >
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
                        className="rounded-lg text-xs"
                    >
                        Decline
                        <kbd>D</kbd>
                    </Button>
                </div>
            </div>
        );
    }

    if (toolName === "edit") return null;

    return (
        <div className="flex items-center gap-2 py-0 text-sm text-muted-foreground/90 select-none outline-none font-mono">
            <Hammer className="size-4 shrink-0 text-muted-foreground/90" />
            {toolName === "read" && (
                <span className="text-muted-foreground/90 flex items-center gap-2">
                    Read {filePath}
                </span>
            )}
            {toolName === "ls" && (
                <span className="text-muted-foreground/90 flex items-center gap-2">
                    Listed {directoryPath}
                </span>
            )}
            {toolName === "glob" && (
                <span className="text-muted-foreground/90 flex items-center gap-2">
                    Glob for {patterns?.length ?? 0} pattern
                    {(patterns?.length ?? 0) === 1 ? "" : "s"}
                </span>
            )}
            {toolName === "bash" && (
                <span className="text-muted-foreground/90 flex items-center gap-2 truncate text-ellipsis">
                    Ran {compactCommand}
                </span>
            )}
            {toolName === "grep" && (
                <span className="text-muted-foreground/90 flex items-center gap-2">
                    Grep {pattern}
                </span>
            )}
            {toolName === "web" && (
                <span className="text-muted-foreground/90 flex items-center gap-1.5">
                    Searched the web
                    {(queries ?? (query ? [query] : [])).map((item, i) => (
                        <span key={i}>{item}</span>
                    ))}
                </span>
            )}
            {toolName === "scrape" && (
                <span className="text-muted-foreground/90 flex items-center gap-2">
                    Scraped
                    <span className="flex flex-wrap gap-1 items-center">
                        {(urls ?? (url ? [url] : [])).map((item, i) => {
                            try {
                                const urlObj = new URL(item.trim());
                                return <span key={i}>{urlObj.hostname}</span>;
                            } catch {
                                return <span key={i}>{item}</span>;
                            }
                        })}
                    </span>
                </span>
            )}
        </div>
    );
}
