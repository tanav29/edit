"use client";

import { Loader2, X } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.Editor })),
);

const LARGE_FILE_BYTES = 200_000;

interface FileViewerProps {
  filePath: string;
  onClose: () => void;
}

export function FileViewer({ filePath, onClose }: FileViewerProps) {
  const [forceEditor, setForceEditor] = useState(false);
  const extension = filePath.split(".").pop() || "";
  const language =
    extension === "ts" || extension === "tsx"
      ? "typescript"
      : extension === "js" || extension === "jsx"
        ? "javascript"
        : extension === "json"
          ? "json"
          : extension === "md"
            ? "markdown"
            : extension === "css"
              ? "css"
              : extension === "html"
                ? "html"
                : "text";

  const {
    data: content,
    isLoading: loading,
    isError,
    error,
  } = useQuery<string, Error>({
    queryKey: ["files", filePath],
    queryFn: async () => {
      const res = await fetch(
        `/api/files/content?path=${encodeURIComponent(filePath)}`,
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Failed to load file");
      }

      const data = (await res.json()) as { content: string };
      return data.content;
    },
    enabled: Boolean(filePath),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  const isLargeFile = useMemo(
    () => (content?.length || 0) > LARGE_FILE_BYTES,
    [content],
  );

  return (
    <div className="flex flex-col h-full bg-background border rounded-xl overflow-hidden shadow-lg">
      <div className="absolute right-3 top-3 z-20">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Close file viewer"
              className="size-8 rounded-full bg-background/90"
              onClick={onClose}>
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Close</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span>Loading file content...</span>
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-full text-destructive text-xs">
            {error.message}
          </div>
        ) : isLargeFile && !forceEditor ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
              <span>Large file preview</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setForceEditor(true)}>
                Open full editor
              </Button>
            </div>
            <pre className="h-full overflow-auto p-4 font-mono text-xs leading-5">
              {content || ""}
            </pre>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Loading editor...
              </div>
            }>
            <MonacoEditor
              key={filePath}
              height="100%"
              language={language}
              value={content || ""}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "var(--font-geist-mono), monospace",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 16, bottom: 16 },
                smoothScrolling: false,
                cursorSmoothCaretAnimation: "off",
              }}
            />
          </Suspense>
        )}
      </div>
      <div className="p-2 border-t bg-muted/10">
        <div className="text-[10px] text-muted-foreground truncate">
          {filePath}
        </div>
      </div>
    </div>
  );
}
