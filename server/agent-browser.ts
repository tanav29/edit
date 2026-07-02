type AgentBrowserStatus = {
    enabled: boolean;
    connected: boolean;
    screencasting: boolean;
    port: number | null;
};

export type BrowserStatus = AgentBrowserStatus & {
    session: string;
    wsPath: "/api/browser/ws";
};

type RunResult = {
    exitCode: number;
    stdout: string;
    stderr: string;
};

const DEFAULT_SESSION = "edit-shared";
const DEFAULT_STREAM_PORT = 56901;
const STREAM_WS_PATH = "/api/browser/ws" as const;

function parseBoolean(value: unknown): boolean {
    return value === true || value === "true";
}

function normalizePort(value: unknown): number | null {
    const numeric =
        typeof value === "number"
            ? value
            : typeof value === "string"
              ? Number(value)
              : Number.NaN;

    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function parseTextStatus(output: string): AgentBrowserStatus {
    const enabledMatch = output.match(/Streaming enabled on ws:\/\/[^:]+:(\d+)/i);
    const disabled = /Streaming disabled/i.test(output);
    const connectedMatch = output.match(/Connected:\s*(true|false)/i);
    const screencastingMatch = output.match(/Screencasting:\s*(true|false)/i);

    return {
        enabled: Boolean(enabledMatch) && !disabled,
        port: enabledMatch ? Number(enabledMatch[1]) : null,
        connected: connectedMatch ? connectedMatch[1].toLowerCase() === "true" : false,
        screencasting: screencastingMatch
            ? screencastingMatch[1].toLowerCase() === "true"
            : false,
    };
}

function normalizeUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error("URL is required");
    }

    if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)) {
        return trimmed;
    }

    return `https://${trimmed}`;
}

export class BrowserManager {
    readonly session: string;
    readonly streamPort: number;

    constructor() {
        this.session = process.env.AGENT_BROWSER_SESSION?.trim() || DEFAULT_SESSION;
        const configuredPort = Number(process.env.AGENT_BROWSER_STREAM_PORT);
        this.streamPort =
            Number.isFinite(configuredPort) && configuredPort > 0
                ? configuredPort
                : DEFAULT_STREAM_PORT;
    }

    get publicStatus(): BrowserStatus {
        return {
            enabled: false,
            connected: false,
            screencasting: false,
            port: null,
            session: this.session,
            wsPath: STREAM_WS_PATH,
        };
    }

    async getStatus(): Promise<BrowserStatus> {
        const result = await this.run(["stream", "status", "--json"]);
        const output = `${result.stdout}\n${result.stderr}`.trim();

        if (result.exitCode === 0 && output) {
            try {
                const parsed = JSON.parse(output) as Partial<AgentBrowserStatus>;
                return {
                    enabled: parseBoolean(parsed.enabled),
                    connected: parseBoolean(parsed.connected),
                    screencasting: parseBoolean(parsed.screencasting),
                    port: normalizePort(parsed.port),
                    session: this.session,
                    wsPath: STREAM_WS_PATH,
                };
            } catch {
                const status = parseTextStatus(output);
                return { ...status, session: this.session, wsPath: STREAM_WS_PATH };
            }
        }

        if (output) {
            const status = parseTextStatus(output);
            return { ...status, session: this.session, wsPath: STREAM_WS_PATH };
        }

        return this.publicStatus;
    }

    async ensureStream(): Promise<BrowserStatus> {
        const current = await this.getStatus();
        if (current.enabled && current.port === this.streamPort) {
            return current;
        }

        const result = await this.run([
            "stream",
            "enable",
            "--port",
            String(this.streamPort),
        ]);

        if (result.exitCode !== 0) {
            throw new Error(
                `Failed to enable browser stream: ${this.formatRunError(result)}`,
            );
        }

        return this.getStatus();
    }

    async open(url: string): Promise<{ ok: true; url: string; status: BrowserStatus }> {
        const normalizedUrl = normalizeUrl(url);
        await this.ensureStream();

        const result = await this.run(["open", normalizedUrl]);
        if (result.exitCode !== 0) {
            throw new Error(`Failed to open browser: ${this.formatRunError(result)}`);
        }

        return {
            ok: true,
            url: normalizedUrl,
            status: await this.getStatus(),
        };
    }

    async command(command: "back" | "forward" | "reload"): Promise<{ ok: true }> {
        await this.ensureStream();

        const keys: Record<typeof command, string[]> = {
            back: ["key", "Alt+Left"],
            forward: ["key", "Alt+Right"],
            reload: ["key", "Ctrl+R"],
        };

        const result = await this.run(keys[command]);
        if (result.exitCode !== 0) {
            throw new Error(
                `Failed to run browser command: ${this.formatRunError(result)}`,
            );
        }

        return { ok: true };
    }

    async connectStream(): Promise<WebSocket> {
        await this.ensureStream();

        let lastError: unknown;
        for (let attempt = 0; attempt < 8; attempt += 1) {
            try {
                const socket = new WebSocket(`ws://127.0.0.1:${this.streamPort}`);
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        socket.close();
                        reject(new Error("Timed out connecting to browser stream"));
                    }, 1500);

                    socket.addEventListener(
                        "open",
                        () => {
                            clearTimeout(timeout);
                            resolve();
                        },
                        { once: true },
                    );
                    socket.addEventListener(
                        "error",
                        () => {
                            clearTimeout(timeout);
                            reject(new Error("Browser stream WebSocket failed"));
                        },
                        { once: true },
                    );
                });
                return socket;
            } catch (error) {
                lastError = error;
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
        }

        throw new Error(
            lastError instanceof Error
                ? lastError.message
                : "Browser stream is unavailable",
        );
    }

    private async run(args: string[]): Promise<RunResult> {
        try {
            const proc = Bun.spawn(["bunx", "agent-browser", "--session", this.session, ...args], {
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    AGENT_BROWSER_SESSION: this.session,
                    AGENT_BROWSER_STREAM_PORT: String(this.streamPort),
                },
                stdout: "pipe",
                stderr: "pipe",
            });

            const [stdout, stderr, exitCode] = await Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
                proc.exited,
            ]);

            return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
        } catch (error) {
            return {
                exitCode: 1,
                stdout: "",
                stderr:
                    error instanceof Error
                        ? error.message
                        : "Failed to run agent-browser",
            };
        }
    }

    private formatRunError(result: RunResult): string {
        return result.stderr || result.stdout || `exit code ${result.exitCode}`;
    }
}
