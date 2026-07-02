"use client";

import {
    useEffect,
    useRef,
    useState,
    useCallback,
    type FormEvent,
} from "react";
import { ArrowLeft, ArrowRight, Globe, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BrowserView() {
    const [urlInput, setUrlInput] = useState("");
    const [frame, setFrame] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const [viewport] = useState({ width: 1280, height: 720 });
    const ws = useRef<WebSocket | null>(null);
    // const actionWS = useRef<WebSocket | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const socket = new WebSocket("ws://127.0.0.1:56901");

        socket.onopen = () => setConnected(true);
        socket.onclose = () => setConnected(false);
        socket.onerror = () => setConnected(false);
        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case "frame":
                    setFrame(`data:image/jpeg;base64,${msg.data}`);
                    break;
            }
        };

        ws.current = socket;
        return () => socket.close();
    }, []);

    const send = useCallback((msg: object) => {
        ws.current?.send(JSON.stringify(msg));
    }, []);

    const sendClick = useCallback(
        (x: number, y: number) => {
            send({
                type: "input_mouse",
                eventType: "mousePressed",
                x,
                y,
                button: "left",
                clickCount: 1,
            });
            send({
                type: "input_mouse",
                eventType: "mouseReleased",
                x,
                y,
                button: "left",
                clickCount: 1,
            });
        },
        [send],
    );

    const sendKey = useCallback(
        (key: string, code: string) => {
            send({ action: "keyDown", key, code });
            send({ action: "keyUp", key, code });
        },
        [send],
    );

    const sendText = useCallback(
        (text: string) => {
            for (const char of text) {
                send({ action: "keyPress", key: char, code: char });
            }
        },
        [send],
    );

    function navigate(to: string) {
        let resolved = to.trim();
        if (!resolved) return;
        if (!/^https?:\/\//i.test(resolved)) {
            resolved = "https://" + resolved;
        }
        setUrlInput(resolved);
        send({ action: "navigate", url: resolved });
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        navigate(urlInput);
    }

    function goBack() {
        send({ action: "back" });
    }

    function goForward() {
        send({ action: "forward" });
    }

    function refresh() {
        send({ action: "reload" });
    }

    function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
        const img = imgRef.current;
        if (!img) return;
        const rect = img.getBoundingClientRect();
        const naturalWidth = img.naturalWidth || viewport.width;
        const naturalHeight = img.naturalHeight || viewport.height;
        const scaleX = naturalWidth / rect.width;
        const scaleY = naturalHeight / rect.height;
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);
        sendClick(x, y);
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-1 border-b px-2 py-1.5 shrink-0">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={goBack}
                    disabled={!connected}
                    aria-label="Go back"
                >
                    <ArrowLeft className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={goForward}
                    disabled={!connected}
                    aria-label="Go forward"
                >
                    <ArrowRight className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={refresh}
                    disabled={!connected}
                    aria-label="Refresh"
                >
                    <RotateCw className="size-4" />
                </Button>
                <form onSubmit={handleSubmit} className="flex flex-1">
                    <div className="flex h-8 w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 text-sm">
                        <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                        <input
                            type="text"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSubmit(e);
                            }}
                            className="min-w-0 flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50"
                            placeholder="Enter URL..."
                        />
                    </div>
                </form>
            </div>
            <div className="flex flex-1 items-start justify-center overflow-auto bg-background h-full">
                {!connected && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        Connecting...
                    </div>
                )}
                <img
                    ref={imgRef}
                    src={frame || ""}
                    alt="Browser viewport"
                    className="select-none border h-full"
                    draggable={false}
                    tabIndex={1}
                    onClick={handleImageClick}
                    onMouseMove={(e) => {
                        send({
                            type: "input_move",
                            eventType: "mouseMoved",
                            x: e.clientX,
                            y: e.clientY,
                        });
                    }}
                    onWheel={(e) => {
                        send({
                            type: "input_mouse",
                            eventType: "mouseWheel",
                            x: e.clientX,
                            y: e.clientY,
                            deltaX: e.deltaX,
                            deltaY: e.deltaY,
                        });
                    }}
                    onKeyDown={(e) => {
                        e.preventDefault();
                        console.log(e);
                        send({
                            type: "input_keyboard",
                            eventType: "keyDown",
                            key: e.key,
                            code: e.code,
                        });
                    }}
                    onKeyUp={(e) => {
                        e.preventDefault();

                        send({
                            type: "input_keyboard",
                            eventType: "keyUp",
                            key: e.key,
                            code: e.code,
                        });
                    }}
                />
            </div>
        </div>
    );
}
