import { useEffect, useState, useRef, useCallback } from "react";

export const wsUrl =
    typeof window !== "undefined"
        ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/ws`
        : "";

export const useWebSocket = (url: string) => {
    const [lastMessage, setLastMessage] = useState<Record<
        string,
        unknown
    > | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    const connect = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) return;

        ws.current = new WebSocket(url);

        ws.current.onopen = () => setIsConnected(true);

        ws.current.onclose = () => {
            setIsConnected(false);
            reconnectTimeout.current = setTimeout(connect, 3000);
        };

        ws.current.onerror = () => {
            ws.current?.close();
        };

        ws.current.onmessage = (event) => {
            setLastMessage(JSON.parse(event.data));
        };
    }, [url]);

    useEffect(() => {
        connect();

        return () => {
            clearTimeout(reconnectTimeout.current);
            if (ws.current) {
                ws.current.onclose = null;
                ws.current.close();
                ws.current = null;
            }
        };
    }, [connect]);

    const sendMessage = useCallback((message: unknown) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(
                typeof message === "string" ? message : JSON.stringify(message),
            );
        } else {
            console.warn("WebSocket is not connected.");
        }
    }, []);

    return { lastMessage, isConnected, sendMessage };
};
