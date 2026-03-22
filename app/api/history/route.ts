import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { chatSessions, chatMessages } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";

export async function GET() {
  try {
    const sessions = await db.query.chatSessions.findMany({
      with: {
        chatMessages: {
          orderBy: [asc(chatMessages.position)],
        },
      },
      orderBy: [desc(chatSessions.updatedAt)],
    });

    return NextResponse.json(
      sessions.map((session) => ({
        id: session.id,
        name: session.name,
        path: session.path,
        messages: session.chatMessages.map((m) => ({
          id: m.messageId,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.getTime(),
        })),
        createdAt: session.createdAt.getTime(),
        updatedAt: session.updatedAt.getTime(),
      })),
    );
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, path, messages, createdAt, updatedAt } = body;

    if (!id || !name || !path) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const existing = await db.query.chatSessions.findFirst({
      where: eq(chatSessions.id, id),
    });

    if (existing) {
      await db.transaction(async (tx) => {
        await tx
          .delete(chatMessages)
          .where(eq(chatMessages.sessionId, id));

        await tx
          .update(chatSessions)
          .set({
            name,
            path,
            updatedAt: new Date(updatedAt || Date.now()),
          })
          .where(eq(chatSessions.id, id));

        if (messages && messages.length > 0) {
          await tx.insert(chatMessages).values(
            messages.map(
              (
                m: { id: string; role: string; content: string; timestamp: number },
                idx: number,
              ) => ({
                messageId: m.id,
                role: m.role,
                content: m.content,
                timestamp: new Date(m.timestamp),
                position: idx,
                sessionId: id,
              }),
            ),
          );
        }
      });
    } else {
      await db.insert(chatSessions).values({
        id,
        name,
        path,
        createdAt: new Date(createdAt || Date.now()),
        updatedAt: new Date(updatedAt || Date.now()),
      });

      if (messages && messages.length > 0) {
        await db.insert(chatMessages).values(
          messages.map(
            (
              m: { id: string; role: string; content: string; timestamp: number },
              idx: number,
            ) => ({
              messageId: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.timestamp),
              position: idx,
              sessionId: id,
            }),
          ),
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save session:", error);
    return NextResponse.json(
      { error: "Failed to save session" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId" },
        { status: 400 },
      );
    }

    await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete session:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 },
    );
  }
}
