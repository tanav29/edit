import { exec, execSync } from "child_process";
import { nanoid } from "nanoid";
import { mkdir, readdir, stat } from "fs/promises";
import path from "path";
import { join, relative } from "path";
import { promisify } from "util";
import { Elysia, t } from "elysia";

import {
    generateText,
    convertToModelMessages,
    smoothStream,
    stepCountIs,
    streamText,
} from "ai";
import { ollama } from "ollama-ai-provider-v2";

import { buildAgentSystemPrompt, createTools } from "@/lib/tool";
import {
    createSession,
    deleteSession,
    getSession,
    listSessions,
    storeMessages,
} from "./store";
import { db } from "@/db";
import { chats } from "@/db/schema";
import { eq } from "drizzle-orm";

const execAsync = promisify(exec);

interface FileNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: FileNode[];
}

type WorkspaceGitStatus =
    | "added"
    | "deleted"
    | "ignored"
    | "modified"
    | "renamed"
    | "untracked";

interface GitStatusEntry {
    path: string;
    status: WorkspaceGitStatus;
}

interface WorkspaceTreePayload {
    paths: string[];
    rootName: string;
    rootPath: string;
    gitStatus: GitStatusEntry[];
}

type ScannedNode = FileNode & {
    mtimeMs: number;
};

const IGNORED_PATTERNS = [
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".env",
    ".env.local",
    ".DS_Store",
    "coverage",
];

async function getPathInfo(targetPath: string): Promise<FileNode> {
    const normalizedPath = path.normalize(targetPath);
    const info = await stat(normalizedPath);

    return {
        name: path.basename(normalizedPath) || normalizedPath,
        path: normalizedPath,
        type: info.isDirectory() ? "directory" : "file",
    };
}

async function scanDirectory(dirPath: string): Promise<FileNode[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const nodePromises = entries.map(
        async (entry): Promise<ScannedNode | null> => {
            if (
                IGNORED_PATTERNS.some((pattern) => entry.name.includes(pattern))
            ) {
                return null;
            }

            const fullPath = join(dirPath, entry.name);

            try {
                const info = await stat(fullPath);
                const isDir = entry.isDirectory();

                return {
                    name: entry.name,
                    path: fullPath,
                    type: isDir ? "directory" : "file",
                    children: isDir ? [] : undefined,
                    mtimeMs: info.mtimeMs,
                };
            } catch {
                return null;
            }
        },
    );

    const nodes = (await Promise.all(nodePromises)).filter(
        (node): node is ScannedNode => node !== null,
    );

    const sorted = nodes.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
        }
        if (a.mtimeMs !== b.mtimeMs) {
            return b.mtimeMs - a.mtimeMs;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return sorted.map((node) => ({
        name: node.name,
        path: node.path,
        type: node.type,
        children: node.children,
    }));
}

async function listWorkspaceTreePaths(
    rootPath: string,
): Promise<WorkspaceTreePayload> {
    const normalizedRootPath = path.normalize(rootPath);
    const rootName =
        path.basename(normalizedRootPath) || normalizedRootPath || "workspace";
    const paths: string[] = [];

    async function walk(currentPath: string) {
        const children = await scanDirectory(currentPath);

        for (const child of children) {
            const relativePath = relative(
                normalizedRootPath,
                child.path,
            ).replaceAll("\\", "/");

            if (!relativePath || relativePath.startsWith("..")) {
                continue;
            }

            paths.push(
                child.type === "directory" ? `${relativePath}/` : relativePath,
            );

            if (child.type === "directory") {
                await walk(child.path);
            }
        }
    }

    await walk(normalizedRootPath);

    return {
        paths,
        rootName,
        rootPath: normalizedRootPath,
        gitStatus: listWorkspaceGitStatus(normalizedRootPath),
    };
}

function runGit(command: string, cwd: string): string {
    return execSync(command, {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
    }).trim();
}

function decodeGitPath(rawPath: string): string {
    const trimmedPath = rawPath.trim();

    if (!trimmedPath.startsWith('"') || !trimmedPath.endsWith('"')) {
        return trimmedPath;
    }

    try {
        return JSON.parse(trimmedPath) as string;
    } catch {
        return trimmedPath
            .slice(1, -1)
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
    }
}

