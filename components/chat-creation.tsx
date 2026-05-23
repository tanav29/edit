import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CornerDownLeftIcon,
  Folder,
  FolderOpen,
  Loader2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";
import WorkspaceDirectoryPalette from "@/components/workspace-directory-palette";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { api } from "@/lib/eden";
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
  CommandSeparator,
  CommandShortcut,
} from "./ui/command";
import { Kbd, KbdGroup } from "./ui/kbd";

type ChatCreationProps = {
  refetch?: () => void | Promise<unknown>;
};

type Item = {
  label: string;
  shortcut?: string;
  value: string;
};

type Group = {
  value: string;
  items: AnyItem[];
};

type DirectoryEntry = {
  name: string;
  path: string;
};

type PaletteItem =
  | {
      kind: "use-current";
      key: string;
      label: string;
      path: string;
      keywords: string[];
    }
  | {
      kind: "directory";
      key: string;
      entry: DirectoryEntry;
      keywords: string[];
    };

type AnyItem = Item | PaletteItem;

export const suggestions: Item[] = [
  { label: "Linear", shortcut: "⌘L", value: "linear" },
  { label: "Figma", shortcut: "⌘F", value: "figma" },
  { label: "Slack", shortcut: "⌘S", value: "slack" },
  { label: "YouTube", shortcut: "⌘Y", value: "youtube" },
  { label: "Raycast", shortcut: "⌘R", value: "raycast" },
];
export const commands: Item[] = [
  { label: "Clipboard History", shortcut: "⌘⇧C", value: "clipboard-history" },
  { label: "Import Extension", shortcut: "⌘I", value: "import-extension" },
  { label: "Create Snippet", shortcut: "⌘N", value: "create-snippet" },
  { label: "System Preferences", shortcut: "⌘,", value: "system-preferences" },
  { label: "Window Management", shortcut: "⌘⇧W", value: "window-management" },
];
function inferSeparator(path: string) {
  return path.includes("\\") ? "\\" : "/";
}

function trimTrailingSeparators(path: string) {
  const trimmed = path.trim();
  if (trimmed === "/" || /^[A-Za-z]:[\\/]+$/.test(trimmed)) return trimmed;
  return trimmed.replace(/[\\/]+$/g, "");
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

async function fetchDirectoryEntries(
  path: string,
  signal: AbortSignal,
): Promise<DirectoryEntry[]> {
  const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
    signal,
  });
  const text = await response.text();
  let data:
    | {
        error?: string;
        type?: "file" | "directory";
        children?: Array<{ name: string; path: string; type: string }>;
      }
    | undefined;

  if (text) {
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      data = undefined;
    }
  }

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

