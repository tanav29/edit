import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { buildStoredMessages } from "@/lib/chat-store-utils";

const userMessage = (id: string, text: string) =>
  ({
    id,
    role: "user",
    parts: [{ type: "text", text }],
  }) as const;

const assistantMessage = (id: string, text: string) =>
  ({
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  }) as const;

describe("buildStoredMessages", () => {
  test("normalizes reversed incoming messages before saving", () => {
    // Incoming can arrive newest-first; we save oldest-first to keep chat history stable.
    const incomingMessages = [
      assistantMessage("a1", "Sure, here is the fix"),
      userMessage("u1", "Please fix history saving"),
    ];

    const result = buildStoredMessages({
      incomingMessages: incomingMessages as UIMessage[],
      merge: false,
    });

    expect(result.nextMessages.map((message) => message.id)).toEqual([
      "u1",
      "a1",
    ]);
    expect(result.title).toBe("Please fix history saving");
  });

  test("merges existing and incoming history in chronological order", () => {
    const existingMessages = [
      userMessage("u1", "first question"),
      assistantMessage("a1", "first answer"),
    ];

    // New pair comes back reversed from stream finish payload.
    const incomingMessages = [
      assistantMessage("a2", "second answer"),
      userMessage("u2", "second question"),
    ];

    const result = buildStoredMessages({
      existingMessages: existingMessages as UIMessage[],
      incomingMessages: incomingMessages as UIMessage[],
      merge: true,
    });

    expect(result.nextMessages.map((message) => message.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
    ]);
    expect(result.title).toBe("first question");
  });
});