function mapGitPorcelainStatus(code: string): WorkspaceGitStatus | null {
    if (code === "??") {
        return "untracked";
    }

    if (code === "!!") {
        return "ignored";
    }

    if (code.includes("R")) {
        return "renamed";
    }

    if (code.includes("A") || code.includes("C")) {
        return "added";
    }

    if (code.includes("D")) {
        return "deleted";
    }

    if (/[MTU]/.test(code)) {
        return "modified";
    }

    return null;
}

function parseGitStatusLine(line: string): GitStatusEntry | null {
    if (line.length < 4) {
        return null;
    }

    const code = line.slice(0, 2);
    const status = mapGitPorcelainStatus(code);

    if (!status) {
        return null;
    }

    let relativePath = line.slice(3);

    if (status === "renamed") {
        const renamedParts = relativePath.split(" -> ");
        relativePath = renamedParts[renamedParts.length - 1] ?? relativePath;
    }

    const decodedPath = decodeGitPath(relativePath)
        .replaceAll("\\", "/")
        .replace(/^\.\//, "")
        .replace(/^\/+/, "");

    if (!decodedPath) {
        return null;
    }

    return {
        path: decodedPath,
        status,
    };
}

function listWorkspaceGitStatus(rootPath: string): GitStatusEntry[] {
    const normalizedRootPath = path.normalize(rootPath);

    let gitRoot = "";

    try {
        gitRoot = runGit("git rev-parse --show-toplevel", normalizedRootPath);
    } catch {
        return [];
    }

    const relativeWorkspacePath = path.relative(gitRoot, normalizedRootPath);

    if (relativeWorkspacePath.startsWith("..")) {
        return [];
    }

    const porcelainOutput = runGit(
        "git status --porcelain --untracked-files=all",
        gitRoot,
    );

    if (!porcelainOutput) {
        return [];
    }

    const gitStatusByPath = new Map<string, WorkspaceGitStatus>();

    for (const line of porcelainOutput.split(/\r?\n/)) {
        const parsedEntry = parseGitStatusLine(line);

        if (!parsedEntry) {
            continue;
        }

        const absoluteStatusPath = path.resolve(gitRoot, parsedEntry.path);
        const relativeToWorkspacePath = path
            .relative(normalizedRootPath, absoluteStatusPath)
            .replaceAll("\\", "/");

        if (
            !relativeToWorkspacePath ||
            relativeToWorkspacePath.startsWith("../") ||
            relativeToWorkspacePath === ".."
        ) {
            continue;
        }

        gitStatusByPath.set(relativeToWorkspacePath, parsedEntry.status);
    }

    return Array.from(gitStatusByPath, ([statusPath, status]) => ({
        path: statusPath,
        status,
    }));
}

async function ensureWorkspaceDirectory(
    reqPath: string | undefined,
    createIfMissing = false,
): Promise<
    { ok: true; path: string } | { ok: false; status: number; error: string }
> {
    const trimmedPath = reqPath?.trim();

    if (!trimmedPath) {
        return { ok: false, status: 400, error: "Path is required" };
    }

    const normalizedPath = path.normalize(trimmedPath);

    try {
        const info = await stat(normalizedPath);
        if (!info.isDirectory()) {
            return {
                ok: false,
                status: 400,
                error: "Path must point to a directory",
            };
        }

        return { ok: true, path: normalizedPath };
    } catch (error) {
        const code =
            typeof error === "object" && error !== null && "code" in error
                ? (error as { code?: string }).code
                : undefined;

        if (code !== "ENOENT") {
            return {
                ok: false,
                status: 500,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to open path",
            };
        }
    }

    if (!createIfMissing) {
        return { ok: false, status: 404, error: "Path not found" };
    }

    try {
        await mkdir(normalizedPath, { recursive: true });
        return { ok: true, path: normalizedPath };
    } catch (error) {
        return {
            ok: false,
            status: 500,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to create directory",
        };
    }
}

async function generateCommitMessage(diff: string): Promise<string> {
    try {
        const result = await generateText({
            model: ollama("minimax-m2.5:cloud"),
            prompt: [
                "Generate one concise git commit message in imperative mood.",
                "Rules:",
                "- output only the commit message text",
                "- max 72 characters",
                "- no quotes, no markdown, no prefix labels",
                "- focus on the most meaningful change",
                "",
                "Git diff:",
                diff,
            ].join("\n"),
            maxRetries: 1,
        });

        const message = result.text.replace(/\s+/g, " ").trim();

        if (!message) {
            return "Update project files";
        }

        return message.length > 72 ? message.slice(0, 72).trim() : message;
    } catch {
        return "Update project files";
    }
}

function cleanEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v;
    }
    return env;
}

