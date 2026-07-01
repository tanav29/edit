import { execSync } from "child_process";
import { existsSync, accessSync, chmodSync, constants } from "fs";
import { dirname, join } from "path";
import { platform, arch } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function isMusl(): boolean {
  if (platform() !== "linux") return false;
  try {
    const result = execSync("ldd --version 2>&1 || true", { encoding: "utf8" });
    return result.toLowerCase().includes("musl");
  } catch {
    return existsSync("/lib/ld-musl-x86_64.so.1") || existsSync("/lib/ld-musl-aarch64.so.1");
  }
}

function getBinaryName(): string | null {
  const os = platform();
  const cpuArch = arch();
  let osKey: string;
  switch (os) {
    case "darwin": osKey = "darwin"; break;
    case "linux": osKey = isMusl() ? "linux-musl" : "linux"; break;
    case "win32": osKey = "win32"; break;
    default: return null;
  }
  let archKey: string;
  switch (cpuArch) {
    case "x64":
    case "x86_64": archKey = "x64"; break;
    case "arm64":
    case "aarch64": archKey = "arm64"; break;
    default: return null;
  }
  return `agent-browser-${osKey}-${archKey}${os === "win32" ? ".exe" : ""}`;
}

function getBinaryPath(): string {
  const binaryName = getBinaryName();
  if (!binaryName) throw new Error(`Unsupported platform: ${platform()}-${arch()}`);

  let searchPaths = [
    join(__dirname, "..", "node_modules", "agent-browser", "bin", binaryName),
    join(__dirname, "..", "..", "agent-browser", "bin", binaryName),
  ];

  for (const p of searchPaths) {
    if (existsSync(p)) {
      if (platform() !== "win32") {
        try {
          accessSync(p, constants.X_OK);
        } catch {
          chmodSync(p, 0o755);
        }
      }
      return p;
    }
  }
  throw new Error(`agent-browser binary not found for ${platform()}-${arch()}`);
}

function ab(...args: string[]): string {
  const bin = getBinaryPath();
  return execSync(`"${bin}" ${args.map(a => JSON.stringify(a)).join(" ")}`, {
    encoding: "utf-8",
    timeout: 30000,
  }).trim();
}

export interface LaunchOptions {
  headless?: boolean;
}

export interface ScreencastOptions {
  format?: "jpeg" | "png";
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}

export interface MouseEventOptions {
  type: "mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel";
  x: number;
  y: number;
  button?: string;
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
}

export interface KeyboardEventOptions {
  type: "keyDown" | "keyUp";
  key: string;
  code: string;
}

export class BrowserManager {
  private ws: WebSocket | null = null;
  private _onFrame: ((frame: any) => void) | null = null;

  async launch(options: LaunchOptions = {}): Promise<void> {
    const bin = getBinaryPath();
    const flag = options.headless === false ? "--headed" : "";
    execSync(`"${bin}" ${flag} open "about:blank"`, {
      encoding: "utf-8",
      timeout: 15000,
    });
  }

  async navigate(url: string): Promise<void> {
    ab("open", url);
  }

  async back(): Promise<void> {
    ab("back");
  }

  async forward(): Promise<void> {
    ab("forward");
  }

  async reload(): Promise<void> {
    ab("reload");
  }

  async startScreencast(
    onFrame: (frame: any) => void,
    options: ScreencastOptions = {},
  ): Promise<void> {
    this._onFrame = onFrame;
    const port = 0;
    const output = ab("stream", "enable", "--port", String(port));
    const match = output.match(/port\s+(\d+)/i) || output.match(/(\d+)/);
    if (!match) throw new Error("Failed to start screencast: " + output);
    const wsPort = parseInt(match[1]!, 10);

    this.ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    this.ws.onmessage = (event) => {
      if (this._onFrame) this._onFrame(event.data);
    };
    this.ws.onerror = (err) => console.error("Screencast WS error:", err);

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error("WS not created"));
      const timeout = setTimeout(() => {
        reject(new Error("Screencast WS connection timed out"));
      }, 5000);
      this.ws.onopen = () => { clearTimeout(timeout); resolve(); };
      this.ws.onerror = (err) => { clearTimeout(timeout); reject(err); };
    });
  }

  async stopScreencast(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    try {
      ab("stream", "disable");
    } catch {}
    this._onFrame = null;
  }

  async injectMouseEvent(options: MouseEventOptions): Promise<void> {
    const { type, x, y, button, clickCount, deltaX, deltaY } = options;
    switch (type) {
      case "mousePressed":
      case "mouseReleased":
        ab("mouse", type === "mousePressed" ? "down" : "up", String(x), String(y), button || "left");
        break;
      case "mouseMoved":
        ab("mouse", "move", String(x), String(y));
        break;
      case "mouseWheel":
        ab("mouse", "wheel", String(deltaY || 0), String(deltaX || 0));
        break;
    }
  }

  async injectKeyboardEvent(options: KeyboardEventOptions): Promise<void> {
    const { key } = options;
    ab("press", key);
  }
}
