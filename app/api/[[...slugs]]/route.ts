import { db } from "@/db";
import { chats } from "@/db/schema";
import { getTitleFromMessages } from "@/lib/utils";
import { parseMessages } from "@/lib/utils";
import { and, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { z } from "zod";

import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { ollama } from "ollama-ai-provider-v2";

import { createTools, DEFAULT_IGNORE_PATTERNS } from "@/lib/tool";
import { api } from "@/lib/eden";
import { storeMessages } from "./store";

export const runtime = "nodejs";

export const app = new Elysia({ prefix: "/api" })
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
      // this api returns the chat session if it exists, otherwise returns null
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
        messages: parseMessages(chat.messages),
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  )
  .get("favicon/:path", async ({ params }) => {
    const paths = ["favicon.ico", "app/favicon.ico", "src/app/favicon.ico"];
  })
  .post(
    "/store",
    async ({ body }) => {
      // this api creates or updates the chat session
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
    async ({ body }) => {
      if (
        !body ||
        !Array.isArray(body.messages) ||
        typeof body.path !== "string"
      ) {
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }
      await api.store.post({
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
         // Provide original messages so `onFinish` returns the full updated array,
         // not just the new assistant message.
         originalMessages: body.messages,
         onFinish: async ({ messages }) => {
           await storeMessages({
             id: body.id,
             messages,
             workspace: body.path,
             merge: true,
           });
         },
       });
     },
     {
       body: z.object({
         id: z.string(),
        messages: z.array(z.any()) as z.ZodType<UIMessage[]>,
        path: z.string(),
      }),
    },
  );

export const GET = app.fetch;
export const POST = app.fetch;
