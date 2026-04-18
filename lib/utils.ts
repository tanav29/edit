import { UIMessage } from "ai";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getProjectName(sessionPath: string) {
  const parts = sessionPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || sessionPath;
}

export function getTitleFromMessages(messages: UIMessage[]) {
  for (const message of messages) {
    if (message.role !== "user") continue;

    for (const part of message.parts) {
      if (part.type !== "text") continue;

      const normalized = part.text.replace(/\s+/g, " ").trim();
      if (!normalized) continue;

      return normalized.slice(0, 80);
    }
  }

  return "New chat";
}

export function parseMessages(raw: string | null | undefined): UIMessage[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

function scoreMessageOrder(messages: UIMessage[]) {
  if (messages.length <= 1) return 0;

  let score = 0;

  const firstRole = messages[0]?.role;
  if (firstRole === "user") {
    score += 2;
  } else if (firstRole === "assistant") {
    score -= 2;
  }

  for (let i = 1; i < messages.length; i += 1) {
    if (messages[i - 1]?.role !== messages[i]?.role) {
      score += 1;
    }
  }

  return score;
}

export function normalizeMessageOrder(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= 1) return messages;

  const reversed = [...messages].reverse();
  const directScore = scoreMessageOrder(messages);
  const reversedScore = scoreMessageOrder(reversed);

  return reversedScore > directScore ? reversed : messages;
}
