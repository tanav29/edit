"use client";

import { File, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Editor } from "@monaco-editor/react";
import { useQuery } from "@tanstack/react-query";

interface FileViewerProps {
  filePath: string;
  onClose: () => void;
}

export function FileViewer({ filePath, onClose }: FileViewerProps) {
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
    isError: error,
  } = useQuery({
    queryKey: ["files", filePath],
    queryFn: async () => {
      const res = await fetch(
        `/api/files/content?path=${encodeURIComponent(filePath)}`,
      );
      if (!res.ok) throw new Error("Failed to load file");
      const data = await res.json();
      return data;
    },
  });

  return (
    <div className="flex flex-col h-full bg-background border rounded-xl overflow-hidden shadow-2xl">
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span>Loading file content...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive text-xs">
            {error}
          </div>
        ) : (
          <Editor
            height="100%"
            defaultLanguage={language}
            value={content || ""}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 16, bottom: 16 },
            }}
          />
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
