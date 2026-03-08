"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  sendChatMessage,
  listenChatStream,
  approveToolCall,
  stopChat,
  type ChatStreamEvent,
  type OllamaMessage,
} from "@/lib/tauri-api"

// Message part types that match the existing UI component expectations
export interface TextPart {
  type: "text"
  text: string
  state?: "streaming" | "complete"
}

export interface ImagePart {
  type: "image"
  data: string
  mediaType: string
  name?: string
}

export interface ToolCallPart {
  type: string // "tool-read", "tool-write", "tool-bash", "tool-glob"
  toolCallId: string
  toolName: string
  state: "pending" | "running" | "output-available" | "output-error" | "approval-requested" | "output-denied" | "approval-responded"
  input?: unknown
  output?: unknown
  title?: string
  approval?: { id: string; approved?: boolean }
}

export type MessagePart = TextPart | ImagePart | ToolCallPart

export interface UIMessage {
  id: string
  role: "user" | "assistant"
  parts: MessagePart[]
  createdAt?: Date
}

export type ChatStatus = "idle" | "submitted" | "streaming"

interface UseTauriChatOptions {
  workspacePath: string
  sessionId?: string
  model?: string
}

const DEFAULT_SESSION_KEY = "__default__"
const EMPTY_MESSAGES: UIMessage[] = []

type SessionRuntime = {
  chatId: string
  unlisten: (() => void) | null
}

