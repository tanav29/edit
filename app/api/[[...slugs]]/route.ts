import { db } from "@/db";
import { chats } from "@/db/schema";
import { getTitleFromMessages } from "@/lib/utils";
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
  .get("/store/:id", async ({ params }) => {
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

    return chat;
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

      const now = Date.now();
      const serializedMessages = JSON.stringify(messages);
      const title = getTitleFromMessages(messages);

      const existing = await db
        .select()
        .from(chats)
        .where(
          and(eq(chats.id, body.id), eq(chats.workspacePath, body.workspace)),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!existing) {
        await db.insert(chats).values({
          id: body.id,
          workspacePath: body.workspace,
          title,
          messages: serializedMessages,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await db
          .update(chats)
          .set({
            title,
            messages: serializedMessages,
            updatedAt: now,
          })
          .where(
            and(eq(chats.id, body.id), eq(chats.workspacePath, body.workspace)),
          );
      }

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

      const tools = createTools(body.path);

      const result = streamText({
        model: ollama("minimax-m2.5:cloud"),
        system: `You are a powerful coding assistant/general. Working directory: ${body.path}. Ignore patterns: ${DEFAULT_IGNORE_PATTERNS.map((pattern) => `- ${pattern}`).join("\n")}. Be concise and direct.`,
        messages: await convertToModelMessages(body.messages),
        tools,
        stopWhen: stepCountIs(100),
        maxRetries: 3,
        experimental_transform: smoothStream(),
      });

      return result.toUIMessageStreamResponse();
    },
    {
      body: z.object({
        messages: z.array(z.any()) as z.ZodType<UIMessage[]>,
        path: z.string(),
      }),
    },
  );

export const GET = app.fetch;
export const POST = app.fetch;
