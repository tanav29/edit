import { useTerminal as useTerminalStore } from "@/store/store";
import { Terminal, useTerminal } from "@wterm/react";
import { useCallback, useRef } from "react";
import type { WTerm } from "@wterm/dom";
import { cn } from "@/lib/utils";
import "@wterm/react/css";

export default function BottomTerminal() {
    const { ref, write } = useTerminal();
    const [term] = useTerminalStore();
    const wsRef = useRef<WebSocket | null>(null);

    const handleReady = useCallback(
        (wt: WTerm) => {
            const ws = new WebSocket("ws://localhost:5173/api/terminal");
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
        [write],
    );

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
        <aside
            className={cn(
                "flex w-full shrink-0 flex-col border-t bg-card/30",
                term
                    ? "h-108 translate-x-0 opacity-100"
                    : "h-0 -translate-x-3 opacity-0 overflow-hidden border-r-0 pointer-events-none",
            )}
        >
            <Terminal
                theme="monokai"
                ref={ref}
                autoResize
                cursorBlink
                className="h-full"
                onReady={handleReady}
                onResize={handleResize}
                onData={handleData}
                cols={80}
                rows={24}
                style={{ borderRadius: 0, boxShadow: "none", padding: 0 }}
            />
        </aside>
    );
}
