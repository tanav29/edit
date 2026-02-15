import { useState, useCallback } from 'react'
import { useInput } from 'ink'
import type { Message, ToolCallInfo } from '../types.js'
import {
  sendMessage,
  continueAfterApproval,
  resetConversation,
  clearPendingToolCall,
  onToolCallUpdate,
} from '../ai.js'

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [pendingApproval, setPendingApproval] = useState<boolean>(false)
  const [approvalSelection, setApprovalSelection] = useState<number>(0)
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallInfo[]>([])

  // Listen for real-time tool call updates from ai.ts
  onToolCallUpdate((toolCalls) => {
    setActiveToolCalls([...toolCalls])
  })

  const handleApprovalCb = useCallback(async (approved: boolean) => {
    setIsLoading(true)
    setPendingApproval(false)
    clearPendingToolCall()

    try {
      const result = await continueAfterApproval(approved)

      setMessages(prev => {
        const newMessages = [...prev]
        const last = newMessages[newMessages.length - 1]
        if (last && last.role === "assistant") {
          last.content = result.response
          last.toolCalls = result.toolCalls
        }
        return newMessages
      })

      if (result.needsApproval) {
        setPendingApproval(true)
        setApprovalSelection(0)
      }
    } catch (error) {
      setMessages(prev => {
        const newMessages = [...prev]
        const last = newMessages[newMessages.length - 1]
        if (last && last.role === "assistant") {
          last.content = `Error: ${error}`
        }
        return newMessages
      })
    } finally {
      setIsLoading(false)
      setActiveToolCalls([])
    }
  }, [])

  useInput((input, key) => {
    if (pendingApproval) {
      if (key.upArrow || input === 'k') {
        setApprovalSelection(prev => Math.max(0, prev - 1))
      } else if (key.downArrow || input === 'j') {
        setApprovalSelection(prev => Math.min(1, prev + 1))
      } else if (key.return) {
        handleApprovalCb(approvalSelection === 0)
      }
    }
  }, { isActive: pendingApproval })

  const sendMessageCb = useCallback(async (message: string) => {
    setIsLoading(true)
    setActiveToolCalls([])
    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: message }])
    setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "" }])

    try {
      const result = await sendMessage(message)

      setMessages(prev => {
        const newMessages = [...prev]
        const last = newMessages[newMessages.length - 1]
        if (last && last.role === "assistant") {
          last.content = result.response
          last.toolCalls = result.toolCalls
        }
        return newMessages
      })

      if (result.needsApproval) {
        setPendingApproval(true)
        setApprovalSelection(0)
      }
    } catch (error) {
      setMessages(prev => {
        const newMessages = [...prev]
        const last = newMessages[newMessages.length - 1]
        if (last && last.role === "assistant") {
          last.content = `Error: ${error}`
        }
        return newMessages
      })
    } finally {
      setIsLoading(false)
      setActiveToolCalls([])
    }
  }, [handleApprovalCb])

  const clearChat = useCallback(() => {
    setMessages([])
    setActiveToolCalls([])
    resetConversation()
  }, [])

  return {
    messages,
    isLoading,
    sendMessage: sendMessageCb,
    pendingApproval,
    approvalSelection,
    clearChat,
    handleApproval: handleApprovalCb,
    activeToolCalls,
  }
}
