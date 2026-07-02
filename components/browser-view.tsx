"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
    type MouseEvent,
    type TouchEvent,
    type WheelEvent,
} from "react";
import {
    ArrowLeft,
    ArrowRight,
    Globe,
    PlugZap,
    RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectionState =
    | "idle"
    | "connecting"
    | "connected"
    | "disconnected"
    | "error";

type FrameMetadata = {
    deviceWidth: number;
    deviceHeight: number;
    pageScaleFactor: number;
    offsetTop: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
};

type FrameMessage = {
    type: "frame";
    data: string;
    metadata?: Partial<FrameMetadata>;
};

type StatusMessage = {
    type: "status";
    connected?: boolean;
    screencasting?: boolean;
    viewportWidth?: number;
    viewportHeight?: number;
    error?: string;
};

const DEFAULT_URL = "https://agent-browser.dev/streaming";
const DEFAULT_METADATA: FrameMetadata = {
    deviceWidth: 1280,
    deviceHeight: 720,
    pageScaleFactor: 1,
    offsetTop: 0,
    scrollOffsetX: 0,
    scrollOffsetY: 0,
};

function getBrowserWsUrl() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/browser/ws`;
}

function normalizeUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return "";
    return /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
}

function getModifierMask(event: KeyboardEvent<HTMLElement>) {
    return (
        (event.altKey ? 1 : 0) |
        (event.ctrlKey ? 2 : 0) |
        (event.metaKey ? 4 : 0) |
        (event.shiftKey ? 8 : 0)
    );
}

export default function BrowserView() {
    const [urlInput, setUrlInput] = useState(DEFAULT_URL);
    const [frame, setFrame] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<FrameMetadata>(DEFAULT_METADATA);
    const [connectionState, setConnectionState] =
        useState<ConnectionState>("idle");
    const [statusText, setStatusText] = useState("Connecting...");
    const [isOpening, setIsOpening] = useState(false);
    const [reconnectKey, setReconnectKey] = useState(0);

    const ws = useRef<WebSocket | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const isConnected = connectionState === "connected";

    useEffect(() => {
        const socket = new WebSocket(getBrowserWsUrl());
        ws.current = socket;
        setConnectionState("connecting");
        setStatusText("Connecting...");

        socket.onopen = () => {
            setConnectionState("connected");
            setStatusText("Start a browser by entering a URL");
        };

        socket.onmessage = (event) => {
            const raw = typeof event.data === "string" ? event.data : "";
            if (!raw) return;

            let message: FrameMessage | StatusMessage | null = null;
            try {
                message = JSON.parse(raw) as FrameMessage | StatusMessage;
            } catch {
                return;
            }

            if (message.type === "frame") {
                setFrame(`data:image/jpeg;base64,${message.data}`);
                setConnectionState("connected");
                setStatusText("");
                if (message.metadata) {
                    setMetadata((current) => ({
                        ...current,
                        ...message.metadata,
                        deviceWidth:
                            message.metadata?.deviceWidth ||
                            current.deviceWidth,
                        deviceHeight:
                            message.metadata?.deviceHeight ||
                            current.deviceHeight,
                    }));
                }
                return;
            }

            if (message.type === "status") {
                if (message.error) {
                    setConnectionState("error");
                    setStatusText(message.error);
                    return;
                }

                if (message.connected === false) {
                    setStatusText("Start a browser by entering a URL");
                }

                if (message.viewportWidth && message.viewportHeight) {
                    setMetadata((current) => ({
                        ...current,
                        deviceWidth: message.viewportWidth ?? current.deviceWidth,
                        deviceHeight:
                            message.viewportHeight ?? current.deviceHeight,
                    }));
                }
            }
        };

        socket.onerror = () => {
            setConnectionState("error");
            setStatusText("Browser stream is unavailable");
        };

        socket.onclose = () => {
            if (ws.current === socket) {
                ws.current = null;
            }
            setConnectionState((current) =>
                current === "error" ? current : "disconnected",
            );
            setStatusText((current) => current || "Browser stream is unavailable");
        };

        return () => {
            if (ws.current === socket) {
                ws.current = null;
            }
            socket.close();
        };
    }, [reconnectKey]);

    const send = useCallback((message: object) => {
        const socket = ws.current;
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }, []);

    const getFramePoint = useCallback(
        (clientX: number, clientY: number) => {
            const img = imgRef.current;
            if (!img) return null;

            const rect = img.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;

            const x = Math.round(
                (clientX - rect.left) * (metadata.deviceWidth / rect.width),
            );
            const y = Math.round(
                (clientY - rect.top) * (metadata.deviceHeight / rect.height),
            );

            if (
                x < 0 ||
                y < 0 ||
                x > metadata.deviceWidth ||
                y > metadata.deviceHeight
            ) {
                return null;
            }

            return { x, y };
        },
        [metadata.deviceHeight, metadata.deviceWidth],
    );

    async function navigate(to: string) {
        const resolved = normalizeUrl(to);
        if (!resolved) return;

        setIsOpening(true);
        setStatusText("Opening browser...");
        try {
            const response = await fetch("/api/browser/open", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: resolved }),
            });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(payload.error || "Failed to open browser");
            }

            setUrlInput(payload.url || resolved);
            setConnectionState("connected");
        } catch (error) {
            setConnectionState("error");
            setStatusText(
                error instanceof Error
                    ? error.message
                    : "Browser stream is unavailable",
            );
        } finally {
            setIsOpening(false);
        }
    }

    async function runCommand(command: "back" | "forward" | "reload") {
        try {
            const response = await fetch("/api/browser/command", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command }),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || "Browser command failed");
            }
        } catch (error) {
            setConnectionState("error");
            setStatusText(
                error instanceof Error
                    ? error.message
                    : "Browser command failed",
            );
        }
    }

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        void navigate(urlInput || DEFAULT_URL);
    }

    function reconnect() {
        setFrame(null);
        setConnectionState("connecting");
        setStatusText("Connecting...");
        setReconnectKey((key) => key + 1);
    }

    function sendMouseClick(point: { x: number; y: number }) {
        send({
            type: "input_mouse",
            eventType: "mousePressed",
            x: point.x,
            y: point.y,
            button: "left",
            clickCount: 1,
        });
        send({
            type: "input_mouse",
            eventType: "mouseReleased",
            x: point.x,
            y: point.y,
            button: "left",
            clickCount: 1,
        });
    }

    function handleImageClick(event: MouseEvent<HTMLImageElement>) {
        imgRef.current?.focus();
        const point = getFramePoint(event.clientX, event.clientY);
        if (point) sendMouseClick(point);
    }

    function handleMouseMove(event: MouseEvent<HTMLImageElement>) {
        const point = getFramePoint(event.clientX, event.clientY);
        if (!point) return;

        send({
            type: "input_mouse",
            eventType: "mouseMoved",
            x: point.x,
            y: point.y,
        });
    }

    function handleWheel(event: WheelEvent<HTMLImageElement>) {
        event.preventDefault();
        const point = getFramePoint(event.clientX, event.clientY);
        if (!point) return;

        send({
            type: "input_mouse",
            eventType: "mouseWheel",
            x: point.x,
            y: point.y,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
        });
    }

    function handleKeyDown(event: KeyboardEvent<HTMLImageElement>) {
        event.preventDefault();
        const modifiers = getModifierMask(event);

        send({
            type: "input_keyboard",
            eventType: "keyDown",
            key: event.key,
            code: event.code,
            modifiers,
        });

        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            send({
                type: "input_keyboard",
                eventType: "char",
                text: event.key,
            });
        }
    }

    function handleKeyUp(event: KeyboardEvent<HTMLImageElement>) {
        event.preventDefault();
        send({
            type: "input_keyboard",
            eventType: "keyUp",
            key: event.key,
            code: event.code,
            modifiers: getModifierMask(event),
        });
    }

    function handleTouch(event: TouchEvent<HTMLImageElement>) {
        const touchPoints = Array.from(event.touches)
            .map((touch, index) => {
                const point = getFramePoint(touch.clientX, touch.clientY);
                return point ? { ...point, id: touch.identifier ?? index } : null;
            })
            .filter((point): point is { x: number; y: number; id: number } =>
                Boolean(point),
            );

        send({
            type: "input_touch",
            eventType:
                event.type === "touchstart"
                    ? "touchStart"
                    : event.type === "touchmove"
                      ? "touchMove"
                      : "touchEnd",
            touchPoints,
        });
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void runCommand("back")}
                    disabled={!isConnected}
                    aria-label="Go back"
                >
                    <ArrowLeft className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void runCommand("forward")}
                    disabled={!isConnected}
                    aria-label="Go forward"
                >
                    <ArrowRight className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void runCommand("reload")}
                    disabled={!isConnected}
                    aria-label="Refresh"
                >
                    <RotateCw className="size-4" />
                </Button>
                <form onSubmit={handleSubmit} className="flex min-w-0 flex-1">
                    <div className="flex h-8 w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 text-sm">
                        <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                        <input
                            type="text"
                            value={urlInput}
                            onChange={(event) => setUrlInput(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/50"
                            placeholder="Enter URL..."
                        />
                    </div>
                </form>
                <div
                    className={cn(
                        "size-2 rounded-full",
                        isConnected
                            ? "bg-emerald-500"
                            : connectionState === "connecting"
                              ? "bg-amber-500"
                              : "bg-destructive",
                    )}
                    aria-label={`Browser ${connectionState}`}
                    title={`Browser ${connectionState}`}
                />
                {(connectionState === "disconnected" ||
                    connectionState === "error") && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={reconnect}
                        aria-label="Reconnect"
                    >
                        <PlugZap className="size-4" />
                        Reconnect
                    </Button>
                )}
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/30 p-2">
                {frame ? (
                    <img
                        ref={imgRef}
                        src={frame}
                        alt="Browser viewport"
                        className={cn(
                            "max-h-full max-w-full select-none border bg-black object-contain outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isConnected ? "cursor-crosshair" : "cursor-default",
                        )}
                        style={{
                            aspectRatio: `${metadata.deviceWidth} / ${metadata.deviceHeight}`,
                        }}
                        draggable={false}
                        tabIndex={0}
                        onClick={handleImageClick}
                        onMouseMove={handleMouseMove}
                        onWheel={handleWheel}
                        onKeyDown={handleKeyDown}
                        onKeyUp={handleKeyUp}
                        onTouchStart={handleTouch}
                        onTouchMove={handleTouch}
                        onTouchEnd={handleTouch}
                    />
                ) : (
                    <div
                        className="flex w-full max-w-xl items-center justify-center rounded-md border border-dashed bg-background/60 px-4 py-10 text-center text-sm text-muted-foreground"
                        style={{
                            aspectRatio: `${metadata.deviceWidth} / ${metadata.deviceHeight}`,
                        }}
                    >
                        {isOpening ? "Opening browser..." : statusText}
                    </div>
                )}

                {frame && statusText && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
                        {statusText}
                    </div>
                )}
            </div>
        </div>
    );
}