export default function ChatCreation({ refetch }: ChatCreationProps) {
  const [open, setOpen] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatWorkspacePath, setNewChatWorkspacePath] = useState("");
  const [newChatWorkspaceError, setNewChatWorkspaceError] = useState<
    string | null
  >(null);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [pendingWorkspacePath, setPendingWorkspacePath] = useState<string | null>(
    null,
  );
  const [, setSession] = useSessionParam();

  const cacheRef = useRef(new Map<string, DirectoryEntry[]>());
  const abortRef = useRef<AbortController | null>(null);

  const [directoryItems, setDirectoryItems] = useState<PaletteItem[]>([]);
  const [contextDir, setContextDir] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [commandInputValue, setCommandInputValue] = useState("");

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
      const targetValue = (nextValue as { target?: { value?: unknown } }).target
        ?.value;
      if (typeof targetValue === "string") {
        setCommandInputValue(targetValue);
        return;
      }
    }

    setCommandInputValue("");
  }

  function normalizeWorkspacePath(value: string) {
    const trimmed = value.trim();
    if (trimmed === "/" || /^[A-Za-z]:[\\/]+$/.test(trimmed)) return trimmed;
    return trimmed.replace(/[\\/]+$/g, "");
  }

  function handleNewChat(nextWorkspacePath?: string) {
    setNewChatWorkspacePath(nextWorkspacePath ?? "");
    setNewChatWorkspaceError(null);
    setIsNewChatModalOpen(true);
  }

  async function openWorkspacePath(
    nextWorkspacePath: string,
    createIfMissing = false,
  ) {
    const normalizedPath = normalizeWorkspacePath(nextWorkspacePath);
    if (!normalizedPath) return;

    const response = await fetch("/api/files/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: normalizedPath, createIfMissing }),
    });
    const text = await response.text();
    let data: { error?: string; path?: string } | undefined;

    if (text) {
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        data = undefined;
      }
    }

    if (!response.ok) {
      throw new Error(
        data?.error || response.statusText || "Failed to open workspace",
      );
    }

    const finalPath = data?.path || normalizedPath;
    const newSessionId = nanoid();
    await api.store.post({
      id: newSessionId,
      workspace: finalPath,
      messages: [],
    });
    setSession(newSessionId);
    await Promise.resolve(refetch?.());
  }

  function handleCloseNewChatModal() {
    if (isCreatingNewChat) return;
    setIsNewChatModalOpen(false);
    setNewChatWorkspaceError(null);
  }

  async function handleCreateNewChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextWorkspacePath = normalizeWorkspacePath(newChatWorkspacePath);
    if (!nextWorkspacePath || isCreatingNewChat) return;

    setIsCreatingNewChat(true);
    setNewChatWorkspaceError(null);

    try {
      await openWorkspacePath(nextWorkspacePath);

      setIsNewChatModalOpen(false);
      setNewChatWorkspaceError(null);
    } catch (error) {
      setNewChatWorkspaceError(
        error instanceof Error ? error.message : "Failed to open workspace",
      );
    } finally {
      setIsCreatingNewChat(false);
    }
  }

  function handleItemClick(item: AnyItem) {
    if ("kind" in item) {
      const paletteItem = item as PaletteItem;
      if (paletteItem.kind === "use-current") {
        handleNewChat(paletteItem.path);
        setOpen(false);
      } else if (paletteItem.kind === "directory") {
        const dirItem = paletteItem as Extract<PaletteItem, { kind: "directory" }>;
        const sep = inferSeparator(dirItem.entry.path);
        setCommandInputValue(`${trimTrailingSeparators(dirItem.entry.path)}${sep}`);
      }
      return;
    }

    const staticItem = item as Item;
    console.log("Static item clicked:", staticItem);
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const raw = typeof commandInputValue === "string" ? commandInputValue.trim() : "";
    abortRef.current?.abort();

    if (!raw) {
      setDirectoryItems([]);
      setContextDir(null);
      setIsLoading(false);
      setScanError(null);
      return;
    }

    const isPathQuery =
      raw.startsWith("/") ||
      raw.includes("\\") ||
      raw.includes("/") ||
      /^[A-Za-z]:[\\/]/.test(raw);

    if (!isPathQuery) {
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
          setContextDir(trimTrailingSeparators(scanPath));
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
        const exactMatch = parentEntries.find((entry) => entry.name === fragment);

        if (exactMatch) {
          const childEntries = await listFromCacheOrFetch(exactMatch.path);
          setContextDir(exactMatch.path);
          setDirectoryItems([
            {
              kind: "use-current" as const,
              key: `use:${exactMatch.path}`,
              label: `Use "${exactMatch.name}"`,
              path: exactMatch.path,
              keywords: [
                exactMatch.name,
                exactMatch.path,
                "use current folder",
              ],
            },
            ...childEntries.map((entry) => ({
              kind: "directory" as const,
              key: `dir:${entry.path}`,
              entry,
              keywords: [entry.name, entry.path],
            })),
          ]);
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
          error instanceof Error ? error.message : "Failed to scan directory",
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
  }, [commandInputValue]);

  const combinedGroups = useMemo(() => {
    const groups: Array<{ value: string; items: AnyItem[] }> = [
      { value: "Suggestions", items: suggestions as AnyItem[] },
      { value: "Commands", items: commands as AnyItem[] },
    ];
    if (directoryItems.length > 0 && contextDir) {
      groups.push({
        value: contextDir,
        items: directoryItems as AnyItem[],
      });
    }
    return groups;
  }, [directoryItems, contextDir]);

  const isPathQuery = useMemo(() => {
    const raw = typeof commandInputValue === "string" ? commandInputValue.trim() : "";
    return (
      raw.startsWith("/") ||
      raw.includes("\\") ||
      raw.includes("/") ||
      /^[A-Za-z]:[\\/]/.test(raw)
    );
  }, [commandInputValue]);

  const baseGroups: Group[] = [
    { value: "Suggestions", items: suggestions as AnyItem[] },
    { value: "Commands", items: commands as AnyItem[] },
  ];
  const groupsToRender = isPathQuery ? combinedGroups : baseGroups;

  return (
    <Fragment>
      <CommandDialog
        onOpenChange={(open) => {
          setOpen(open);
          if (!open) setCommandInputValue("");
        }}
        open={open}
      >
        <CommandDialogTrigger render={<Button variant="outline" size="icon" />}>
          <Plus />
        </CommandDialogTrigger>
        <CommandDialogPopup>
          <Command items={groupsToRender}>
            <CommandInput
              placeholder="Search apps, commands, or directories..."
              value={commandInputValue}
              onChange={handleCommandInputChange}
              onKeyDown={async (event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                if (isLoading || isCreatingNewChat) return;

                const raw =
                  typeof commandInputValue === "string"
                    ? commandInputValue.trim()
                    : "";
                if (!raw) return;

                event.preventDefault();

                try {
                  setIsCreatingNewChat(true);
                  setScanError(null);
                  await openWorkspacePath(raw);
                  setOpen(false);
                  setCommandInputValue("");
                  setPendingWorkspacePath(null);
                } catch (error) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Failed to open workspace";
                  setScanError(message);
                  if (message.toLowerCase().includes("not found")) {
                    setPendingWorkspacePath(raw);
                  } else {
                    setPendingWorkspacePath(null);
                  }
                } finally {
                  setIsCreatingNewChat(false);
                }
              }}
            />
            <CommandPanel>
              <CommandEmpty>
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : scanError ? (
                  <div className="flex flex-col items-start gap-2">
                    <span className="text-destructive">{scanError}</span>
                    {pendingWorkspacePath && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (isCreatingNewChat) return;
                          try {
                            setIsCreatingNewChat(true);
                            setScanError(null);
                            await openWorkspacePath(
                              pendingWorkspacePath,
                              true,
                            );
                            setOpen(false);
                            setCommandInputValue("");
                            setPendingWorkspacePath(null);
                          } catch (error) {
                            setScanError(
                              error instanceof Error
                                ? error.message
                                : "Failed to create workspace",
                            );
                          } finally {
                            setIsCreatingNewChat(false);
                          }
                        }}
                      >
                        Create folder and open
                      </Button>
                    )}
                  </div>
                ) : (
                  "No results found."
                )}
              </CommandEmpty>
              <CommandList className="max-h-56">
                {(group: Group, index: number) => (
                  <Fragment key={group.value}>
                    <CommandGroup items={group.items}>
                      <CommandGroupLabel>{group.value}</CommandGroupLabel>
                      <CommandCollection>
                        {(item: AnyItem) => {
                          if ("kind" in item) {
                            const paletteItem = item as PaletteItem;
                            if (paletteItem.kind === "use-current") {
                              return (
                                <CommandItem
                                  key={paletteItem.key}
                                  value={paletteItem.label}
                                  onClick={() => handleItemClick(paletteItem)}
                                >
                                  <FolderOpen className="size-4 text-muted-foreground" />
                                  <span className="truncate flex-1">
                                    {paletteItem.label}
                                  </span>
                                  <span className="ml-auto truncate text-xs text-muted-foreground">
                                    {paletteItem.path}
                                  </span>
                                </CommandItem>
                              );
                            }

                            const dirItem =
                              paletteItem as Extract<
                                PaletteItem,
                                { kind: "directory" }
                              >;
                            return (
                              <CommandItem
                                key={dirItem.key}
                                value={dirItem.entry.name}
                                onClick={() => handleItemClick(dirItem)}
                              >
                                <Folder className="size-4 text-muted-foreground" />
                                <span className="truncate flex-1">
                                  {dirItem.entry.name}
                                </span>
                                <span className="ml-auto truncate text-xs text-muted-foreground">
                                  {dirItem.entry.path}
                                </span>
                              </CommandItem>
                            );
                          }

                          const staticItem = item as Item;
                          return (
                            <CommandItem
                              key={staticItem.value}
                              onClick={() => handleItemClick(staticItem)}
                              value={staticItem.label}
                            >
                              <span className="flex-1">{staticItem.label}</span>
                              {staticItem.shortcut && (
                                <CommandShortcut>
                                  {staticItem.shortcut}
                                </CommandShortcut>
                              )}
                            </CommandItem>
                          );
                        }}
                      </CommandCollection>
                    </CommandGroup>
                    {index < groupsToRender.length - 1 && <CommandSeparator />}
                  </Fragment>
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
                  <span>Open</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Esc</Kbd>
                <span>Close</span>
              </div>
            </CommandFooter>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>
      <Dialog
        open={isNewChatModalOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleCloseNewChatModal();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New chat</DialogTitle>
            <DialogDescription>
              Choose a workspace folder for this chat session.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateNewChat}>
            <WorkspaceDirectoryPalette
              autoFocus
              value={newChatWorkspacePath}
              onValueChange={(nextValue) => setNewChatWorkspacePath(nextValue)}
              onClearError={() => setNewChatWorkspaceError(null)}
              errorMessage={newChatWorkspaceError}
            />
            {newChatWorkspaceError && (
              <p id="workspace-path-error" className="text-sm text-destructive">
                {newChatWorkspaceError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCloseNewChatModal}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreatingNewChat}>
                {isCreatingNewChat ? "Creating..." : "Create chat"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
}
