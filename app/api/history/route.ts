import { NextRequest, NextResponse } from "next/server"
import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"

const HISTORY_DIR = path.join(process.env.HOME || "/home/thetanav", ".edit", "history")

interface ChatSession {
  id: string
  name: string
  path: string
  messages: Array<{
    id: string
    role: "user" | "assistant"
    content: string
    timestamp: number
  }>
  createdAt: number
  updatedAt: number
  sessionKey?: string
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function hashString(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 10)
}

function toSafeDirName(sessionPath: string): string {
  const sanitized = sessionPath.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60)
  return `${sanitized}_${hashString(sessionPath)}`
}

function getHistoryDirPath(sessionPath: string): string {
  return path.join(HISTORY_DIR, toSafeDirName(sessionPath))
}

function getSessionFilePath(sessionPath: string, sessionId: string): string {
  return path.join(getHistoryDirPath(sessionPath), `${sessionId}.json`)
}

function readJsonFile(filePath: string): unknown | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

function listAllSessionFiles(): string[] {
  ensureDir(HISTORY_DIR)
  const entries = fs.readdirSync(HISTORY_DIR, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(HISTORY_DIR, entry.name)

    if (entry.isFile() && entry.name.endsWith(".json")) {
      // Legacy flat layout
      files.push(fullPath)
      continue
    }

    if (entry.isDirectory()) {
      try {
        const dirEntries = fs.readdirSync(fullPath, { withFileTypes: true })
        for (const de of dirEntries) {
          if (de.isFile() && de.name.endsWith(".json")) {
            files.push(path.join(fullPath, de.name))
          }
        }
      } catch {
        // Skip unreadable dirs
      }
    }
  }

  return files
}

function isChatSession(value: unknown): value is ChatSession {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>

  if (typeof v.id !== "string") return false
  if (typeof v.name !== "string") return false
  if (typeof v.path !== "string") return false
  if (!Array.isArray(v.messages)) return false
  if (typeof v.createdAt !== "number") return false
  if (typeof v.updatedAt !== "number") return false

  if ("sessionKey" in v && v.sessionKey !== undefined && typeof v.sessionKey !== "string") {
    return false
  }

  return true
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionKey = searchParams.get("key")

    const sessionFiles = listAllSessionFiles()
    const sessions: ChatSession[] = []

    for (const filePath of sessionFiles) {
      const session = readJsonFile(filePath)
      if (!isChatSession(session)) continue
      sessions.push(session)
    }

    if (sessionKey) {
      const matching = sessions
        .filter((s) => s.sessionKey === sessionKey)
        .sort((a, b) => b.updatedAt - a.updatedAt)
      if (matching.length === 0) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 })
      }
      return NextResponse.json(matching[0])
    }

    return NextResponse.json(sessions.sort((a, b) => b.updatedAt - a.updatedAt))
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session: ChatSession = await req.json()

    ensureDir(HISTORY_DIR)
    const dirPath = getHistoryDirPath(session.path)
    ensureDir(dirPath)
    const filePath = getSessionFilePath(session.path, session.id)

    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8")
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { sessionPath, sessionId } = await req.json()

    // Preferred: delete a specific session under a directory
    if (sessionPath && sessionId) {
      const filePath = getSessionFilePath(sessionPath, sessionId)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      return NextResponse.json({ success: true })
    }

    // Legacy: delete everything we have for a directory path
    if (sessionPath) {
      const legacyFlat = path.join(HISTORY_DIR, `${sessionPath.replace(/[^a-zA-Z0-9]/g, "_")}.json`)
      if (fs.existsSync(legacyFlat)) {
        fs.unlinkSync(legacyFlat)
      }

      const dirPath = getHistoryDirPath(sessionPath)
      if (fs.existsSync(dirPath)) {
        const entries = fs.readdirSync(dirPath)
        for (const entry of entries) {
          const p = path.join(dirPath, entry)
          if (p.endsWith(".json") && fs.existsSync(p)) {
            fs.unlinkSync(p)
          }
        }
        try {
          fs.rmdirSync(dirPath)
        } catch {
          // ok
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
