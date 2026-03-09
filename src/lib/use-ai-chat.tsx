"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { createOpenAI } from "@ai-sdk/openai";
import { tools, ToolNames } from "@/lib/ai-tool";
import { streamText } from "ai";

const DEFAULT_SESSION_KEY = "__default__";
const EMPTY_MESSAGES: UIMessage[] = [];

export interface TextPart {
  type: "text";
  text: string;
  state?: "streaming" | "complete";
}

export interface ImagePart {
  type: "image";
  data: string;
  mediaType: string;
  name?: string;
}

export interface ToolCallPart {
  type: string;
  toolCallId: string;
  toolName: string;
  state:
    | "pending"
    | "running"
    | "output-available"
    | "output-error"
    | "approval-requested"
    | "output-denied"
    | "approval-responded";
  input?: unknown;
  output?: unknown;
  title?: string;
  approval?: { id: string; approved?: boolean };
}

export type MessagePart = TextPart | ImagePart | ToolCallPart;

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  createdAt?: Date;
}

export type ChatStatus = "idle" | "submitted" | "streaming";

interface UseAIChatOptions {
  workspacePath: string;
  sessionId?: string;
  model?: string;
}

const openai = createOpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || "dummy-key",
});

export function useAIChat({ workspacePath, sessionId, model }: UseAIChatOptions) {
  const currentSessionKey = sessionId || workspacePath || DEFAULT_SESSION_KEY;
  const [messagesBySession, setMessagesBySession] = useState<Record<string, UIMessage[]>>({});
  const [statusBySession, setStatusBySession] = useState<Record<string, ChatStatus>>({});
  const [pendingToolCalls, setPendingToolCalls] = useState<Record<string, ToolCallPart[]>>({});

  const messages = messagesBySession[currentSessionKey] ?? EMPTY_MESSAGES;
  const status = statusBySession[currentSessionKey] || "idle";

  const setSessionStatus = useCallback((key: string, nextStatus: ChatStatus) => {
    setStatusBySession((prev) => ({ ...prev, [key]: nextStatus }));
  }, []);

  const hasSessionMessages = useCallback(
    (key: string) => {
      return (messagesBySession[key]?.length || 0) > 0;
    },
    [messagesBySession]
  );

  const getSessionStatus = useCallback(
    (key: string): ChatStatus => {
      return statusBySession[key] || "idle";
    },
    [statusBySession]
  );

  const sessionNeedsToolApproval = useCallback(
    (key: string) => {
      const sessionMessages = messagesBySession[key] || EMPTY_MESSAGES;
      for (const message of sessionMessages) {
        for (const part of message.parts) {
          if (part.type !== "text" && (part as ToolCallPart).state === "approval-requested") {
            return true;
          }
        }
      }
      return false;
    },
    [messagesBySession]
  );

  const setMessagesExternal = useCallback((msgs: UIMessage[]) => {
    setMessagesBySession((prev) => ({
      ...prev,
      [currentSessionKey]: msgs,
    }));
  }, [currentSessionKey]);

  const appendMessagePart = useCallback(
    (part: MessagePart) => {
      setMessagesBySession((prev) => {
        const sessionMessages = prev[currentSessionKey] || [];
        const updated = [...sessionMessages];
        const lastIdx = updated.length - 1;
        if (lastIdx < 0) return prev;

        const lastMsg = { ...updated[lastIdx] };
        lastMsg.parts = [...lastMsg.parts, part];
        updated[lastIdx] = lastMsg;

        return {
          ...prev,
          [currentSessionKey]: updated,
        };
      });
    },
    [currentSessionKey]
  );

  const updateLastMessagePart = useCallback(
    (updater: (parts: MessagePart[]) => MessagePart[]) => {
      setMessagesBySession((prev) => {
        const sessionMessages = prev[currentSessionKey] || [];
        const updated = [...sessionMessages];
        const lastIdx = updated.length - 1;
        if (lastIdx < 0) return prev;

        const lastMsg = { ...updated[lastIdx] };
        lastMsg.parts = updater(lastMsg.parts);
        updated[lastIdx] = lastMsg;

        return {
          ...prev,
          [currentSessionKey]: updated,
        };
      });
    },
    [currentSessionKey]
  );

  const sendMessage = useCallback(
    async (input: { parts: Array<{ type: "text"; text: string } | ImagePart> }) => {
      const userText = input.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");

      const userImages = input.parts.filter((p): p is ImagePart => p.type === "image");

      if (!userText.trim() && userImages.length === 0) return;

      const sessionKey = currentSessionKey;

      const userMessage: UIMessage = {
        id: `msg-user-${Date.now()}`,
        role: "user",
        parts: input.parts,
        createdAt: new Date(),
      };

      const assistantMsgId = `msg-assistant-${Date.now()}`;

      setMessagesBySession((prev) => {
        const current = prev[sessionKey] || [];
        return {
          ...prev,
          [sessionKey]: [
            ...current,
            userMessage,
            {
              id: assistantMsgId,
              role: "assistant",
              parts: [],
              createdAt: new Date(),
            },
          ],
        };
      });

      setSessionStatus(sessionKey, "submitted");

      const result = streamText({
        model: openai(model || "gpt-4o-mini"),
        messages: [
          ...messages.map((msg) => ({
            role: msg.role,
            content: msg.parts
              .filter((p): p is TextPart => p.type === "text")
              .map((p) => p.text)
              .join(""),
          })),
          {
            role: "user" as const,
            content: userText,
          },
        ],
        tools,
      });

      setSessionStatus(sessionKey, "streaming");

      for await (const chunk of result.textStream) {
        updateLastMessagePart((parts) => {
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart.type === "text") {
            return [
              ...parts.slice(0, -1),
              {
                type: "text" as const,
                text: (lastPart as TextPart).text + chunk,
                state: "streaming",
              },
            ];
          }
          return [
            ...parts,
            {
              type: "text",
              text: chunk,
              state: "streaming",
            },
          ];
        });
      }

      for await (const toolCall of result.toolCalls) {
        const toolPart: ToolCallPart = {
          type: `tool-${toolCall.toolName}`,
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          state: "running",
          input: toolCall.args,
        };

        updateLastMessagePart((parts) => [...parts, toolPart]);

        const toolResult = await toolCall.execute();

        updateLastMessagePart((parts) =>
          parts.map((p) => {
            if (p.type !== "text" && (p as ToolCallPart).toolCallId === toolCall.toolCallId) {
              return {
                ...(p as ToolCallPart),
                state: "output-available",
                output: toolResult,
              };
            }
            return p;
          })
        );
      }

      updateLastMessagePart((parts) =>
        parts.map((p) => {
          if (p.type === "text") {
            return { ...(p as TextPart), state: "complete" };
          }
          return p;
        })
      );

      setSessionStatus(sessionKey, "idle");
    },
    [messages, workspacePath, model, currentSessionKey, setSessionStatus, updateLastMessagePart]
  );

  const addToolApprovalResponse = useCallback(
    async (response: { id: string; approved: boolean }) => {
      setMessagesBySession((prev) => {
        const next = { ...prev };
        const sessionKeys = Object.keys(next);

        for (const key of sessionKeys) {
          const sessionMessages = next[key] || [];
          const updated = [...sessionMessages];
          let changed = false;

          for (let i = updated.length - 1; i >= 0; i--) {
            const msg = updated[i];
            if (msg.role === "assistant") {
              const parts = [...msg.parts];
              for (let j = 0; j < parts.length; j++) {
                const p = parts[j];
                if (p.type !== "text" && (p as ToolCallPart).toolCallId === response.id) {
                  parts[j] = {
                    ...(p as ToolCallPart),
                    state: response.approved ? "running" : "output-denied",
                    approval: { id: response.id, approved: response.approved },
                  };
                  updated[i] = { ...msg, parts };
                  changed = true;
                  break;
                }
              }
            }
            if (changed) break;
          }

          if (changed) {
            next[key] = updated;
            return next;
          }
        }

        return prev;
      });
    },
    []
  );

  const stop = useCallback(() => {
    setSessionStatus(currentSessionKey, "idle");
  }, [currentSessionKey, setSessionStatus]);

  return {
    messages,
    setMessages: setMessagesExternal,
    hasSessionMessages,
    getSessionStatus,
    sessionNeedsToolApproval,
    sendMessage,
    status,
    addToolApprovalResponse,
    stop,
  };
}