export function useTauriChat({ workspacePath, sessionId, model }: UseTauriChatOptions) {
  const currentSessionKey = sessionId || workspacePath || DEFAULT_SESSION_KEY
  const [messagesBySession, setMessagesBySession] = useState<Record<string, UIMessage[]>>({})
  const [statusBySession, setStatusBySession] = useState<Record<string, ChatStatus>>({})
  const runtimesRef = useRef<Record<string, SessionRuntime>>({})

  const messages = messagesBySession[currentSessionKey] ?? EMPTY_MESSAGES
  const status = statusBySession[currentSessionKey] || "idle"

  useEffect(() => {
    return () => {
      Object.values(runtimesRef.current).forEach((runtime) => {
        if (runtime.unlisten) {
          runtime.unlisten()
        }
      })
      runtimesRef.current = {}
    }
  }, [])

  const setSessionStatus = useCallback((key: string, nextStatus: ChatStatus) => {
    setStatusBySession((prev) => ({ ...prev, [key]: nextStatus }))
  }, [])

  const hasSessionMessages = useCallback(
    (key: string) => {
      return (messagesBySession[key]?.length || 0) > 0
    },
    [messagesBySession]
  )

  const getSessionStatus = useCallback(
    (key: string): ChatStatus => {
      return statusBySession[key] || "idle"
    },
    [statusBySession]
  )

  const sessionNeedsToolApproval = useCallback(
    (key: string) => {
      const sessionMessages = messagesBySession[key] || EMPTY_MESSAGES
      for (const message of sessionMessages) {
        for (const part of message.parts) {
          if (
            part.type !== "text" &&
            (part as ToolCallPart).state === "approval-requested"
          ) {
            return true
          }
        }
      }
      return false
    },
    [messagesBySession]
  )

  const setMessagesExternal = useCallback((msgs: UIMessage[]) => {
    setMessagesBySession((prev) => ({
      ...prev,
      [currentSessionKey]: msgs,
    }))
  }, [currentSessionKey])

  const sendMessage = useCallback(
    async (input: { parts: Array<{ type: "text"; text: string } | ImagePart> }) => {
      const userText = input.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("")

      const userImages = input.parts.filter((p): p is ImagePart => p.type === "image")

      if (!userText.trim() && userImages.length === 0) return

      const sessionKey = currentSessionKey
      const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      const existingRuntime = runtimesRef.current[sessionKey]
      if (existingRuntime?.unlisten) {
        existingRuntime.unlisten()
      }
      runtimesRef.current[sessionKey] = { chatId, unlisten: null }

      // Add user message
      const userMessage: UIMessage = {
        id: `msg-user-${Date.now()}`,
        role: "user",
        parts: input.parts,
        createdAt: new Date(),
      }

      // Add assistant placeholder
      const assistantMsgId = `msg-assistant-${Date.now()}`

      setMessagesBySession((prev) => {
        const current = prev[sessionKey] || []
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
        }
      })

      setSessionStatus(sessionKey, "submitted")

      // Build Ollama messages from history
      const ollamaMessages: OllamaMessage[] = []
      const allMsgs = [...messages, userMessage]

      for (const msg of allMsgs) {
        if (msg.role === "user") {
          const text = msg.parts
            .filter((p): p is TextPart => p.type === "text")
            .map((p) => p.text)
            .join("")

          const images = msg.parts
            .filter((p): p is ImagePart => p.type === "image")
            .map((p) => p.data)

          if (text || images.length > 0) {
            ollamaMessages.push({
              role: "user",
              content: text || "Analyze the attached image(s).",
              images: images.length > 0 ? images : undefined,
            })
          }
        } else if (msg.role === "assistant") {
          const text = msg.parts
            .filter((p): p is TextPart => p.type === "text")
            .map((p) => p.text)
            .join("")
          if (text) {
            ollamaMessages.push({ role: "assistant", content: text })
          }
        }
      }

      // Listen for streaming events
      const unlisten = await listenChatStream(chatId, (event: ChatStreamEvent) => {
        setMessagesBySession((prev) => {
          const sessionMessages = prev[sessionKey] || []
          const updated = [...sessionMessages]
          const lastIdx = updated.length - 1
          if (lastIdx < 0) return prev

          const lastMsg = { ...updated[lastIdx] }
          const parts = [...lastMsg.parts]

          switch (event.type) {
            case "text": {
              setSessionStatus(sessionKey, "streaming")
              // Append or update text content
              const lastPart = parts[parts.length - 1]
              if (lastPart && lastPart.type === "text") {
                const textPart = lastPart as TextPart
                parts[parts.length - 1] = {
                  type: "text" as const,
                  text: textPart.text + (event.content || ""),
                  state: "streaming",
                }
              } else {
                parts.push({
                  type: "text",
                  text: event.content || "",
                  state: "streaming",
                })
              }
              break
            }

            case "tool-call": {
              setSessionStatus(sessionKey, "streaming")
              const needsApproval = event.needs_approval || false
              const toolPart: ToolCallPart = {
                type: `tool-${event.tool_name}`,
                toolCallId: event.tool_call_id || "",
                toolName: event.tool_name || "",
                state: needsApproval ? "approval-requested" : "running",
                input: event.tool_input,
                approval: needsApproval
                  ? { id: event.tool_call_id || "" }
                  : undefined,
              }
              parts.push(toolPart)
              break
            }

            case "tool-output": {
              // Find the corresponding tool part and update it
              for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]
                if (
                  p.type !== "text" &&
                  (p as ToolCallPart).toolCallId === event.tool_call_id
                ) {
                  parts[i] = {
                    ...(p as ToolCallPart),
                    state: "output-available",
                    output: event.tool_output,
                    input: event.tool_input || (p as ToolCallPart).input,
                  }
                  break
                }
              }
              break
            }

            case "tool-denied": {
              for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]
                if (
                  p.type !== "text" &&
                  (p as ToolCallPart).toolCallId === event.tool_call_id
                ) {
                  parts[i] = {
                    ...(p as ToolCallPart),
                    state: "output-denied",
                    approval: { id: event.tool_call_id || "", approved: false },
                  }
                  break
                }
              }
              break
            }

            case "error": {
              parts.push({
                type: "text",
                text: `\n\n**Error:** ${event.error || "Unknown error"}`,
                state: "complete",
              })
              break
            }

            case "done": {
              // Mark all text parts as complete
              for (let i = 0; i < parts.length; i++) {
                if (parts[i].type === "text") {
                  parts[i] = { ...(parts[i] as TextPart), state: "complete" }
                }
              }
              setSessionStatus(sessionKey, "idle")
              // Clean up the listener when stream is complete
              const runtime = runtimesRef.current[sessionKey]
              if (runtime?.unlisten) {
                runtime.unlisten()
              }
              delete runtimesRef.current[sessionKey]
              break
            }
          }

          lastMsg.parts = parts
          updated[lastIdx] = lastMsg
          return {
            ...prev,
            [sessionKey]: updated,
          }
        })
      })

      runtimesRef.current[sessionKey] = {
        chatId,
        unlisten,
      }

      // Send the message
      try {
        await sendChatMessage(ollamaMessages, workspacePath, chatId, model)
      } catch (err) {
        setSessionStatus(sessionKey, "idle")
        // Clean up listener on send failure
        const runtime = runtimesRef.current[sessionKey]
        if (runtime?.unlisten) {
          runtime.unlisten()
        }
        delete runtimesRef.current[sessionKey]
        setMessagesBySession((prev) => {
          const current = prev[sessionKey] || []
          const updated = [...current]
          const lastIdx = updated.length - 1
          if (lastIdx >= 0) {
            const lastMsg = { ...updated[lastIdx] }
            lastMsg.parts = [
              ...lastMsg.parts,
              {
                type: "text",
                text: `\n\n**Error:** ${err instanceof Error ? err.message : String(err)}`,
                state: "complete" as const,
              },
            ]
            updated[lastIdx] = lastMsg
          }
          return {
            ...prev,
            [sessionKey]: updated,
          }
        })
      }
    },
    [messages, workspacePath, model, currentSessionKey, setSessionStatus]
  )

  const addToolApprovalResponse = useCallback(
    async (response: { id: string; approved: boolean }) => {
      try {
        await approveToolCall(response.id, response.approved)

        // Update the UI to reflect the response
        setMessagesBySession((prev) => {
          const next = { ...prev }
          const sessionKeys = Object.keys(next)

          for (const key of sessionKeys) {
            const sessionMessages = next[key] || []
            const updated = [...sessionMessages]
            let changed = false

            for (let i = updated.length - 1; i >= 0; i--) {
              const msg = updated[i]
              if (msg.role === "assistant") {
                const parts = [...msg.parts]
                for (let j = 0; j < parts.length; j++) {
                  const p = parts[j]
                  if (
                    p.type !== "text" &&
                    (p as ToolCallPart).toolCallId === response.id
                  ) {
                    parts[j] = {
                      ...(p as ToolCallPart),
                      state: response.approved ? "running" : "output-denied",
                      approval: { id: response.id, approved: response.approved },
                    }
                    updated[i] = { ...msg, parts }
                    changed = true
                    break
                  }
                }
              }
              if (changed) break
            }

            if (changed) {
              next[key] = updated
              return next
            }
          }

          return prev
        })
      } catch (err) {
        console.error("Failed to send tool approval:", err)
      }
    },
    []
  )

  const stop = useCallback(async () => {
    const sessionKey = currentSessionKey
    const runtime = runtimesRef.current[sessionKey]
    if (runtime?.chatId) {
      try {
        await stopChat(runtime.chatId)
      } catch (err) {
        console.error("Failed to stop chat:", err)
      }
    }
    setSessionStatus(sessionKey, "idle")
    if (runtime?.unlisten) {
      runtime.unlisten()
    }
    delete runtimesRef.current[sessionKey]
  }, [currentSessionKey, setSessionStatus])

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
  }
}
