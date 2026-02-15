import { generateText } from 'ai'
import { ollama } from 'ollama-ai-provider-v2'
import { tools, session } from './tools.js'
import type { Message, ToolCallInfo } from './types.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'
import { generateDiff } from './tools.js'

const execAsync = promisify(exec)

export const model = ollama("qwen3:8b")

const SYSTEM_PROMPT = `You are an expert AI coding assistant running inside a CLI terminal.

You have access to these tools:

FILE TOOLS:
- read: Read files with line numbers. Supports offset/limit for large files.
- write: Create or overwrite files. Shows a diff when overwriting existing files. REQUIRES APPROVAL.
- sed: Edit files by exact string replacement. Shows a unified diff of changes. Use this for surgical edits instead of rewriting entire files. REQUIRES APPROVAL.
- ls: List directory contents with sizes and type indicators.

SEARCH TOOLS:
- grep: Search file contents with regex. Returns file:line matches.
- glob: Find files by glob pattern (e.g. "**/*.ts").

SHELL TOOLS:
- bash: Run any shell command. REQUIRES APPROVAL.

RULES:
- Be concise. Prefer short answers.
- Use \`sed\` for small edits. Use \`write\` only for new files or full rewrites.
- Use \`read\` to check file contents before editing.
- Use \`ls\` and \`glob\` to explore the project structure.
- When running bash commands, prefer non-interactive commands.
- Current working directory: ${session.cwd}`

type ToolCallRequest = {
  toolName: string
  args: Record<string, unknown>
}

type ConversationState = {
  messages: Message[]
  pendingToolCall: ToolCallRequest | null
  currentToolCalls: ToolCallInfo[]
}

// Callback to notify UI of tool call state changes
type ToolCallListener = (toolCalls: ToolCallInfo[]) => void
let toolCallListener: ToolCallListener | null = null

export function onToolCallUpdate(listener: ToolCallListener) {
  toolCallListener = listener
}

let state: ConversationState = {
  messages: [],
  pendingToolCall: null,
  currentToolCalls: [],
}

export function getPendingToolCall() {
  return state.pendingToolCall
}

export function clearPendingToolCall() {
  state.pendingToolCall = null
}

export function resetConversation() {
  state = { messages: [], pendingToolCall: null, currentToolCalls: [] }
}

export function getCurrentToolCalls(): ToolCallInfo[] {
  return [...state.currentToolCalls]
}

function addToolCall(tc: ToolCallInfo) {
  state.currentToolCalls.push(tc)
  toolCallListener?.(getCurrentToolCalls())
}

