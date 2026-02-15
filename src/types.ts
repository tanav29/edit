export type Message = {
  id?: string
  role: "user" | "assistant"
  content: string
  toolCalls?: ToolCallInfo[]
}

export type ToolCallInfo = {
  id: string
  name: string
  args: Record<string, unknown>
  status: "executing" | "completed" | "error" | "rejected"
  result?: string
  error?: string
  duration?: number // milliseconds
  diff?: string // unified diff for file edit tools
}

export type ToolExecution = {
  id: string
  name: string
  status: "executing" | "completed" | "error"
  message?: string
}

export type ChatState = {
  messages: Message[]
  isLoading: boolean
}
