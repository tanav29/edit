import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
    ArrowDownIcon,
    ArrowUpIcon,
    CornerDownLeftIcon,
    Folder,
    Loader2,
    Plus,
} from "lucide-react";

import { Button } from "./ui/button";
import { useSessionParam } from "@/lib/session-param";
import {
    Command,
    CommandCollection,
    CommandDialog,
    CommandDialogPopup,
    CommandDialogTrigger,
    CommandEmpty,
    CommandFooter,
    CommandGroup,
    CommandGroupLabel,
    CommandInput,
    CommandItem,
    CommandList,
    CommandPanel,
} from "./ui/command";
import { Kbd, KbdGroup } from "./ui/kbd";

type ChatCreationProps = {
    refetch?: () => void | Promise<unknown>;
};

type Group = {
    value: string;
    items: PaletteItem[];
};

type DirectoryEntry = {
    name: string;
    path: string;
};

type PaletteItem = {
    kind: "directory";
    key: string;
    entry: DirectoryEntry;
    keywords: string[];
};

type JsonObject = Record<string, unknown>;

function inferSeparator(path: string) {
    return path.includes("\\") ? "\\" : "/";
}

function trimTrailingSeparators(path: string) {
    const trimmed = path.trim();
    if (trimmed === "/" || /^[A-Za-z]:[\\/]+$/.test(trimmed)) return trimmed;
    return trimmed.replace(/[\\/]+$/g, "");
}

function normalizeWorkspacePath(value: string) {
    return trimTrailingSeparators(value);
}

function isPathLike(value: string) {
    return (
        value.startsWith("/") ||
        value.includes("\\") ||
        value.includes("/") ||
        /^[A-Za-z]:[\\/]/.test(value)
    );
}

function splitPath(input: string): { dir: string; base: string } {
    const normalized = input.trim();
    const slashIndex = normalized.lastIndexOf("/");
    const backslashIndex = normalized.lastIndexOf("\\");
    const sepIndex = Math.max(slashIndex, backslashIndex);

    if (sepIndex < 0) {
        return { dir: "", base: normalized };
    }

    const sep = sepIndex === backslashIndex ? "\\" : "/";
    const before = normalized.slice(0, sepIndex);
    const dir =
        before === "" && sep === "/"
            ? "/"
            : /^[A-Za-z]:$/.test(before) && sep === "\\"
              ? `${before}\\`
              : before;
    const base = normalized.slice(sepIndex + 1);
    return { dir, base };
}

async function readJsonResponse<T extends JsonObject>(response: Response) {
    const text = await response.text();
    if (!text) return undefined;

    try {
        return JSON.parse(text) as T;
    } catch {
        return undefined;
    }
}

async function fetchDirectoryEntries(
    path: string,
    signal: AbortSignal,
): Promise<DirectoryEntry[]> {
    const response = await fetch(
        `/api/files?path=${encodeURIComponent(path)}`,
        {
            signal,
        },
    );
    const data = await readJsonResponse<{
        error?: string;
        type?: "file" | "directory";
        children?: Array<{ name: string; path: string; type: string }>;
    }>(response);

    if (!response.ok) {
        throw new Error(
            data?.error || response.statusText || "Failed to scan directory",
        );
    }

    if (data?.type !== "directory") return [];

    const children = Array.isArray(data.children) ? data.children : [];
    return children
        .filter((child) => child?.type === "directory")
        .map((child) => ({ name: child.name, path: child.path }));
}

async function ensureWorkspaceDirectory(path: string, createIfMissing = false) {
    const normalizedPath = normalizeWorkspacePath(path);
    if (!normalizedPath) throw new Error("Path is required");

    const response = await fetch("/api/files/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: normalizedPath, createIfMissing }),
    });
    const data = await readJsonResponse<{ error?: string; path?: string }>(
        response,
    );

    if (!response.ok) {
        throw new Error(
            data?.error || response.statusText || "Failed to open workspace",
        );
    }

    return data?.path || normalizedPath;
}

async function createWorkspaceSession(path: string) {
    const normalizedPath = normalizeWorkspacePath(path);
    if (!normalizedPath) throw new Error("Path is required");

    const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: normalizedPath, createIfMissing: true }),
    });
    const data = await readJsonResponse<{
        ok?: boolean;
        error?: string;
        id?: string;
        workspace?: string;
    }>(response);

    if (!response.ok || !data?.ok || !data.id) {
        throw new Error(
            data?.error || response.statusText || "Failed to create session",
        );
    }

    return { id: data.id, workspace: data.workspace };
}

