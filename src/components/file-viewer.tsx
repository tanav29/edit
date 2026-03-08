"use client"

import { Suspense, lazy, useEffect, useState } from "react"
import { File, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { readFileContent } from "@/lib/tauri-api"

const MonacoEditor = lazy(async () => {
  const mod = await import("@monaco-editor/react")
  return { default: mod.Editor }
})

interface FileViewerProps {
  filePath: string
  onClose: () => void
}

export function FileViewer({ filePath, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const extension = filePath.split(".").pop() || ""
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
                : "text"

  useEffect(() => {
    async function fetchFile() {
      setLoading(true)
      setError(null)
      try {
        const data = await readFileContent(filePath)
        setContent(data.content)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load file")
      } finally {
        setLoading(false)
      }
    }

    fetchFile()
  }, [filePath])

  return (
    <div className="flex flex-col h-full bg-background border rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <File className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{filePath.split("/").pop()}</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} className="size-7">
          <X className="size-4" />
        </Button>
      </div>
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
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                Loading editor...
              </div>
            }>
            <MonacoEditor
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
          </Suspense>
        )}
      </div>
      <div className="p-2 border-t bg-muted/10">
        <div className="text-[10px] text-muted-foreground truncate">
          {filePath}
        </div>
      </div>
    </div>
  )
}
