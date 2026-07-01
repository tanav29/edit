import {
    useTerminalStore,
    type TerminalTab,
} from "@/store/store";
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

function TerminalInstance({
    terminalTab,
    root,
    session,
}: {
    terminalTab: TerminalTab;
    root: string;
    session: string;
}) {
    const { ref, write } = useTerminal();
    const wsRef = useRef<WebSocket | null>(null);

    const handleReady = useCallback(
        (wt: WTerm) => {
            const ws = new WebSocket(
                wsUrl(
                    `/api/terminal?root=${encodeURIComponent(root)}&session=${encodeURIComponent(session)}&terminal=${encodeURIComponent(terminalTab.id)}`,
                ),
            );
            wsRef.current = ws;

            ws.onopen = () => {
                ws.send(`\x1b[RESIZE:${wt.cols};${wt.rows}]`);
            };

            ws.onmessage = (event: MessageEvent) => {
                write(event.data as string);
            };

            ws.onclose = () => {
                write("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
                wsRef.current = null;
            };
        },
        [write, root, session, terminalTab.id],
    );

    useEffect(() => {
        return () => {
            wsRef.current?.close();
            wsRef.current = null;
        };
    }, []);

    const handleData = useCallback((data: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(data);
        }
    }, []);

    const handleResize = useCallback((cols: number, rows: number) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(`\x1b[RESIZE:${cols};${rows}]`);
        }
    }, []);

    return (
        <Terminal
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
    );
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

    if (!root || !id) return null;

    return (
        <aside
            className={cn(
                "flex w-full shrink-0 flex-col border-t bg-card/30",
                visible && terminals.length > 0
                    ? "h-64 translate-x-0 opacity-100"
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
                                removeTerminal(tab.id);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
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
                {terminals.map((tab) => (
                    <div
                        key={tab.id}
                        className={cn(
                            "h-full",
                            tab.id === activeTerminalId
                                ? "block"
                                : "hidden",
                        )}
                    >
                        <TerminalInstance
                            terminalTab={tab}
                            root={root}
                            session={id}
                        />
                    </div>
                ))}
            </div>
        </aside>
    );
}
