"use client";

import { Folder, FolderOpen, Loader2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  Command,
  CommandCollection,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
} from "@/components/ui/command";

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

type WorkspaceDirectoryPaletteProps = {
  value: string;
  onValueChange: (nextValue: string) => void;
  onClearError?: () => void;
  errorMessage?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
};

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

export default function WorkspaceDirectoryPalette({
  value,
  onValueChange,
  onClearError,
  errorMessage,
  placeholder = "/absolute/path/to/project",
  autoFocus,
}: WorkspaceDirectoryPaletteProps) {
  const cacheRef = useRef(new Map<string, DirectoryEntry[]>());
  const abortRef = useRef<AbortController | null>(null);

  const [items, setItems] = useState<PaletteItem[]>([]);
  const [contextDir, setContextDir] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [rawQuery, setRawQuery] = useState(value);

  useEffect(() => {
    const raw = value.trim();
    setScanError(null);

    abortRef.current?.abort();

    if (!raw) {
      setItems([]);
      setContextDir(null);
      setIsLoading(false);
      return;
    }

    const endsWithSeparator = /[\\/]+$/.test(raw);
    const debounce = window.setTimeout(() => {
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
            setItems(
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
            setItems([]);
            return;
          }

          const parentEntries = await listFromCacheOrFetch(parentDir);
          const exactMatch = parentEntries.find(
            (entry) => entry.name === fragment,
          );

          if (exactMatch) {
            const childEntries = await listFromCacheOrFetch(exactMatch.path);
            setContextDir(exactMatch.path);
            setItems([
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
          setItems(
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
          setItems([]);
          setScanError(
            error instanceof Error ? error.message : "Failed to scan directory",
          );
        } finally {
          if (signal.aborted) return;
          setIsLoading(false);
        }
      }

      void run();
    }, 120);

    return () => {
      window.clearTimeout(debounce);
      abortRef.current?.abort();
    };
  }, [value]);

  const commandItems = useMemo(() => {
    if (!items.length) return [];

    const groupValue = contextDir || "Folders";
    const filteredItems = contextDir
      ? items
      : items.filter((item) => item.kind === "directory");

    return [
      {
        value: groupValue,
        items: filteredItems,
      },
    ];
  }, [items, contextDir]);

  function acceptItem(item: PaletteItem) {
    if (item.kind === "use-current") {
      onValueChange(item.path);
      return;
    }

    const sep = inferSeparator(item.entry.path);
    onValueChange(`${trimTrailingSeparators(item.entry.path)}${sep}`);
  }

  return (
    <Command items={isLoading ? [] : commandItems}>
      <CommandInput
        autoFocus={autoFocus}
        value={rawQuery}
        onChange={(v) => {
          setRawQuery(v);
          onValueChange(v);
          if (errorMessage) onClearError?.();
        }}
        placeholder={placeholder}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={errorMessage ? "workspace-path-error" : undefined}
      />
      <CommandPanel>
        <CommandEmpty>No folders found.</CommandEmpty>
        <CommandList className={cn(!value.trim() && "hidden", "max-h-56")}>
          {(group: { value: string; items: PaletteItem[] }, index: number) => (
            <Fragment>
              <CommandGroup items={group.items}>
                <CommandGroupLabel>{group.value}</CommandGroupLabel>
                <CommandCollection>
                  {(item: PaletteItem) => (
                    <CommandItem
                      key={item.key}
                      value={
                        item.kind === "use-current"
                          ? item.label
                          : item.entry.name
                      }
                      onClick={() => acceptItem(item)}
                    >
                      {item.kind === "use-current" ? (
                        <div className="gap-2 flex">
                          <FolderOpen className="size-4 text-muted-foreground" />
                          <span className="truncate">sd{item.label}</span>
                          <span className="ml-auto truncate text-xs text-muted-foreground">
                            {item.path}
                          </span>
                        </div>
                      ) : (
                        <div className="gap-2 flex">
                          <Folder className="size-4 text-muted-foreground" />
                          <span className="truncate">{item.entry.name}</span>
                          <span className="ml-auto truncate text-xs text-muted-foreground">
                            {item.entry.path}
                          </span>
                        </div>
                      )}
                    </CommandItem>
                  )}
                </CommandCollection>
              </CommandGroup>
              {index < commandItems.length - 1 && <CommandSeparator />}
            </Fragment>
          )}
        </CommandList>
      </CommandPanel>
    </Command>
  );
}
