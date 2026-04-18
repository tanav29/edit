import { db } from "@/db";
import { chats } from "@/db/schema";
import { buildStoredMessages } from "@/lib/chat-store-utils";
import { UIMessage } from "ai";
import { and, eq } from "drizzle-orm";

function safeParseMessages(raw: unknown): UIMessage[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

export async function storeMessages({
  id,
  messages,
  workspace,
  merge = false,
}: {
  id: string;
  messages: UIMessage[];
  workspace: string;
  merge?: boolean;
}) {
  const now = Date.now();

  const existing = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.workspacePath, workspace)))
    .limit(1);

  const { nextMessages, title } = buildStoredMessages({
    existingMessages: safeParseMessages(existing[0]?.messages),
    incomingMessages: messages,
    merge: merge && existing.length > 0,
  });

  const serializedMessages = JSON.stringify(nextMessages);

  if (existing.length === 0) {
    await db.insert(chats).values({
      id,
      workspacePath: workspace,
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
      .where(and(eq(chats.id, id), eq(chats.workspacePath, workspace)));
  }
}
