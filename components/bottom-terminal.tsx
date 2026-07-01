import { useTerminalStore } from "@/store/store";
import { Terminal, useTerminal } from "@wterm/react";
import { useCallback, useEffect, useRef } from "react";
import type { WTerm } from "@wterm/dom";
import { cn } from "@/lib/utils";
import { X, Plus } from "lucide-react";
import "@wterm/react/css";

function wsUrl(path: string): string {
    if (typeof window === "undefined") return path;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${path}`;
}

export default function BottomTerminal({
    root,
    id,
}: {
    root: string | null;
    id: string | undefined;
}) {
    const visible = useTerminalStore((s) => s.visible);
    const terminals = useTerminalStore((s) => s.terminals);
    const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
    const addTerminal = useTerminalStore((s) => s.addTerminal);
    const removeTerminal = useTerminalStore((s) => s.removeTerminal);
    const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);

    const { ref, write } = useTerminal();
    const writeRef = useRef(write);
    writeRef.current = write;

    const activeTabRef = useRef(activeTerminalId);
    activeTabRef.current = activeTerminalId;

    const wsRefs = useRef<Map<string, WebSocket>>(new Map());
    const buffersRef = useRef<Map<string, string>>(new Map());
    const wtRef = useRef<WTerm | null>(null);

    function connectTab(tabId: string) {
        if (!root || !id) return;
        const existing = wsRefs.current.get(tabId);
        if (
            existing &&
            (existing.readyState === WebSocket.OPEN ||
                existing.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        const ws = new WebSocket(
            wsUrl(
                `/api/terminal?root=${encodeURIComponent(root)}&session=${encodeURIComponent(id)}&terminal=${encodeURIComponent(tabId)}`,
            ),
        );

        ws.onopen = () => {
            const wt = wtRef.current;
            if (wt) {
                ws.send(`\x1b[RESIZE:${wt.cols};${wt.rows}]`);
            }
        };

        ws.onmessage = (event: MessageEvent) => {
            const data = event.data as string;
            const buf = buffersRef.current.get(tabId) ?? "";
            buffersRef.current.set(tabId, buf + data);
            if (tabId === activeTabRef.current) {
                writeRef.current(data);
            }
        };

        ws.onclose = () => {
            wsRefs.current.delete(tabId);
            if (tabId === activeTabRef.current) {
                writeRef.current("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
            }
        };

        wsRefs.current.set(tabId, ws);
    }

    function disconnectTab(tabId: string) {
        const ws = wsRefs.current.get(tabId);
        if (ws) {
            ws.close();
            wsRefs.current.delete(tabId);
        }
        buffersRef.current.delete(tabId);
    }

    const handleReady = useCallback(
        (wt: WTerm) => {
            wtRef.current = wt;

            for (const tab of terminals) {
                connectTab(tab.id);
            }

            const buffer = buffersRef.current.get(activeTerminalId ?? "");
            if (buffer) {
                writeRef.current(buffer);
            }
        },
        // Intentionally stable - only recreate when root/id changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [root, id],
    );

    const handleData = useCallback((data: string) => {
        const tabId = activeTabRef.current;
        if (!tabId) return;
        const ws = wsRefs.current.get(tabId);
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    }, []);

    const handleResize = useCallback((cols: number, rows: number) => {
        const tabId = activeTabRef.current;
        if (!tabId) return;
        const ws = wsRefs.current.get(tabId);
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(`\x1b[RESIZE:${cols};${rows}]`);
        }
    }, []);

    // Connect new tabs when they appear (e.g., user clicks +)
    useEffect(() => {
        if (!root || !id) return;
        for (const tab of terminals) {
            connectTab(tab.id);
        }
    }, [terminals, root]);

    // Cleanup all connections on unmount or when workspace root changes
    useEffect(() => {
        return () => {
            for (const [tabId, ws] of wsRefs.current.entries()) {
                ws.close();
            }
            wsRefs.current.clear();
            buffersRef.current.clear();
        };
    }, [root]);

    if (!root || !id) return null;

    return (
        <aside
            className={cn(
                "flex w-full shrink-0 flex-col border-t bg-card/30",
                visible && terminals.length > 0
                    ? "h-72 translate-x-0 opacity-100"
                    : "h-0 -translate-x-3 opacity-0 overflow-hidden border-r-0 pointer-events-none",
            )}
        >
            <div className="flex items-center border-b bg-muted/20 px-1 shrink-0">
                {terminals.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTerminal(tab.id)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border-r transition-colors",
                            tab.id === activeTerminalId
                                ? "bg-background text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                        )}
                    >
                        <span>{tab.label}</span>
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                                e.stopPropagation();
                                disconnectTab(tab.id);
                                removeTerminal(tab.id);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    disconnectTab(tab.id);
                                    removeTerminal(tab.id);
                                }
                            }}
                            className="ml-0.5 rounded p-0.5 hover:bg-muted-foreground/20"
                        >
                            <X className="size-3" />
                        </span>
                    </button>
                ))}
                <button
                    type="button"
                    onClick={addTerminal}
                    className="flex items-center px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    title="New terminal"
                >
                    <Plus className="size-3.5" />
                </button>
            </div>
            <div className="flex-1 min-h-0">
                <Terminal
                    key={activeTerminalId ?? "none"}
                    ref={ref}
                    autoResize
                    cursorBlink
                    rows={24}
                    cols={80}
                    className="h-full"
                    onReady={handleReady}
                    onResize={handleResize}
                    onData={handleData}
                    style={{ borderRadius: 0, boxShadow: "none", padding: 0 }}
                />
            </div>
        </aside>
    );
}
