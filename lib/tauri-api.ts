import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

// ── File Operations ──────────────────────────────────────────

export interface FileNode {
  name: string
  path: string
  type: string
  children?: FileNode[]
}

export async function listFiles(path: string): Promise<FileNode> {
  return invoke<FileNode>("list_files", { path })
}

export async function readFileContent(path: string): Promise<{ content: string; filePath: string }> {
  return invoke("read_file_content", { path })
}

// ── Session/History Management ───────────────────────────────

export interface ChatSession {
  id: string
  name: string
  path: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export async function getSessions(key?: string): Promise<ChatSession[] | ChatSession> {
  return invoke("get_sessions", { key: key || null })
}

export async function getAllSessions(): Promise<ChatSession[]> {
  return invoke("get_sessions", { key: null })
}

export async function saveSession(session: ChatSession): Promise<{ success: boolean }> {
  return invoke("save_session", { session })
}

export async function deleteSession(sessionPath: string, sessionId?: string): Promise<{ success: boolean }> {
  return invoke("delete_session", { sessionPath, sessionId: sessionId || null })
}

export interface RestoreFileEdit {
  filePath: string
  action: "created" | "edited"
  previousContent?: string
  existedBefore?: boolean
}

export interface RestoreEditsResult {
  success: boolean
  restored: string[]
  skipped: string[]
  errors: string[]
}

export async function restoreFileEdits(
  workspacePath: string,
  edits: RestoreFileEdit[]
): Promise<RestoreEditsResult> {
  return invoke("restore_file_edits", { workspacePath, edits })
}

// ── Tool Operations ──────────────────────────────────────────

export async function globSearch(workspacePath: string, pattern: string) {
  return invoke("glob_search", { workspacePath, pattern })
}

export async function toolRead(workspacePath: string, filePath: string, offset?: number, limit?: number) {
  return invoke("tool_read", { workspacePath, filePath, offset: offset || null, limit: limit || null })
}

export async function toolWrite(workspacePath: string, filePath: string, content: string) {
  return invoke("tool_write", { workspacePath, filePath, content })
}

export async function toolBash(workspacePath: string, command: string, timeoutMs?: number) {
  return invoke("tool_bash", { workspacePath, command, timeoutMs: timeoutMs || null })
}

// ── AI Chat ──────────────────────────────────────────────────

export interface ChatStreamEvent {
  type: string
  content?: string
  tool_name?: string
  tool_call_id?: string
  tool_input?: unknown
  tool_output?: unknown
  error?: string
  needs_approval?: boolean
}

export interface OllamaMessage {
  role: string
  content: string
  images?: string[]
}

export async function sendChatMessage(
  messages: OllamaMessage[],
  workspacePath: string,
  chatId: string,
  model?: string
): Promise<void> {
  return invoke("send_chat_message", {
    request: {
      messages,
      workspace_path: workspacePath,
      chat_id: chatId,
      model: model || null,
    },
  })
}

export async function approveToolCall(toolCallId: string, approved: boolean): Promise<void> {
  return invoke("approve_tool_call", { toolCallId, approved })
}

export async function stopChat(chatId: string): Promise<void> {
  return invoke("stop_chat", { chatId })
}

export function listenChatStream(
  chatId: string,
  callback: (event: ChatStreamEvent) => void
): Promise<UnlistenFn> {
  return listen<ChatStreamEvent>(`chat-stream-${chatId}`, (event) => {
    callback(event.payload)
  })
}