export default function ChatCreation({ refetch }: ChatCreationProps) {
    const [open, setOpen] = useState(false);
    const [isCreatingSession, setIsCreatingSession] = useState(false);
    const [, setSession] = useSessionParam();

    const cacheRef = useRef(new Map<string, DirectoryEntry[]>());
    const abortRef = useRef<AbortController | null>(null);

    const [directoryItems, setDirectoryItems] = useState<PaletteItem[]>([]);
    const [contextDir, setContextDir] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [commandInputValue, setCommandInputValue] = useState("");

    const rawWorkspacePath = useMemo(
        () =>
            typeof commandInputValue === "string"
                ? commandInputValue.trim()
                : "",
        [commandInputValue],
    );

    const canCreateSession = rawWorkspacePath.length > 0 && !isCreatingSession;

    function handleCommandInputChange(nextValue: unknown) {
        if (typeof nextValue === "string") {
            setCommandInputValue(nextValue);
            return;
        }

        if (
            nextValue &&
            typeof nextValue === "object" &&
            "target" in nextValue &&
            (nextValue as { target?: { value?: unknown } }).target
        ) {
            const targetValue = (nextValue as { target?: { value?: unknown } })
                .target?.value;
            setCommandInputValue(
                typeof targetValue === "string" ? targetValue : "",
            );
            return;
        }

        setCommandInputValue("");
    }

    function setInputToDirectory(path: string) {
        const sep = inferSeparator(path);
        setCommandInputValue(`${trimTrailingSeparators(path)}${sep}`);
        setScanError(null);
    }

    async function openDirectory(path: string) {
        if (!path.trim() || isLoading) return;

        try {
            setScanError(null);
            const finalPath = await ensureWorkspaceDirectory(path);
            setInputToDirectory(finalPath);
        } catch (error) {
            setScanError(
                error instanceof Error
                    ? error.message
                    : "Failed to open folder",
            );
        }
    }

    async function addWorkspaceSession() {
        if (!canCreateSession) return;

        try {
            setIsCreatingSession(true);
            setScanError(null);
            const nextSession = await createWorkspaceSession(rawWorkspacePath);
            await setSession(nextSession.id);
            await Promise.resolve(refetch?.());
            setOpen(false);
            setCommandInputValue("");
        } catch (error) {
            setScanError(
                error instanceof Error
                    ? error.message
                    : "Failed to create session",
            );
        } finally {
            setIsCreatingSession(false);
        }
    }

    function handleItemClick(item: PaletteItem) {
        setInputToDirectory(item.entry.path);
    }

    function handleCommandKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key !== "Enter" || event.shiftKey) return;
        if (isCreatingSession || !rawWorkspacePath) return;

        if (directoryItems.length > 0) return;

        event.preventDefault();
        void openDirectory(rawWorkspacePath);
    }

    useEffect(() => {
        const down = (e: globalThis.KeyboardEvent) => {
            if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    useEffect(() => {
        const raw = rawWorkspacePath;
        abortRef.current?.abort();

        if (!raw || !isPathLike(raw)) {
            setDirectoryItems([]);
            setContextDir(null);
            setIsLoading(false);
            setScanError(null);
            return;
        }

        setScanError(null);

        const endsWithSeparator = /[\\/]+$/.test(raw);
        const controller = new AbortController();
        abortRef.current = controller;
        const signal = controller.signal;

        async function listFromCacheOrFetch(path: string) {
            const normalizedPath = trimTrailingSeparators(path);
            const cached = cacheRef.current.get(normalizedPath);
            if (cached) return cached;
            const fetched = await fetchDirectoryEntries(normalizedPath, signal);
            cacheRef.current.set(normalizedPath, fetched);
            return fetched;
        }

        async function run() {
            setIsLoading(true);
            try {
                if (endsWithSeparator) {
                    const scanPath = trimTrailingSeparators(raw);
                    const entries = await listFromCacheOrFetch(scanPath);
                    setContextDir(scanPath);
                    setDirectoryItems(
                        entries.map((entry) => ({
                            kind: "directory" as const,
                            key: `dir:${entry.path}`,
                            entry,
                            keywords: [entry.name, entry.path],
                        })),
                    );
                    return;
                }

                const { dir: parentDir, base: fragment } = splitPath(raw);
                if (!parentDir) {
                    setContextDir(null);
                    setDirectoryItems([]);
                    return;
                }

                const parentEntries = await listFromCacheOrFetch(parentDir);
                const exactMatch = parentEntries.find(
                    (entry) => entry.name === fragment,
                );

                if (exactMatch) {
                    const childEntries = await listFromCacheOrFetch(
                        exactMatch.path,
                    );
                    setContextDir(exactMatch.path);
                    setDirectoryItems(
                        childEntries.map((entry) => ({
                            kind: "directory" as const,
                            key: `dir:${entry.path}`,
                            entry,
                            keywords: [entry.name, entry.path],
                        })),
                    );
                    return;
                }

                const query = fragment.toLowerCase();
                const filtered = query
                    ? parentEntries.filter((entry) =>
                          entry.name.toLowerCase().includes(query),
                      )
                    : parentEntries;

                setContextDir(trimTrailingSeparators(parentDir));
                setDirectoryItems(
                    filtered.map((entry) => ({
                        kind: "directory" as const,
                        key: `dir:${entry.path}`,
                        entry,
                        keywords: [entry.name, entry.path],
                    })),
                );
            } catch (error) {
                if (signal.aborted) return;
                setContextDir(null);
                setDirectoryItems([]);
                setScanError(
                    error instanceof Error
                        ? error.message
                        : "Failed to scan directory",
                );
            } finally {
                if (signal.aborted) return;
                setIsLoading(false);
            }
        }

        void run();

        return () => {
            abortRef.current?.abort();
        };
    }, [rawWorkspacePath]);

    const groupsToRender: Group[] = useMemo(() => {
        if (!contextDir || directoryItems.length === 0) return [];
        return [{ value: contextDir, items: directoryItems }];
    }, [contextDir, directoryItems]);

    return (
        <Fragment>
            <CommandDialog
                onOpenChange={(open) => {
                    setOpen(open);
                    if (!open) {
                        setCommandInputValue("");
                        setScanError(null);
                    }
                }}
                open={open}
            >
                <CommandDialogTrigger
                    render={<Button variant="outline" size="icon-sm" />}
                >
                    <Plus />
                </CommandDialogTrigger>
                <CommandDialogPopup>
                    <Command items={groupsToRender}>
                        <CommandInput
                            placeholder="Type a folder path..."
                            value={commandInputValue}
                            onChange={handleCommandInputChange}
                            onKeyDown={handleCommandKeyDown}
                        />
                        <CommandPanel>
                            <CommandEmpty>
                                {isLoading ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : scanError ? (
                                    <span className="text-destructive">
                                        {scanError}
                                    </span>
                                ) : rawWorkspacePath ? (
                                    "No folders found. Press Add to create a session here."
                                ) : (
                                    "Enter an absolute folder path to browse."
                                )}
                            </CommandEmpty>
                            <CommandList className="max-h-56">
                                {(group: Group) => (
                                    <CommandGroup
                                        key={group.value}
                                        items={group.items}
                                    >
                                        <CommandGroupLabel>
                                            {group.value}
                                        </CommandGroupLabel>
                                        <CommandCollection>
                                            {(item: PaletteItem) => (
                                                <CommandItem
                                                    key={item.key}
                                                    value={item.entry.name}
                                                    onClick={() =>
                                                        handleItemClick(item)
                                                    }
                                                    className="flex gap-2"
                                                >
                                                    <Folder className="size-4 text-muted-foreground" />
                                                    <span className="truncate flex-1">
                                                        {item.entry.name}
                                                    </span>
                                                    <span className="ml-auto truncate text-xs text-muted-foreground">
                                                        {item.entry.path}
                                                    </span>
                                                </CommandItem>
                                            )}
                                        </CommandCollection>
                                    </CommandGroup>
                                )}
                            </CommandList>
                        </CommandPanel>
                        <CommandFooter>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <KbdGroup>
                                        <Kbd>
                                            <ArrowUpIcon />
                                        </Kbd>
                                        <Kbd>
                                            <ArrowDownIcon />
                                        </Kbd>
                                    </KbdGroup>
                                    <span>Navigate</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Kbd>
                                        <CornerDownLeftIcon />
                                    </Kbd>
                                    <span>Open folder</span>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => void addWorkspaceSession()}
                                disabled={!canCreateSession}
                            >
                                {isCreatingSession ? "Adding..." : "Add"}
                            </Button>
                        </CommandFooter>
                    </Command>
                </CommandDialogPopup>
            </CommandDialog>
        </Fragment>
    );
}
