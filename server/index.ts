import { Elysia, t } from "elysia";
import {
  streamText,
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  type UIMessage,
} from "ai";
import { ollama } from "ollama-ai-provider-v2";
import { prisma } from "@/lib/prisma";
import { createTools, DEFAULT_IGNORE_PATTERNS } from "@/lib/tool";

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

type StoredChatMessage = {
  messageId: string;
  role: string;
  content: string;
  timestamp: Date;
  position: number;
};

type StoredChatSession = {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
  messages: StoredChatMessage[];
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

function toHistoryResponse(session: StoredChatSession) {
  return {
    id: session.id,
    name: session.name,
    path: session.path,
    createdAt: session.createdAt.getTime(),
    updatedAt: session.updatedAt.getTime(),
    messages: session.messages.map((message) => ({
      id: message.messageId,
      role: message.role as ChatRole,
      content: message.content,
      timestamp: message.timestamp.getTime(),
    })),
  };
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
    const sessions = (await prisma.chatSession.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { position: "asc" },
        },
      },
    })) as StoredChatSession[];

    return sessions.map(toHistoryResponse);
  })
  .post(
    "/history",
    async ({ body, set }) => {
      if (!isChatSession(body)) {
        set.status = 400;
        return { error: "Invalid session payload" };
      }

      await prisma.chatSession.upsert({
        where: { id: body.id },
        create: {
          id: body.id,
          name: body.name,
          path: body.path,
          createdAt: new Date(body.createdAt),
          updatedAt: new Date(body.updatedAt),
        },
        update: {
          name: body.name,
          path: body.path,
          createdAt: new Date(body.createdAt),
          updatedAt: new Date(body.updatedAt),
        },
      });

      await prisma.chatMessage.deleteMany({
        where: { sessionId: body.id },
      });

      if (body.messages.length > 0) {
        await prisma.chatMessage.createMany({
          data: body.messages.map((message, index) => ({
            messageId: message.id,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.timestamp),
            position: index,
            sessionId: body.id,
          })),
        });
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

      if (sessionPath && sessionId) {
        await prisma.chatSession.deleteMany({
          where: {
            id: sessionId,
            path: sessionPath,
          },
        });

        return { success: true };
      }

      if (sessionPath) {
        await prisma.chatSession.deleteMany({
          where: { path: sessionPath },
        });
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

          await prisma.chatSession.upsert({
            where: { id: body.sessionId },
            create: {
              id: body.sessionId,
              name: body.sessionName,
              path: body.path,
              createdAt: new Date(now),
              updatedAt: new Date(now),
            },
            update: {
              name: body.sessionName,
              path: body.path,
              updatedAt: new Date(now),
            },
          });

          await prisma.chatMessage.deleteMany({
            where: { sessionId: body.sessionId },
          });

          if (storedMessages.length > 0) {
            await prisma.chatMessage.createMany({
              data: storedMessages.map((message, index) => ({
                messageId: message.id,
                role: message.role,
                content: message.content,
                timestamp: new Date(message.timestamp),
                position: index,
                sessionId: body.sessionId!,
              })),
            });
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
