import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { useTerminal as useTerminalStore } from "@/store/store";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const TERMINAL_HEIGHT = 200;

export default function BottomTerminal() {
    const { ref, write, focus: focusTerminal } = useTerminal();
    const [term] = useTerminalStore();
    const wsRef = useRef<WebSocket | null>(null);
    const readyRef = useRef(false);

    const sendResize = useCallback((cols: number, rows: number) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(`\x1b[RESIZE:${cols};${rows}]`);
        }
    }, []);

    useEffect(() => {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
            `${protocol}//${window.location.host}/api/terminal`,
        );
        wsRef.current = ws;

        ws.onopen = () => {
            if (readyRef.current && ref.current?.instance) {
                ws.send(
                    `\x1b[RESIZE:${ref.current.instance.cols};${ref.current.instance.rows}]`,
                );
            }
            focusTerminal();
        };

        ws.onmessage = (event) => {
            write(event.data);
        };

        ws.onclose = () => {
            readyRef.current = false;
        };

        ws.onerror = () => {};

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, [write, focusTerminal, ref]);

    const handleData = useCallback(
        (data: string) => {
            if (data === "\r") {
                write("\r\n");
            } else {
                write(data);
            }
            const ws = wsRef.current;
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        },
        [write],
    );

    const handleReady = useCallback(
        (wt: { cols: number; rows: number }) => {
            readyRef.current = true;
            sendResize(wt.cols, wt.rows);
            focusTerminal();
        },
        [sendResize, focusTerminal],
    );

    const handleResize = useCallback(
        (cols: number, rows: number) => sendResize(cols, rows),
        [sendResize],
    );

    const handleError = useCallback(() => {}, []);

    return (
        <aside
            className={cn(
                "flex w-full shrink-0 flex-col border-t bg-card/30",
                term
                    ? "h-64 translate-x-0 opacity-100"
                    : "h-0 -translate-x-3 opacity-0 overflow-hidden border-r-0 pointer-events-none",
            )}
        >
            <Terminal
                theme="defaul"
                ref={ref}
                autoResize
                cursorBlink
                className="h-full"
                onReady={handleReady}
                onResize={handleResize}
                onData={handleData}
                onError={handleError}
            />
        </aside>
    );
}
