"use client";

import { Folder, FolderOpen, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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
    }
  | {
      kind: "directory";
      key: string;
      entry: DirectoryEntry;
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
  const data = (await response.json()) as
    | {
        error?: string;
        type?: "file" | "directory";
        children?: Array<{ name: string; path: string; type: string }>;
      }
    | undefined;

  if (!response.ok) {
    throw new Error(data?.error || "Failed to scan directory");
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
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const listRef = useRef<HTMLDivElement>(null);

  const hasItems = items.length > 0;

  const activeKey = useMemo(() => {
    if (activeIndex < 0 || activeIndex >= items.length) return null;
    return items[activeIndex]?.key ?? null;
  }, [activeIndex, items]);

  useEffect(() => {
    if (!activeKey || !listRef.current) return;
    const escapedKey =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(activeKey)
        : activeKey.replace(/["\\]/g, "\\$&");
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-palette-key="${escapedKey}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  useEffect(() => {
    const raw = value.trim();
    setActiveIndex(-1);
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
          const exactMatch = parentEntries.find((entry) => entry.name === fragment);

          if (exactMatch) {
            const childEntries = await listFromCacheOrFetch(exactMatch.path);
            setContextDir(exactMatch.path);
            setItems([
              {
                kind: "use-current" as const,
                key: `use:${exactMatch.path}`,
                label: `Use "${exactMatch.name}"`,
                path: exactMatch.path,
              },
              ...childEntries.map((entry) => ({
                kind: "directory" as const,
                key: `dir:${entry.path}`,
                entry,
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

      run();
    }, 120);

    return () => {
      window.clearTimeout(debounce);
      abortRef.current?.abort();
    };
  }, [value]);

  function acceptItem(item: PaletteItem) {
    if (item.kind === "use-current") {
      onValueChange(item.path);
      return;
    }

    const sep = inferSeparator(item.entry.path);
    onValueChange(`${trimTrailingSeparators(item.entry.path)}${sep}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!hasItems) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev < 0 ? 0 : (prev + 1) % items.length));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) =>
        prev < 0 ? items.length - 1 : (prev - 1 + items.length) % items.length,
      );
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) acceptItem(item);
      return;
    }

    if (event.key === "Escape" && activeIndex >= 0) {
      event.preventDefault();
      setActiveIndex(-1);
    }
  }

  return (
    <div className="space-y-2">
      <Input
        autoFocus={autoFocus}
        value={value}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          onValueChange(event.target.value);
          if (errorMessage) onClearError?.();
        }}
        placeholder={placeholder}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={errorMessage ? "workspace-path-error" : undefined}
      />

      {errorMessage ? (
        <p id="workspace-path-error" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : scanError ? (
        <p className="text-sm text-destructive">{scanError}</p>
      ) : null}

      <div
        className={cn(
          "rounded-md border bg-card/30",
          !value.trim() && "hidden",
        )}>
        <div className="flex items-center justify-between gap-2 border-b px-2 py-1 text-xs text-muted-foreground">
          <div className="min-w-0 truncate">
            {contextDir ? `Folders in: ${contextDir}` : "Folders"}
          </div>
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : null}
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-label="Directory suggestions"
          className="max-h-56 overflow-y-auto p-1">
          {items.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No folders found.
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item, index) => {
                const isActive = index === activeIndex;

                if (item.kind === "use-current") {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      data-palette-key={item.key}
                      role="option"
                      aria-selected={isActive}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        "hover:bg-accent/60",
                        isActive && "bg-accent",
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => acceptItem(item)}>
                      <FolderOpen className="size-4 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                }

                return (
                  <button
                    key={item.key}
                    type="button"
                    data-palette-key={item.key}
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      "hover:bg-accent/60",
                      isActive && "bg-accent",
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => acceptItem(item)}>
                    <Folder className="size-4 text-muted-foreground" />
                    <span className="truncate">{item.entry.name}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {item.entry.path}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!errorMessage ? (
        <p className="text-xs text-muted-foreground">
          Tip: use ↑/↓ to navigate, Enter to pick a folder.
        </p>
      ) : null}
    </div>
  );
}
