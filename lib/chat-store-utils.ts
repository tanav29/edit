import { getTitleFromMessages, normalizeMessageOrder } from "@/lib/utils";
import { UIMessage } from "ai";

export function buildStoredMessages({
  incomingMessages,
}: {
  incomingMessages: UIMessage[];
}) {
  const normalizedIncoming = normalizeMessageOrder(incomingMessages);
  const nextMessages = normalizedIncoming;

  return {
    nextMessages,
    title: getTitleFromMessages(nextMessages),
  };
}
