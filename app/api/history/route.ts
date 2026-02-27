import { NextRequest, NextResponse } from "next/server"
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
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function getHistoryFilePath(sessionPath: string): string {
  const sanitized = sessionPath.replace(/[^a-zA-Z0-9]/g, "_")
  return path.join(HISTORY_DIR, `${sanitized}.json`)
}

export async function GET(req: NextRequest) {
  try {
    ensureDir(HISTORY_DIR)
    const { searchParams } = new URL(req.url)
    const sessionKey = searchParams.get("key")

    const files = fs.readdirSync(HISTORY_DIR)
    const sessions: any[] = []

    for (const file of files) {
      if (!file.endsWith(".json")) continue
      const filePath = path.join(HISTORY_DIR, file)
      try {
        const content = fs.readFileSync(filePath, "utf-8")
        const session = JSON.parse(content)
        
        if (sessionKey && session.sessionKey === sessionKey) {
           return NextResponse.json(session)
        }
        
        sessions.push(session)
      } catch {
        // Skip invalid files
      }
    }

    if (sessionKey) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
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
    const filePath = getHistoryFilePath(session.path)
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8")
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { sessionPath } = await req.json()
    const filePath = getHistoryFilePath(sessionPath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
