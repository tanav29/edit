import { db } from "@/db";
import { chats } from "@/db/schema";
import { buildStoredMessages } from "@/lib/chat-store-utils";
import { and, eq } from "drizzle-orm";
import { UIMessage } from "ai";

export async function storeMessages({
  id,
  messages,
  workspace,
}: {
  id: string;
  messages: UIMessage[];
  workspace: string;
}) {
  const now = Date.now();

  const existing = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.workspacePath, workspace)))
    .limit(1);

  const { nextMessages, title } = buildStoredMessages({
    incomingMessages: messages,
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
