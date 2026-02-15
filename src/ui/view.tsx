import React, { useState } from "react"
import { Box, render, Text } from "ink"
import { MessageList } from './components/MessageList.js'
import { MessageInput } from './components/MessageInput.js'
import { useChat } from '../hooks/useChat.js'
import { getPendingToolCall } from '../ai.js'

export default function App() {
  const [input, setInput] = useState("")
  const {
    messages,
    isLoading,
    sendMessage,
    pendingApproval,
    approvalSelection,
    handleApproval,
    activeToolCalls,
  } = useChat()

  const pendingTool = pendingApproval ? getPendingToolCall() : null

  const handleSubmit = (value: string) => {
    if (value.trim() && !isLoading) {
      if (pendingApproval) {
        handleApproval(value.toLowerCase() === 'y' || value.toLowerCase() === 'yes')
      } else {
        sendMessage(value.trim())
      }
      setInput("")
    }
  }

  return (
    <Box flexDirection="column" height="100%">
      <Box marginBottom={1}>
        <Text color="cyan" bold>edit</Text>
        <Text color="gray"> - ai coding assistant</Text>
      </Box>

      <MessageList
        messages={messages}
        isLoading={isLoading}
        activeToolCalls={isLoading ? activeToolCalls : undefined}
      />

      {pendingApproval && pendingTool && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={1}>
          <Text color="yellow" bold>Tool Approval Required</Text>
          <Box marginTop={0}>
            <Text color="white" bold>  {pendingTool.toolName}</Text>
          </Box>
          <Box marginTop={0}>
            <Text color="gray">  {formatToolArgs(pendingTool.toolName, pendingTool.args)}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={approvalSelection === 0 ? "green" : "gray"}>
              {approvalSelection === 0 ? '> ' : '  '}Yes, execute
            </Text>
          </Box>
          <Box>
            <Text color={approvalSelection === 1 ? "red" : "gray"}>
              {approvalSelection === 1 ? '> ' : '  '}No, reject
            </Text>
          </Box>
          <Text color="gray" dimColor>  (j/k or arrows to select, Enter to confirm)</Text>
        </Box>
      )}

      <MessageInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        placeholder={pendingApproval ? "Press Enter to confirm..." : "Type a message..."}
      />
    </Box>
  )
}

function formatToolArgs(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'bash':
      return `$ ${args.command}`
    case 'read':
      return `${args.filePath}`
    case 'write':
      return `${args.filePath} (${String(args.content || '').split('\n').length} lines)`
    case 'sed': {
      const old = String(args.oldString || '').split('\n')
      const newStr = String(args.newString || '').split('\n')
      return `${args.filePath} (replace ${old.length} line${old.length > 1 ? 's' : ''} with ${newStr.length} line${newStr.length > 1 ? 's' : ''})`
    }
    case 'grep':
      return `/${args.pattern}/${args.include ? ` in ${args.include}` : ''}`
    case 'glob':
      return `${args.pattern}`
    case 'ls':
      return `${args.path || '.'}`
    default:
      return JSON.stringify(args)
  }
}

render(<App />)