const userSockets = new Set<any>();

function broadcast(data: object) {
    const msg = JSON.stringify(data);
    for (const ws of userSockets) {
        try {
            ws.send(msg);
        } catch (e) {
            userSockets.delete(ws);
        }
    }
}

const api = new Elysia({ prefix: "/api" })
    .get("/health", async () => {
        return { ok: true };
    })
    .ws("/ws", {
        open(ws) {
            userSockets.add(ws);
        },
        close(ws) {
            userSockets.delete(ws);
        },
        async message(ws, message) {
            console.log(`ws message: ${message}`);
            switch (message) {
                case "session":
                    const sessions = await listSessions();
                    ws.send(JSON.stringify(sessions));
                    break;
            }
        },
    })
    .ws("/terminal", {
        async open(ws) {
            (ws as any).__pty = null;
        },
        async message(ws, message) {
            const msg = message as string | Buffer;
            const input = typeof msg === "string" ? msg : msg.toString("utf-8");

            if (input.startsWith("\x1b[RESIZE:")) {
                const match = input.match(/\x1b\[RESIZE:(\d+);(\d+)\]/);
                if (match) {
                    const cols = parseInt(match[1], 10);
                    const rows = parseInt(match[2], 10);
                    let proc = (ws as any).__pty;

                    if (!proc) {
                        try {
                            const shell = process.env.SHELL || "/bin/bash";
                            const env = cleanEnv();
                            env.TERM = "xterm-256color";

                            proc = Bun.spawn([shell, "-li"], {
                                terminal: {
                                    cols,
                                    rows,
                                    data(_terminal, data) {
                                        if (ws.readyState === WebSocket.OPEN) {
                                            ws.send(
                                                new TextDecoder().decode(data),
                                            );
                                        }
                                    },
                                },
                                cwd: process.env.HOME || process.cwd(),
                                env,
                            });

                            proc.exited.then((exitCode) => {
                                console.error(`PTY exited: code=${exitCode}`);
                                if (ws.readyState === WebSocket.OPEN) {
                                    ws.send(
                                        `\r\n\x1b[90m[process exited] (code: ${exitCode})\x1b[0m\r\n`,
                                    );
                                    ws.close();
                                }
                            });

                            (ws as any).__pty = proc;
                        } catch (err) {
                            const errorMsg =
                                err instanceof Error
                                    ? err.message
                                    : String(err);
                            console.error(`Failed to spawn PTY: ${errorMsg}`);
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(
                                    `\r\n\x1b[31mFailed to spawn shell: ${errorMsg}\x1b[0m\r\n`,
                                );
                                ws.close();
                            }
                        }
                    } else {
                        proc.terminal?.resize(cols, rows);
                    }
                    return;
                }
            }

            const proc = (ws as any).__pty;
            if (proc) proc.terminal?.write(input);
        },
        async close(ws) {
            const proc = (ws as any).__pty;
            if (proc) {
                try {
                    proc.kill();
                } catch {
                    // process already exited
                }
            }
        },
    })
    .post(
        "/files/ensure",
        async ({ body, set }) => {
            const result = await ensureWorkspaceDirectory(
                body?.path,
                Boolean(body?.createIfMissing),
            );

            if (!result.ok) {
                set.status = result.status;
                return { error: result.error };
            }

            return { ok: true, path: result.path };
        },
        {
            body: t.Object({
                path: t.String(),
                createIfMissing: t.Optional(t.Boolean()),
            }),
        },
    )
    .post(
        "/exec",
        async ({ body, set }) => {
            try {
                const { path, command } = body;

                if (!path || !command) {
                    set.status = 400;
                    return { error: "Path and command are required" };
                }

                const { stdout, stderr } = await execAsync(command, {
                    cwd: path,
                    timeout: 120000,
                });

                const output = stdout || stderr;

                return {
                    output,
                    exitCode: 0,
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Unknown error";

                const exitCode =
                    typeof error === "object" &&
                    error !== null &&
                    "code" in error &&
                    typeof (error as { code?: unknown }).code === "number"
                        ? (error as { code: number }).code
                        : 1;

                const output =
                    typeof error === "object" &&
                    error !== null &&
                    "stdout" in error &&
                    typeof (error as { stdout?: unknown }).stdout === "string"
                        ? (error as { stdout: string }).stdout
                        : typeof error === "object" &&
                            error !== null &&
                            "stderr" in error &&
                            typeof (error as { stderr?: unknown }).stderr ===
                                "string"
                          ? (error as { stderr: string }).stderr
                          : "";

                set.status = 500;
                return { error: message, output, exitCode };
            }
        },
        {
            body: t.Object({
                path: t.String(),
                command: t.String(),
            }),
        },
    )
    .get(
        "/files",
        async ({ query, set }) => {
            try {
                const reqPath = query.path;

                if (!reqPath) {
                    set.status = 400;
                    return { error: "Path parameter is required" };
                }

                const pathInfo = await getPathInfo(reqPath);

                if (pathInfo.type === "file") {
                    return pathInfo;
                }

                const children = await scanDirectory(pathInfo.path);

                return {
                    ...pathInfo,
                    children,
                };
            } catch (error) {
                console.error("Error scanning directory:", error);
                set.status = 500;
                return { error: "Failed to scan directory" };
            }
        },
        {
            query: t.Object({
                path: t.Optional(t.String()),
            }),
        },
    )
    .get(
        "/files/content",
        async ({ query, set }) => {
            try {
                const filePath = query.path;

                if (!filePath) {
                    set.status = 400;
                    return { error: "Path parameter is required" };
                }

                const pathInfo = await getPathInfo(filePath);
                if (pathInfo.type !== "file") {
                    set.status = 400;
                    return { error: "Path must point to a file" };
                }

                const content = await Bun.file(pathInfo.path).text();

                return {
                    content,
                    filePath: pathInfo.path,
                };
            } catch (error) {
                if (
                    typeof error === "object" &&
                    error !== null &&
                    "code" in error &&
                    (error as { code?: unknown }).code === "ENOENT"
                ) {
                    set.status = 404;
                    return { error: "File not found" };
                }

                console.error("Error reading file:", error);
                set.status = 500;
                return { error: "Failed to read file" };
            }
        },
        {
            query: t.Object({
                path: t.Optional(t.String()),
            }),
        },
    )
    .get(
        "/files/tree",
        async ({ query, set }) => {
            try {
                const workspacePath = query.path;

                if (!workspacePath) {
                    set.status = 400;
                    return { error: "Path parameter is required" };
                }

                const workspaceInfo = await getPathInfo(workspacePath);

                if (workspaceInfo.type !== "directory") {
                    set.status = 400;
                    return {
                        error: "Workspace path must point to a directory",
                    };
                }

                return await listWorkspaceTreePaths(workspaceInfo.path);
            } catch (error) {
                console.error("Error building workspace tree:", error);
                set.status = 500;
                return { error: "Failed to build workspace tree" };
            }
        },
        {
            query: t.Object({
                path: t.Optional(t.String()),
            }),
        },
    )
    .post(
        "/git/commit",
        async ({ body, set }) => {
            try {
                const workspacePath = body?.path?.trim();

                if (!workspacePath) {
                    set.status = 400;
                    return { error: "Path is required" };
                }

                let gitRoot = "";

                try {
                    gitRoot = runGit(
                        "git rev-parse --show-toplevel",
                        workspacePath,
                    );
                } catch {
                    set.status = 400;
                    return {
                        error: "Selected directory is not a git repository",
                    };
                }

                const statusBefore = runGit("git status --porcelain", gitRoot);

                if (!statusBefore) {
                    set.status = 400;
                    return { error: "No changes to commit" };
                }

                const selectedRelativePath =
                    path.relative(gitRoot, workspacePath) || ".";

                if (selectedRelativePath.startsWith("..")) {
                    set.status = 400;
                    return {
                        error: "Selected directory must be inside the git repository",
                    };
                }

                const pathSpec =
                    selectedRelativePath === "."
                        ? "."
                        : JSON.stringify(selectedRelativePath);

                runGit(`git add -A -- ${pathSpec}`, gitRoot);

                const stagedDiff = runGit(
                    `git diff --cached -- ${pathSpec}`,
                    gitRoot,
                );
                if (!stagedDiff) {
                    set.status = 400;
                    return {
                        error: "No changes to commit in selected directory",
                    };
                }

                const commitMessage = await generateCommitMessage(stagedDiff);

                runGit(
                    `git commit -m ${JSON.stringify(commitMessage)} -- ${pathSpec}`,
                    gitRoot,
                );

                const commitHash = runGit(
                    "git rev-parse --short HEAD",
                    gitRoot,
                );

                return {
                    ok: true,
                    message: commitMessage,
                    commitHash,
                    repository: gitRoot,
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Commit failed";
                set.status = 500;
                return { error: message };
            }
        },
        {
            body: t.Object({
                path: t.Optional(t.String()),
            }),
        },
    )
    .get("/sessions", async () => listSessions())
    .post(
        "/sessions",
        async ({ body, set }) => {
            const workspace = await ensureWorkspaceDirectory(
                body.path,
                Boolean(body.createIfMissing),
            );

            if (!workspace.ok) {
                set.status = workspace.status;
                return { error: workspace.error };
            }

            const id = nanoid();
            const session = await createSession({
                id,
                workspacePath: workspace.path,
            });

            broadcast({ type: "sessions-changed" });

            return {
                ok: true,
                id: session.id,
                workspace: session.workspacePath,
                session,
            };
        },
        {
            body: t.Object({
                path: t.String(),
                createIfMissing: t.Optional(t.Boolean()),
            }),
        },
    )
    .get(
        "/sessions/:id",
        async ({ params, set }) => {
            const session = await getSession(params.id);

            if (!session) {
                set.status = 404;
                return { error: "Session not found" };
            }

            return session;
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        },
    )
    .delete(
        "/sessions/:id",
        async ({ params }) => {
            await deleteSession(params.id);
            broadcast({ type: "sessions-changed" });
            return { ok: true };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        },
    )
    .get(
        "/store/:id",
        async ({ params }) => {
            // Backwards-compatible alias for GET /sessions/:id.
            return getSession(params.id);
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        },
    )
    .post(
        "/store",
        async ({ body, set }) => {
            try {
                await storeMessages({
                    id: body.id,
                    messages: body.messages,
                    workspace: body.workspace,
                });

                return { ok: true };
            } catch (error) {
                set.status = 400;
                return {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to store messages",
                };
            }
        },
        {
            body: t.Object({
                id: t.String(),
                workspace: t.String(),
                messages: t.Array(t.Any()),
            }),
        },
    )
    .get(
        "/del/:id",
        async ({ params }) => {
            // Legacy alias retained for the existing client. Prefer DELETE /sessions/:id.
            await deleteSession(params.id);
            broadcast({ type: "sessions-changed" });
            return { ok: true };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        },
    )
    .post(
        "/chat",
        async ({ body, set }) => {
            if (!Array.isArray(body.messages)) {
                set.status = 400;
                return { error: "Invalid request body" };
            }

            await storeMessages({
                id: body.id,
                messages: body.messages,
                workspace: body.path,
            });

            const tools = createTools(body.path);

            const result = streamText({
                model: ollama("qwen3.5:0.8b"),
                system: buildAgentSystemPrompt(body.path),
                messages: await convertToModelMessages(body.messages),
                tools,
                stopWhen: stepCountIs(100),
                maxRetries: 3,
                experimental_transform: smoothStream({
                    chunking: "line",
                }),
            });

            try {
                await db
                    .update(chats)
                    .set({ status: 1 })
                    .where(eq(chats.id, body.id));
                broadcast({
                    type: "status-update",
                    id: body.id,
                    status: 1,
                });
            } catch (e) {
                console.error(e);
            }

            return result.toUIMessageStreamResponse({
                originalMessages: body.messages,
                onFinish: async ({ messages }) => {
                    await db
                        .update(chats)
                        .set({ status: 0 })
                        .where(eq(chats.id, body.id));
                    broadcast({
                        type: "status-update",
                        id: body.id,
                        status: 0,
                    });
                    await storeMessages({
                        id: body.id,
                        messages,
                        workspace: body.path,
                    });
                },
            });
        },
        {
            body: t.Object({
                id: t.String(),
                messages: t.Array(t.Any()),
                path: t.String(),
            }),
        },
    );

export const app = new Elysia().use(api);
