import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { useCallback, useEffect, useRef, useState } from "react";

function TerminalPage() {
  const { ref, write, focus: focusTerminal } = useTerminal();
  const wsRef = useRef<WebSocket | null>(null);
  const readyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(`\x1b[RESIZE:${cols};${rows}]`);
    }
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      setError(null);
      if (readyRef.current && ref.current?.instance) {
        sendResize(ref.current.instance.cols, ref.current.instance.rows);
      }
      focusTerminal();
    };

    ws.onmessage = (event) => {
      write(event.data);
    };

    ws.onclose = () => {
      readyRef.current = false;
    };

    ws.onerror = () => {
      setError("WebSocket connection failed");
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [write, focusTerminal, sendResize, ref]);

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

  const handleError = useCallback((err: unknown) => {
    console.error("wterm init error:", err);
    setError(`Terminal init failed: ${err instanceof Error ? err.message : String(err)}`);
  }, []);

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground font-mono text-sm">
        <div className="text-center max-w-md p-8">
          <div className="text-destructive text-lg font-semibold mb-2">Error</div>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <Terminal
        ref={ref}
        autoResize
        cursorBlink
        className="h-full"
        onReady={handleReady}
        onResize={(cols, rows) => sendResize(cols, rows)}
        onData={handleData}
        onError={handleError}
      />
    </div>
  );
}

export const TerminalRouteComponent = TerminalPage;
