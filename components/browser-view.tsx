"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Globe, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BrowserView() {
    const [url, setUrl] = useState("https://example.com");
    const [src, setSrc] = useState("https://example.com");
    const [history, setHistory] = useState<string[]>(["https://example.com"]);
    const [historyIndex, setHistoryIndex] = useState(0);

    function navigate(to: string) {
        let resolved = to.trim();
        if (!resolved) return;
        if (!/^https?:\/\//i.test(resolved)) {
            resolved = "https://" + resolved;
        }
        setUrl(resolved);
        setSrc(resolved);
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(resolved);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        navigate(url);
    }

    function goBack() {
        if (historyIndex > 0) {
            const idx = historyIndex - 1;
            setHistoryIndex(idx);
            setSrc(history[idx]);
            setUrl(history[idx]);
        }
    }

    function goForward() {
        if (historyIndex < history.length - 1) {
            const idx = historyIndex + 1;
            setHistoryIndex(idx);
            setSrc(history[idx]);
            setUrl(history[idx]);
        }
    }

    function refresh() {
        setSrc((prev) => {
            const newSrc = prev.includes("?") ? prev + "&_t=" + Date.now() : prev + "?_t=" + Date.now();
            return newSrc;
        });
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-1 border-b px-2 py-1.5 shrink-0">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={goBack}
                    disabled={historyIndex <= 0}
                    aria-label="Go back"
                >
                    <ArrowLeft className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={goForward}
                    disabled={historyIndex >= history.length - 1}
                    aria-label="Go forward"
                >
                    <ArrowRight className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={refresh}
                    aria-label="Refresh"
                >
                    <RotateCw className="size-4" />
                </Button>
                <form onSubmit={handleSubmit} className="flex flex-1">
                    <div className="flex h-8 w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 text-sm">
                        <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSubmit(e);
                                }
                            }}
                            className="min-w-0 flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50"
                            placeholder="Enter URL..."
                        />
                    </div>
                </form>
            </div>
            <div className="flex-1 bg-white">
                <iframe
                    src={src}
                    className="h-full w-full"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    title="Browser preview"
                />
            </div>
        </div>
    );
}
