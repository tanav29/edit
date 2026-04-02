"use client";

import { useEffect, useMemo } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import { FileDiff, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type SessionFileDiff = {
  filePath: string;
  patch: string;
  edits: number;
  action: "created" | "edited";
  additions: number;
  deletions: number;
  updatedAt: number;
};

type SessionDiffDrawerProps = {
  isOpen: boolean;
  diffs: SessionFileDiff[];
  selectedFilePath?: string;
  onClose: () => void;
  onSelectFile: (path: string) => void;
};

export default function SessionDiffDrawer({
  isOpen,
  diffs,
  selectedFilePath,
  onClose,
  onSelectFile,
}: SessionDiffDrawerProps) {
  const sortedDiffs = useMemo(
    () => [...diffs].sort((a, b) => b.updatedAt - a.updatedAt),
    [diffs],
  );

  const selectedDiff = useMemo(() => {
    if (sortedDiffs.length === 0) return null;
    if (!selectedFilePath) return sortedDiffs[0];
    return (
      sortedDiffs.find((item) => item.filePath === selectedFilePath) ??
      sortedDiffs[0]
    );
  }, [selectedFilePath, sortedDiffs]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 bottom-0 z-40 w-[min(58vw,820px)] min-w-[380px] rounded-l-xl border border-border/80 bg-background/96 backdrop-blur transition-transform duration-300 ease-out",
        isOpen ? "translate-x-0" : "pointer-events-none translate-x-[110%]",
      )}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileDiff className="size-4 text-muted-foreground" />
            Session diffs
            <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {sortedDiffs.length} file{sortedDiffs.length === 1 ? "" : "s"}
            </span>
          </div>
          <Button variant="outline" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {sortedDiffs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            No file edits in this session yet.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 px-2 py-2">
              {sortedDiffs.map((item) => {
                const isSelected = item.filePath === selectedDiff?.filePath;
                return (
                  <button
                    key={item.filePath}
                    type="button"
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                      isSelected
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border/70 text-muted-foreground hover:bg-accent/60",
                    )}
                    onClick={() => onSelectFile(item.filePath)}>
                    <span className="max-w-80 truncate">{item.filePath}</span>
                    <span className="text-[10px] opacity-70">
                      +{item.additions} -{item.deletions}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2">
              {selectedDiff ? <PatchDiff patch={selectedDiff.patch} /> : null}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
