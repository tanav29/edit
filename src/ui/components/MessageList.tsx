import React from "react"
import { Box, Text } from "ink"
import type { Message, ToolCallInfo } from '../../types.js'
import { MessageContent } from './MessageContent.js'
import { ToolCallDisplay } from './ToolExecutionDisplay.js'

type MessageListProps = {
  messages: Message[]
  isLoading: boolean
  activeToolCalls?: ToolCallInfo[]
}

export function MessageList({ messages, isLoading, activeToolCalls }: MessageListProps) {
  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => (
        <Box key={msg.id || i} flexDirection="column">
          <MessageContent content={msg.content} role={msg.role} />

          {/* Show completed tool calls attached to this message */}
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <Box flexDirection="column" marginLeft={1} marginBottom={1}>
              {msg.toolCalls.map((tc) => (
                <ToolCallDisplay key={tc.id} toolCall={tc} />
              ))}
            </Box>
          )}
        </Box>
      ))}

      {/* Show actively executing tool calls at the bottom */}
      {activeToolCalls && activeToolCalls.length > 0 && (
        <Box flexDirection="column" marginLeft={1} marginBottom={1}>
          <Box marginBottom={0}>
            <Text color="cyan" bold dimColor>Tool Calls:</Text>
          </Box>
          {activeToolCalls.map((tc) => (
            <ToolCallDisplay key={tc.id} toolCall={tc} />
          ))}
        </Box>
      )}
    </Box>
  )
}
