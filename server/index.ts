import { Elysia, t } from "elysia";
import {
  streamText,
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  type UIMessage,
} from "ai";
import { ollama } from "ollama-ai-provider-v2";
import { db } from "@/db/index";
import { chatSessions, chatMessages } from "@/db/schema";
import { createTools, DEFAULT_IGNORE_PATTERNS } from "@/lib/tool";
import { eq, asc, desc, and } from "drizzle-orm";

type ChatRole = "user" | "assistant";

type ChatMessagePayload = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
};

type ChatSessionPayload = {
  id: string;
  name: string;
  path: string;
  messages: ChatMessagePayload[];
  createdAt: number;
  updatedAt: number;
};

type HistoryDeletePayload = {
  sessionPath?: string;
  sessionId?: string;
};

function isChatSession(value: unknown): value is ChatSessionPayload {
  if (typeof value !== "object" || value === null) return false;

  const session = value as Record<string, unknown>;

  if (typeof session.id !== "string") return false;
  if (typeof session.name !== "string") return false;
  if (typeof session.path !== "string") return false;
  if (!Array.isArray(session.messages)) return false;
  if (typeof session.createdAt !== "number") return false;
  if (typeof session.updatedAt !== "number") return false;

  return session.messages.every((message) => {
    if (typeof message !== "object" || message === null) return false;

    const item = message as Record<string, unknown>;

    return (
      typeof item.id === "string" &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" &&
      typeof item.timestamp === "number"
    );
  });
}

function extractTextFromMessages(messages: UIMessage[]): ChatMessagePayload[] {
  return messages.map((message, index) => {
    const content = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    return {
      id: message.id || `message-${Date.now()}-${index}`,
      role: message.role === "assistant" ? "assistant" : "user",
      content,
      timestamp: Date.now() + index,
    };
  });
}

const chatBodySchema = t.Object({
  messages: t.Array(t.Any()),
  path: t.String(),
  sessionId: t.Optional(t.String()),
  sessionName: t.Optional(t.String()),
});

const historyMessageSchema = t.Object({
  id: t.String(),
  role: t.Union([t.Literal("user"), t.Literal("assistant")]),
  content: t.String(),
  timestamp: t.Number(),
});

const historySessionSchema = t.Object({
  id: t.String(),
  name: t.String(),
  path: t.String(),
  messages: t.Array(historyMessageSchema),
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

const historyDeleteSchema = t.Object({
  sessionPath: t.Optional(t.String()),
  sessionId: t.Optional(t.String()),
});

export const serverApp = new Elysia({ prefix: "/api" })
  .get("/history", async () => {
    const sessions = await db.query.chatSessions.findMany({
      with: {
        chatMessages: {
          orderBy: [asc(chatMessages.position)],
        },
      },
      orderBy: [desc(chatSessions.updatedAt)],
    });

    return sessions.map((session) => ({
      id: session.id,
      name: session.name,
      path: session.path,
      createdAt: session.createdAt.getTime(),
      updatedAt: session.updatedAt.getTime(),
      messages: session.chatMessages.map((m) => ({
        id: m.messageId,
        role: m.role as ChatRole,
        content: m.content,
        timestamp: m.timestamp.getTime(),
      })),
    }));
  })
  .post(
    "/history",
    async ({ body, set }) => {
      if (!isChatSession(body)) {
        set.status = 400;
        return { error: "Invalid session payload" };
      }

      const existing = await db.query.chatSessions.findFirst({
        where: eq(chatSessions.id, body.id),
      });

      if (existing) {
        await db
          .update(chatSessions)
          .set({
            name: body.name,
            path: body.path,
            updatedAt: new Date(body.updatedAt),
          })
          .where(eq(chatSessions.id, body.id));
      } else {
        await db.insert(chatSessions).values({
          id: body.id,
          name: body.name,
          path: body.path,
          createdAt: new Date(body.createdAt),
          updatedAt: new Date(body.updatedAt),
        });
      }

      await db
        .delete(chatMessages)
        .where(eq(chatMessages.sessionId, body.id));

      if (body.messages.length > 0) {
        await db.insert(chatMessages).values(
          body.messages.map((message, index) => ({
            messageId: message.id,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.timestamp),
            position: index,
            sessionId: body.id,
          })),
        );
      }

      return { success: true };
    },
    {
      body: historySessionSchema,
    },
  )
  .delete(
    "/history",
    async ({ body }) => {
      const { sessionPath, sessionId } = body as HistoryDeletePayload;

      if (sessionId) {
        await db
          .delete(chatSessions)
          .where(
            sessionPath
              ? and(
                  eq(chatSessions.id, sessionId),
                  eq(chatSessions.path, sessionPath),
                )
              : eq(chatSessions.id, sessionId),
          );
        return { success: true };
      }

      if (sessionPath) {
        await db
          .delete(chatSessions)
          .where(eq(chatSessions.path, sessionPath));
      }

      return { success: true };
    },
    {
      body: historyDeleteSchema,
    },
  )
  .post(
    "/chat",
    async ({ body }) => {
      const tools = createTools(body.path);

      const result = streamText({
        model: ollama("minimax-m2.5:cloud"),
        system: `You are a powerful coding assistant/general. Working directory: ${body.path}. Ignore patterns: ${DEFAULT_IGNORE_PATTERNS.map((pattern: string) => `- ${pattern}`).join("\n")}. Be concise and direct.`,
        messages: await convertToModelMessages(body.messages as UIMessage[]),
        tools,
        stopWhen: stepCountIs(30),
        maxRetries: 3,
        experimental_transform: smoothStream(),
        onFinish: async ({ response }) => {
          if (!body.sessionId || !body.sessionName) return;

          const storedMessages = extractTextFromMessages(
            response.messages as unknown as UIMessage[],
          );
          const now = Date.now();

          const existing = await db.query.chatSessions.findFirst({
            where: eq(chatSessions.id, body.sessionId!),
          });

          if (existing) {
            await db
              .update(chatSessions)
              .set({
                name: body.sessionName,
                path: body.path,
                updatedAt: new Date(now),
              })
              .where(eq(chatSessions.id, body.sessionId!));
          } else {
            await db.insert(chatSessions).values({
              id: body.sessionId!,
              name: body.sessionName,
              path: body.path,
              createdAt: new Date(now),
              updatedAt: new Date(now),
            });
          }

          await db
            .delete(chatMessages)
            .where(eq(chatMessages.sessionId, body.sessionId!));

          if (storedMessages.length > 0) {
            await db.insert(chatMessages).values(
              storedMessages.map((message, index) => ({
                messageId: message.id,
                role: message.role,
                content: message.content,
                timestamp: new Date(message.timestamp),
                position: index,
                sessionId: body.sessionId!,
              })),
            );
          }
        },
      });

      return result.toUIMessageStreamResponse();
    },
    {
      body: chatBodySchema,
    },
  );

export const GET = serverApp.fetch;
export const POST = serverApp.fetch;
export const DELETE = serverApp.fetch;

export type App = typeof serverApp;
