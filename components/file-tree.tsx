"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { preparePresortedFileTreeInput } from "@pierre/trees";
import { cn } from "@/lib/utils";

type GitStatus =
    | "added"
    | "deleted"
    | "ignored"
    | "modified"
    | "renamed"
    | "untracked";

interface GitStatusEntry {
    path: string;
    status: GitStatus;
}

interface WorkspaceTreePayload {
    paths: string[];
    rootName: string;
    rootPath: string;
    gitStatus: GitStatusEntry[];
}

interface FileTreeBarProps {
    rootPath?: string | null;
    isOpen: boolean;
    selectedFile?: string;
    onFileSelect: (path: string | undefined) => void;
}

function trimTrailingSeparators(path: string) {
    const trimmed = path.trim();
    if (trimmed === "/" || /^[A-Za-z]:[\\/]+$/.test(trimmed)) return trimmed;
    return trimmed.replace(/[\\/]+$/g, "");
}

function inferSeparator(path: string) {
    return path.includes("\\") ? "\\" : "/";
}

function joinWorkspacePath(rootPath: string, relativePath: string) {
    const normalizedRoot = trimTrailingSeparators(rootPath);
    if (!relativePath) return normalizedRoot;

    const separator = inferSeparator(normalizedRoot);
    const normalizedRelative = relativePath.replace(/[\\/]+/g, separator);

    if (normalizedRoot === "/" || /^[A-Za-z]:[\\/]*$/.test(normalizedRoot)) {
        return `${normalizedRoot}${normalizedRelative.replace(/^[\\/]+/, "")}`;
    }

    return `${normalizedRoot}${separator}${normalizedRelative.replace(
        /^[\\/]+/,
        "",
    )}`;
}

function normalizePathForComparison(path: string) {
    const normalized = trimTrailingSeparators(path).replace(/\\/g, "/");
    return /^[A-Za-z]:/.test(normalized)
        ? normalized.toLowerCase()
        : normalized;
}

function toRelativeWorkspacePath(fullPath: string, rootPath: string) {
    const normalizedRoot = normalizePathForComparison(rootPath);
    const normalizedFullPath = fullPath.trim().replace(/\\/g, "/");
    const comparableFullPath = normalizePathForComparison(fullPath);

    if (comparableFullPath === normalizedRoot) {
        return "";
    }

    if (comparableFullPath.startsWith(`${normalizedRoot}/`)) {
        return normalizedFullPath
            .slice(normalizedRoot.length)
            .replace(/^\/+/, "");
    }

    return normalizedFullPath;
}

export default function FileTreeBar({
    rootPath,
    isOpen,
    selectedFile,
    onFileSelect,
}: FileTreeBarProps) {
    useEffect(() => {
        if (!selectedFile) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onFileSelect(undefined);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onFileSelect, selectedFile]);

    return (
        <aside
            className={cn(
                "shrink-0 min-h-0 z-50 flex-col border-l bg-background",
                isOpen
                    ? "flex w-64 translate-x-0 opacity-100"
                    : "pointer-events-none w-0 flex translate-x-3 opacity-0 overflow-hidden border-l-0",
            )}
        >
            <div className="flex min-h-0 flex-1 overflow-hidden">
                {rootPath ? (
                    <WorkspaceFileTree
                        key={rootPath}
                        rootPath={rootPath}
                        selectedFile={selectedFile}
                        onFileSelect={onFileSelect}
                    />
                ) : (
                    <div className="p-3 text-xs text-muted-foreground">
                        Select or create a chat to browse files
                    </div>
                )}
            </div>
        </aside>
    );
}

function WorkspaceFileTree({
    rootPath,
    selectedFile,
    onFileSelect,
}: {
    rootPath: string;
    selectedFile?: string;
    onFileSelect: (path: string | undefined) => void;
}) {
    const { data, isLoading, isError, error } = useQuery<
        WorkspaceTreePayload,
        Error
    >({
        queryKey: ["workspace-tree", rootPath],
        queryFn: async () => {
            const res = await fetch(
                `/api/files/tree?path=${encodeURIComponent(rootPath)}`,
            );

            if (!res.ok) {
                const text = await res.text();
                let payload: { error?: string } | null = null;
                if (text) {
                    try {
                        payload = JSON.parse(text) as { error?: string } | null;
                    } catch {
                        payload = null;
                    }
                }
                throw new Error(
                    payload?.error || "Failed to load workspace tree",
                );
            }

            const text = await res.text();
            if (!text) {
                throw new Error("Failed to load workspace tree");
            }
            return JSON.parse(text) as WorkspaceTreePayload;
        },
        enabled: Boolean(rootPath),
        staleTime: 30_000,
        gcTime: 10 * 60_000,
    });

    if (isLoading) {
        return (
            <div className="p-3 text-xs text-muted-foreground">Loading...</div>
        );
    }

    if (isError) {
        return (
            <div className="p-3 text-xs text-destructive">
                {error.message || "Failed to load workspace tree"}
            </div>
        );
    }

    if (!data) {
        return (
            <div className="p-3 text-xs text-muted-foreground">
                No files found
            </div>
        );
    }

    return (
        <WorkspaceFileTreeContent
            key={`${data.rootPath}:${data.paths.join("\n")}`}
            rootPath={rootPath}
            rootName={data.rootName}
            workspaceDisplayPath={data.rootPath}
            paths={data.paths}
            gitStatus={data.gitStatus}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
        />
    );
}

function WorkspaceFileTreeContent({
    rootPath,
    rootName,
    workspaceDisplayPath,
    paths,
    gitStatus,
    selectedFile,
    onFileSelect,
}: {
    rootPath: string;
    rootName: string;
    workspaceDisplayPath: string;
    paths: string[];
    gitStatus: GitStatusEntry[];
    selectedFile?: string;
    onFileSelect: (path: string | undefined) => void;
}) {
    const initialSelectedPaths = useMemo(() => {
        if (!selectedFile || !rootPath) return undefined;

        const relativePath = toRelativeWorkspacePath(selectedFile, rootPath);
        return relativePath ? [relativePath] : undefined;
    }, [rootPath, selectedFile]);

    const preparedInput = useMemo(
        () => preparePresortedFileTreeInput(paths),
        [paths],
    );

    const { model } = useFileTree({
        preparedInput,
        initialExpansion: 1,
        initialSelectedPaths,
        density: "compact",
        gitStatus,
        unsafeCSS:
            "* { font-family: var(--font-geist-mono), monospace !important; }",
        onSelectionChange: (selectedPaths) => {
            const selectedPath = selectedPaths[0];
            if (!selectedPath || selectedPath.endsWith("/")) {
                return;
            }

            onFileSelect(joinWorkspacePath(rootPath, selectedPath));
        },
    });

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden">
            <FileTree
                model={model}
                className="h-full w-full"
                style={
                    {
                        height: "100%",
                        width: "100%",
                        "--trees-border-color-override": "transparent",
                        "--trees-selected-bg-override":
                            "color-mix(in oklab, var(--accent) 85%, transparent)",
                        "--trees-hover-bg-override":
                            "color-mix(in oklab, var(--accent) 45%, transparent)",
                        "--trees-fg-override": "var(--foreground)",
                        "--trees-muted-fg-override": "var(--muted-foreground)",
                        "--trees-bg-override": "var(--background)",
                    } as React.CSSProperties
                }
            />
        </div>
    );
}
