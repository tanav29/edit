import { getTitleFromMessages, normalizeMessageOrder } from "@/lib/utils";
import { UIMessage } from "ai";

function mergeMessages(
  existing: UIMessage[],
  incoming: UIMessage[],
): UIMessage[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  // Keep original order while upserting by id and appending new messages.
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

export function buildStoredMessages({
  existingMessages = [],
  incomingMessages,
  merge = false,
}: {
  existingMessages?: UIMessage[];
  incomingMessages: UIMessage[];
  merge?: boolean;
}) {
  const normalizedIncoming = normalizeMessageOrder(incomingMessages);
  const normalizedExisting = normalizeMessageOrder(existingMessages);

  const nextMessages =
    merge && normalizedExisting.length > 0
      ? mergeMessages(normalizedExisting, normalizedIncoming)
      : normalizedIncoming;

  return {
    nextMessages,
    title: getTitleFromMessages(nextMessages),
  };
}
