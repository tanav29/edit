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