function updateToolCall(id: string, updates: Partial<ToolCallInfo>) {
  const tc = state.currentToolCalls.find(t => t.id === id)
  if (tc) {
    Object.assign(tc, updates)
    toolCallListener?.(getCurrentToolCalls())
  }
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'bash': {
      const { command, timeout } = args as { command: string; timeout?: number }
      if (command.startsWith('cd ')) {
        const target = command.replace('cd ', '').trim()
        const next = target.startsWith('/') ? target : resolve(session.cwd, target)
        session.cwd = next
        return `Changed directory to ${session.cwd}`
      }
      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: timeout ?? 10000,
          maxBuffer: 1024 * 1024 * 5,
          cwd: session.cwd,
        })
        const out = stdout.trim()
        const err = stderr.trim()
        let result = out || '(no output)'
        if (err) result += `\nstderr: ${err}`
        return result
      } catch (err: any) {
        return `Exit code ${err.code ?? 1}\n${err.stderr?.trim() ?? err.message}${err.stdout ? '\n' + err.stdout.trim() : ''}`
      }
    }
    case 'read': {
      const { filePath, offset, limit } = args as { filePath: string; offset?: number; limit?: number }
      const file = Bun.file(filePath)
      if (!await file.exists()) return `File not found: ${filePath}`
      const content = await file.text()
      const allLines = content.split('\n')
      const startLine = Math.max(1, offset ?? 1)
      const maxLines = limit ?? 200
      const endLine = Math.min(allLines.length, startLine + maxLines - 1)
      const selectedLines = allLines.slice(startLine - 1, endLine)
      const numbered = selectedLines.map((line, i) => `${startLine + i}: ${line}`)
      return `[${filePath}] Lines ${startLine}-${endLine} of ${allLines.length}\n${numbered.join('\n')}`
    }
    case 'write': {
      const { filePath, content } = args as { filePath: string; content: string }
      let diff = ''
      const file = Bun.file(filePath)
      const existed = await file.exists()
      if (existed) {
        const oldContent = await file.text()
        diff = generateDiff(oldContent, content, filePath)
      }
      await Bun.write(filePath, content)
      const lines = content.split('\n').length
      if (existed) return `Wrote ${lines} lines to ${filePath}\n\n${diff}`
      return `Created ${filePath} (${lines} lines)`
    }
    case 'sed': {
      const { filePath, oldString, newString, replaceAll } = args as {
        filePath: string; oldString: string; newString: string; replaceAll?: boolean
      }
      const file = Bun.file(filePath)
      if (!await file.exists()) return `File not found: ${filePath}`
      const oldContent = await file.text()
      if (!oldContent.includes(oldString)) return `Error: oldString not found in ${filePath}`

      if (!replaceAll) {
        const firstIdx = oldContent.indexOf(oldString)
        const secondIdx = oldContent.indexOf(oldString, firstIdx + 1)
        if (secondIdx !== -1) {
          const occurrences = oldContent.split(oldString).length - 1
          return `Error: Found ${occurrences} matches. Set replaceAll: true or provide more context.`
        }
      }

      let newContent: string
      if (replaceAll) {
        newContent = oldContent.split(oldString).join(newString)
      } else {
        const idx = oldContent.indexOf(oldString)
        newContent = oldContent.substring(0, idx) + newString + oldContent.substring(idx + oldString.length)
      }

      const diff = generateDiff(oldContent, newContent, filePath)
      await Bun.write(filePath, newContent)
      return `Edited ${filePath}\n\n${diff}`
    }
    case 'grep': {
      const { pattern, path, include } = args as { pattern: string; path?: string; include?: string }
      const searchDir = path || session.cwd
      const { Glob } = await import("bun")
      const glob = new Glob(include || "**/*")
      const files = Array.from(glob.scanSync({ cwd: searchDir }))
      const results: string[] = []
      const regex = new RegExp(pattern, 'g')
      for (const file of files) {
        try {
          const content = await Bun.file(join(searchDir, file)).text()
          const lines = content.split('\n')
          let match
          regex.lastIndex = 0
          while ((match = regex.exec(content)) !== null) {
            const beforeMatch = content.substring(0, match.index)
            const lineNumber = beforeMatch.split('\n').length
            results.push(`${file}:${lineNumber}: ${lines[lineNumber - 1]?.trim() || ''}`)
          }
        } catch { }
      }
      if (results.length === 0) return 'No matches found'
      return `${results.length} match(es):\n${results.slice(0, 50).join('\n')}${results.length > 50 ? `\n... and ${results.length - 50} more` : ''}`
    }
    case 'glob': {
      const { pattern, path } = args as { pattern: string; path?: string }
      const searchDir = path || session.cwd
      const { Glob } = await import("bun")
      const glob = new Glob(pattern)
      const files = Array.from(glob.scanSync({ cwd: searchDir }))
      if (files.length === 0) return 'No files found'
      return `${files.length} file(s):\n${files.join('\n')}`
    }
    case 'ls': {
      const { path, all } = args as { path?: string; all?: boolean }
      const { readdir, stat } = await import('node:fs/promises')
      const dir = path || session.cwd
      const entries = await readdir(dir, { withFileTypes: true })
      const results: string[] = []
      for (const entry of entries) {
        if (!all && entry.name.startsWith('.')) continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          results.push(`${entry.name}/`)
        } else {
          try {
            const st = await stat(fullPath)
            const size = st.size
            const sizeStr = size < 1024 ? `${size}B`
              : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)}K`
              : `${(size / (1024 * 1024)).toFixed(1)}M`
            results.push(`${entry.name}  (${sizeStr})`)
          } catch {
            results.push(entry.name)
          }
        }
      }
      results.sort((a, b) => {
        const aIsDir = a.endsWith('/')
        const bIsDir = b.endsWith('/')
        if (aIsDir && !bIsDir) return -1
        if (!aIsDir && bIsDir) return 1
        return a.localeCompare(b)
      })
      return `${dir}/\n${results.join('\n')}`
    }
    default:
      return `Unknown tool: ${name}`
  }
}

function createToolDefs() {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      { ...tool, execute: async () => ({}) }
    ])
  )
}

export type SendMessageResult = {
  response: string
  needsApproval: boolean
  toolCalls: ToolCallInfo[]
}

export async function sendMessage(message: string): Promise<SendMessageResult> {
  if (message) {
    state.messages.push({ role: "user", content: message })
  }
  state.currentToolCalls = []

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: state.messages.map(m => ({ role: m.role, content: m.content })),
    tools: createToolDefs(),
  })

  if (result.text) {
    state.messages.push({ role: "assistant", content: result.text, toolCalls: [...state.currentToolCalls] })
    return { response: result.text, needsApproval: false, toolCalls: getCurrentToolCalls() }
  }

  if (result.toolCalls && result.toolCalls.length > 0) {
    const toolCall = result.toolCalls[0] as any
    const toolName = toolCall.toolName || toolCall.function?.name
    const args = toolCall.args || toolCall.function?.arguments || {}
    const needsApproval = (tools as any)[toolName]?.needsApproval ?? false

    const tcId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const tcInfo: ToolCallInfo = {
      id: tcId,
      name: toolName,
      args,
      status: needsApproval ? 'executing' : 'executing',
    }
    addToolCall(tcInfo)

    state.pendingToolCall = { toolName, args }

    if (needsApproval) {
      return {
        response: `Tool request: ${toolName}`,
        needsApproval: true,
        toolCalls: getCurrentToolCalls(),
      }
    } else {
      // Auto-execute
      const startTime = Date.now()
      try {
        const toolResult = await executeTool(toolName, args)
        const duration = Date.now() - startTime
        updateToolCall(tcId, {
          status: 'completed',
          result: toolResult,
          duration,
          diff: (toolName === 'sed' || toolName === 'write') ? toolResult : undefined,
        })
        state.messages.push({ role: "user", content: `[TOOL_RESULT]${toolName}: ${toolResult}` })
        // Continue the conversation
        const followUp = await sendMessage('')
        return {
          response: followUp.response,
          needsApproval: followUp.needsApproval,
          toolCalls: getCurrentToolCalls(),
        }
      } catch (err: any) {
        const duration = Date.now() - startTime
        updateToolCall(tcId, {
          status: 'error',
          error: err.message,
          duration,
        })
        state.messages.push({ role: "user", content: `[TOOL_ERROR]${toolName}: ${err.message}` })
        const followUp = await sendMessage('')
        return {
          response: followUp.response,
          needsApproval: followUp.needsApproval,
          toolCalls: getCurrentToolCalls(),
        }
      }
    }
  }

  return { response: result.text || '', needsApproval: false, toolCalls: getCurrentToolCalls() }
}

export type ContinueResult = {
  response: string
  needsApproval: boolean
  toolCalls: ToolCallInfo[]
}

export async function continueAfterApproval(approved: boolean): Promise<ContinueResult> {
  const toolCall = state.pendingToolCall
  if (!toolCall) return { response: 'No pending tool call', needsApproval: false, toolCalls: [] }

  state.pendingToolCall = null

  // Find the pending tool call info
  const tcInfo = state.currentToolCalls.find(
    tc => tc.name === toolCall.toolName && tc.status === 'executing'
  )

  if (!approved) {
    if (tcInfo) {
      updateToolCall(tcInfo.id, { status: 'rejected' })
    }
    state.messages.push({ role: "assistant", content: `User rejected the ${toolCall.toolName} tool call.` })
    return {
      response: `[REJECTED:${toolCall.toolName}]`,
      needsApproval: false,
      toolCalls: getCurrentToolCalls(),
    }
  }

  const startTime = Date.now()
  try {
    const toolResult = await executeTool(toolCall.toolName, toolCall.args)
    const duration = Date.now() - startTime
    if (tcInfo) {
      updateToolCall(tcInfo.id, {
        status: 'completed',
        result: toolResult,
        duration,
        diff: (toolCall.toolName === 'sed' || toolCall.toolName === 'write') ? toolResult : undefined,
      })
    }
    state.messages.push({ role: "user", content: `[TOOL_RESULT]${toolCall.toolName}: ${toolResult}` })
  } catch (err: any) {
    const duration = Date.now() - startTime
    if (tcInfo) {
      updateToolCall(tcInfo.id, { status: 'error', error: err.message, duration })
    }
    state.messages.push({ role: "user", content: `[TOOL_ERROR]${toolCall.toolName}: ${err.message}` })
  }

  // Get follow-up from the AI
  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: state.messages.map(m => ({ role: m.role, content: m.content })),
    tools: createToolDefs(),
  })

  if (result.text) {
    state.messages.push({ role: "assistant", content: result.text, toolCalls: [...state.currentToolCalls] })
    return { response: result.text, needsApproval: false, toolCalls: getCurrentToolCalls() }
  }

  if (result.toolCalls && result.toolCalls.length > 0) {
    const nextTool = result.toolCalls[0] as any
    const toolName = nextTool.toolName || nextTool.function?.name
    const args = nextTool.args || nextTool.function?.arguments || {}
    const needsApproval = (tools as any)[toolName]?.needsApproval ?? false

    const tcId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const newTcInfo: ToolCallInfo = {
      id: tcId,
      name: toolName,
      args,
      status: 'executing',
    }
    addToolCall(newTcInfo)

    state.pendingToolCall = { toolName, args }

    if (needsApproval) {
      return {
        response: `Tool request: ${toolName}`,
        needsApproval: true,
        toolCalls: getCurrentToolCalls(),
      }
    } else {
      // Auto-execute and continue
      const startTime2 = Date.now()
      try {
        const nextResult = await executeTool(toolName, args)
        const duration = Date.now() - startTime2
        updateToolCall(tcId, {
          status: 'completed',
          result: nextResult,
          duration,
          diff: (toolName === 'sed' || toolName === 'write') ? nextResult : undefined,
        })
        state.messages.push({ role: "user", content: `[TOOL_RESULT]${toolName}: ${nextResult}` })
        return continueAfterApproval(true)
      } catch (err: any) {
        const duration = Date.now() - startTime2
        updateToolCall(tcId, { status: 'error', error: err.message, duration })
        state.messages.push({ role: "user", content: `[TOOL_ERROR]${toolName}: ${err.message}` })
        return continueAfterApproval(true)
      }
    }
  }

  return { response: result.text || '', needsApproval: false, toolCalls: getCurrentToolCalls() }
}
