import { db } from "@/db";
import { chats } from "@/db/schema";
import { getTitleFromMessages } from "@/lib/utils";
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

function mergeMessages(existing: UIMessage[], incoming: UIMessage[]): UIMessage[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  // Append-safe merge keyed by message id.
  // Keeps existing order, overwrites matching ids with incoming,
  // and appends truly new messages.
  const next = existing.slice();
  const indexById = new Map<string, number>();
  for (let i = 0; i < next.length; i += 1) {
    indexById.set(next[i]?.id, i);
  }

  for (const message of incoming) {
    const idx = indexById.get(message.id);
    if (idx == null) {
      indexById.set(message.id, next.length);
      next.push(message);
    } else {
      next[idx] = message;
    }
  }

  return next;
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

  const nextMessages =
    merge && existing.length > 0
      ? mergeMessages(safeParseMessages(existing[0]?.messages), messages)
      : messages;

  const serializedMessages = JSON.stringify(nextMessages);
  const title = getTitleFromMessages(nextMessages);

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
