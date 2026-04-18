import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { buildStoredMessages } from "@/lib/chat-store-utils";

const userMessage = (id: string, text: string) =>
  ({
    id,
    role: "user",
    parts: [{ type: "text", text }],
  }) as UIMessage;

const assistantMessage = (id: string, text: string) =>
  ({
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  }) as UIMessage;

describe("buildStoredMessages", () => {
  test("normalizes reversed incoming messages before saving", () => {
    // Incoming can arrive newest-first; we save oldest-first to keep chat history stable.
    const incomingMessages = [
      assistantMessage("a1", "Sure, here is the fix"),
      userMessage("u1", "Please fix history saving"),
    ];

    const result = buildStoredMessages({
      incomingMessages,
    });

    expect(result.nextMessages.map((message) => message.id)).toEqual([
      "u1",
      "a1",
    ]);
    expect(result.title).toBe("Please fix history saving");
  });

  test("rewrites with incoming history and keeps it chronological", () => {
    // Incoming stream-finish payload can be reversed; saved history should be normalized.
    const incomingMessages = [
      assistantMessage("a2", "second answer"),
      userMessage("u2", "second question"),
    ];

    const result = buildStoredMessages({
      incomingMessages,
    });

    expect(result.nextMessages.map((message) => message.id)).toEqual([
      "u2",
      "a2",
    ]);
    expect(result.title).toBe("second question");
  });
});
