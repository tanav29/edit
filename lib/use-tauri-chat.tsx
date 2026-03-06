"use client"

import { useCallback, useRef, useState } from "react"
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
  model?: string
}

export function useTauriChat({ workspacePath, model }: UseTauriChatOptions) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>("idle")
  const chatIdRef = useRef<string>("")
  const unlistenRef = useRef<(() => void) | null>(null)

  const setMessagesExternal = useCallback((msgs: UIMessage[]) => {
    setMessages(msgs)
  }, [])

  const sendMessage = useCallback(
    async (input: { parts: Array<{ type: "text"; text: string } | ImagePart> }) => {
      const userText = input.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("")

      const userImages = input.parts.filter((p): p is ImagePart => p.type === "image")

      if (!userText.trim() && userImages.length === 0) return

      // Clean up previous listener if still active
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }

      const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      chatIdRef.current = chatId

      // Add user message
      const userMessage: UIMessage = {
        id: `msg-user-${Date.now()}`,
        role: "user",
        parts: input.parts,
        createdAt: new Date(),
      }

      // Add assistant placeholder
      const assistantMsgId = `msg-assistant-${Date.now()}`

      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          id: assistantMsgId,
          role: "assistant",
          parts: [],
          createdAt: new Date(),
        },
      ])

      setStatus("submitted")

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
        setMessages((prev) => {
          const updated = [...prev]
          const lastIdx = updated.length - 1
          if (lastIdx < 0) return prev

          const lastMsg = { ...updated[lastIdx] }
          const parts = [...lastMsg.parts]

          switch (event.type) {
            case "text": {
              setStatus("streaming")
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
              setStatus("streaming")
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
              setStatus("idle")
              // Clean up the listener when stream is complete
              if (unlistenRef.current) {
                unlistenRef.current()
                unlistenRef.current = null
              }
              break
            }
          }

          lastMsg.parts = parts
          updated[lastIdx] = lastMsg
          return updated
        })
      })

      unlistenRef.current = unlisten

      // Send the message
      try {
        await sendChatMessage(ollamaMessages, workspacePath, chatId, model)
      } catch (err) {
        setStatus("idle")
        // Clean up listener on send failure
        if (unlistenRef.current) {
          unlistenRef.current()
          unlistenRef.current = null
        }
        setMessages((prev) => {
          const updated = [...prev]
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
          return updated
        })
      }
    },
    [messages, workspacePath, model]
  )

  const addToolApprovalResponse = useCallback(
    async (response: { id: string; approved: boolean }) => {
      try {
        await approveToolCall(response.id, response.approved)

        // Update the UI to reflect the response
        setMessages((prev) => {
          const updated = [...prev]
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
                  return updated
                }
              }
            }
          }
          return updated
        })
      } catch (err) {
        console.error("Failed to send tool approval:", err)
      }
    },
    []
  )

  const stop = useCallback(async () => {
    if (chatIdRef.current) {
      try {
        await stopChat(chatIdRef.current)
      } catch (err) {
        console.error("Failed to stop chat:", err)
      }
    }
    setStatus("idle")
    if (unlistenRef.current) {
      unlistenRef.current()
      unlistenRef.current = null
    }
  }, [])

  return {
    messages,
    setMessages: setMessagesExternal,
    sendMessage,
    status,
    addToolApprovalResponse,
    stop,
  }
}
