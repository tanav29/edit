import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

interface ChatSessionPayload {
  id: string;
  name: string;
  path: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

interface StoredChatMessage {
  messageId: string;
  role: string;
  content: string;
  timestamp: Date;
  position: number;
}

interface StoredChatSession {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
  messages: StoredChatMessage[];
}

function isChatSession(value: unknown): value is ChatSessionPayload {
  if (typeof value !== "object" || value === null) return false;

  const session = value as Record<string, unknown>;

  if (typeof session.id !== "string") return false;
  if (typeof session.name !== "string") return false;
  if (typeof session.path !== "string") return false;
  if (!Array.isArray(session.messages)) return false;
  if (typeof session.createdAt !== "number") return false;
  if (typeof session.updatedAt !== "number") return false;

  return true;
}

export async function GET() {
  try {
    const sessions = (await prisma.chatSession.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { position: "asc" },
        },
      },
    })) as StoredChatSession[];

    return NextResponse.json(
      sessions.map((session: StoredChatSession) => ({
        id: session.id,
        name: session.name,
        path: session.path,
        createdAt: session.createdAt.getTime(),
        updatedAt: session.updatedAt.getTime(),
        messages: session.messages.map((message: StoredChatMessage) => ({
          id: message.messageId,
          role: message.role as "user" | "assistant",
          content: message.content,
          timestamp: message.timestamp.getTime(),
        })),
      })),
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session: ChatSessionPayload = await req.json();

    if (!isChatSession(session)) {
      return NextResponse.json({ error: "Invalid session payload" }, { status: 400 });
    }

    await prisma.chatSession.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        name: session.name,
        path: session.path,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
      },
      update: {
        name: session.name,
        path: session.path,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
      },
    });

    await prisma.chatMessage.deleteMany({
      where: { sessionId: session.id },
    });

    if (session.messages.length > 0) {
      await prisma.chatMessage.createMany({
        data: session.messages.map((message, index) => ({
          messageId: message.id,
          role: message.role,
          content: message.content,
          timestamp: new Date(message.timestamp),
          position: index,
          sessionId: session.id,
        })),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { sessionPath, sessionId } = await req.json();

    if (sessionPath && sessionId) {
      await prisma.chatSession.deleteMany({
        where: {
          id: sessionId,
          path: sessionPath,
        },
      });

      return NextResponse.json({ success: true });
    }

    if (sessionPath) {
      await prisma.chatSession.deleteMany({
        where: { path: sessionPath },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
