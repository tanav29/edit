import { exec, execSync } from "child_process";
import { db } from "@/db";
import { chats } from "@/db/schema";
import { readdir, stat } from "fs/promises";
import { normalizeMessageOrder } from "@/lib/utils";
import { parseMessages } from "@/lib/utils";
import path from "path";
import { join, relative } from "path";
import { promisify } from "util";
import { desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
  generateText,
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
import { ollama } from "ollama-ai-provider-v2";

import { createTools, DEFAULT_IGNORE_PATTERNS } from "@/lib/tool";
import { storeMessages } from "./store";

const execAsync = promisify(exec);

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface WorkspaceTreePayload {
  paths: string[];
  rootName: string;
  rootPath: string;
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

async function scanDirectory(dirPath: string): Promise<FileNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nodePromises = entries.map(
    async (entry): Promise<ScannedNode | null> => {
      if (IGNORED_PATTERNS.some((pattern) => entry.name.includes(pattern))) {
        return null;
      }

      const fullPath = join(dirPath, entry.name);
      const info = await stat(fullPath);
      const isDir = entry.isDirectory();

      return {
        name: entry.name,
        path: fullPath,
        type: isDir ? "directory" : "file",
        children: isDir ? [] : undefined,
        mtimeMs: info.mtimeMs,
      };
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
      const relativePath = relative(normalizedRootPath, child.path).replaceAll(
        "\\",
        "/",
      );

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
  };
}

function runGit(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
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

export const app = new Elysia({ prefix: "/api" })
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
                typeof (error as { stderr?: unknown }).stderr === "string"
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

        const file = Bun.file(reqPath);
        if (await file.exists()) {
          return {
            name: reqPath.split("/").pop() || "",
            path: reqPath,
            type: "file",
          };
        }

        const children = await scanDirectory(reqPath);

        return {
          name: reqPath.split("/").pop() || "",
          path: reqPath,
          type: "directory",
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

        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          set.status = 404;
          return { error: "File not found" };
        }

        const content = await file.text();

        return {
          content,
          filePath,
        };
      } catch (error) {
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

        const file = Bun.file(workspacePath);
        if (await file.exists()) {
          set.status = 400;
          return { error: "Workspace path must point to a directory" };
        }

        return await listWorkspaceTreePaths(workspacePath);
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
          gitRoot = runGit("git rev-parse --show-toplevel", workspacePath);
        } catch {
          set.status = 400;
          return { error: "Selected directory is not a git repository" };
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

        const stagedDiff = runGit(`git diff --cached -- ${pathSpec}`, gitRoot);
        if (!stagedDiff) {
          set.status = 400;
          return { error: "No changes to commit in selected directory" };
        }

        const commitMessage = await generateCommitMessage(stagedDiff);

        runGit(
          `git commit -m ${JSON.stringify(commitMessage)} -- ${pathSpec}`,
          gitRoot,
        );

        const commitHash = runGit("git rev-parse --short HEAD", gitRoot);

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
  .get("/sessions", async () => {
    const rows = await db
      .select({
        id: chats.id,
        workspacePath: chats.workspacePath,
        title: chats.title,
        createdAt: chats.createdAt,
        updatedAt: chats.updatedAt,
      })
      .from(chats)
      .orderBy(desc(chats.updatedAt));
    return rows;
  })
  .get(
    "/store/:id",
    async ({ params }) => {
      if (!params.id) {
        return { ok: false, msg: "sessionId and path are required" };
      }

      const chat = await db
        .select()
        .from(chats)
        .where(eq(chats.id, params.id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!chat) {
        return null;
      }

      return {
        ...chat,
        workspace: chat.workspacePath,
        messages: normalizeMessageOrder(parseMessages(chat.messages)),
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  )
  .post(
    "/store",
    async ({ body }) => {
      const messages = Array.isArray(body.messages) ? body.messages : undefined;

      if (!body.id || !body.workspace || !messages) {
        return {
          ok: false,
          msg: "sessionId, path and messages are required",
        };
      }

      await storeMessages({
        id: body.id,
        messages,
        workspace: body.workspace,
      });

      return { ok: true };
    },
    {
      body: t.Object({
        id: t.String(),
        workspace: t.String(),
        messages: t.Any(),
      }),
    },
  )
  .get("/del/:id", async ({ params }) => {
    if (!params.id) {
      return {
        ok: false,
        msg: "sessionId and workspace are required",
      };
    }

    await db.delete(chats).where(eq(chats.id, params.id));

    return { ok: true };
  })
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
        system: [
          "You are OpenCode, an expert coding assistant.",
          `Working directory: ${body.path}`,
          "Core behavior:",
          "- Follow the user's latest request precisely.",
          "- Prefer repository conventions over novelty.",
          "- Make minimal, high-confidence changes.",
          "- Be concise and direct.",
          "Execution policy:",
          "- For non-trivial requests, inspect first, then edit in small reversible steps.",
          "- Prefer grep or glob to locate code before reading files.",
          "- Prefer read with focused ranges instead of reading entire large files.",
          "- Prefer edit for targeted changes inside existing files.",
          "- Use write to create new files or replace a file only when a targeted edit is not practical.",
          "- Use bash for terminal tasks only, not file editing.",
          "- When user intent is clear enough, act without asking extra permission.",
          "- Ask only if ambiguity would materially change the implementation.",
          "Output policy:",
          "- Report what changed and where.",
          "- Summarize command output instead of dumping noise.",
          "Ignore patterns:",
          ...DEFAULT_IGNORE_PATTERNS.map((pattern) => `- ${pattern}`),
        ].join("\n"),
        messages: await convertToModelMessages(body.messages),
        tools,
        stopWhen: stepCountIs(100),
        maxRetries: 3,
        experimental_transform: smoothStream(),
      });

      return result.toUIMessageStreamResponse({
        originalMessages: body.messages,
        onFinish: async ({ messages }) => {
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
