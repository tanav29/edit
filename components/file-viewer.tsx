"use client";

import { useQuery } from "@tanstack/react-query";
import { File } from "@pierre/diffs/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function getDisplayFileName(filePath: string) {
    const normalized = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
    return normalized.split("/").pop() || normalized;
}

export default function FileViewer({
    filePath,
    className,
}: {
    filePath: string;
    className?: string;
}) {
    const displayName = getDisplayFileName(filePath);

    const {
        data: content,
        isLoading,
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

    return (
        <div className={cn("flex-1 overflow-auto h-full", className)}>
            {isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">
                    Loading file content...
                </div>
            ) : isError ? (
                <div className="p-4 text-sm text-destructive">
                    {error.message || "Failed to load file"}
                </div>
            ) : content !== undefined ? (
                <File
                    file={{
                        name: displayName,
                        contents: content,
                    }}
                    className="border w-full h-full"
                    options={{
                        theme: "aurora-x",
                        unsafeCSS:
                            "* { font-family: var(--font-geist-mono), monospace !important; }",
                    }}
                />
            ) : (
                <div className="p-4 text-sm text-muted-foreground">
                    Select file preview.
                </div>
            )}
        </div>
    );
}
