import { tool } from "ai"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import z from "zod"

const execAsync = promisify(exec)

export const tools = {
  "bash": tool({
    title: "Bash",
    description: "Run safe shell commands in specific dir.",
    inputSchema: z.object({
      command: z.string().describe("Command to run."),
      path: z.string().describe("The cwd where command will run.")
    }),
    execute: async ({ command, path }) => {
      console.log(command, path)
      const { stdout, stderr } = await execAsync(command, {
        timeout: 2000,
        maxBuffer: 1024 * 1024 * 5,
        cwd: path,
      })
      console.log(stdout, stderr)
      const out = stdout.trim()
      const err = stderr.trim()
      let result = out || '(no output)'
      if (err) result += `\nstderr: ${err}`
      return result
    },
    needsApproval: true
  }),

  "read": tool({
    title: "Read",
    description: "Read any text file with file-path.",
    inputSchema: z.object({
      filePath: z.string().describe("The path to the file to read."),
      offset: z.number().default(1).describe("Starting line number to read (default 1)."),
      limit: z.number().default(20).describe("How much lines to read (default 50)."),
    }),
    execute: async ({ filePath, offset, limit }) => {
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
    },
    needsApproval: true
  }),

  "write": tool({
    title: "Write",
    description: "Write to a new file or overwrite it.",
    inputSchema: z.object({
      filePath: z.string().describe("The path to the file to write."),
      content: z.string().describe("Content to write in the file.")
    }),
    execute: async ({ filePath, content }) => {
      let diff = ''
      const file = Bun.file(filePath)
      const existed = await file.exists()
      await Bun.write(filePath, content)
      const lines = content.split('\n').length
      if (existed) return `Wrote ${lines} lines to ${filePath}\n\n${diff}`
      return `Created ${filePath} (${lines} lines)`
    },
    needsApproval: true
  }),

  "test": tool({
    title: "Test",
    description: "test tool to check if the tool are working",
    inputSchema: z.object({
      arg: z.string(),
    }),
    execute: async () => {
      console.log("in test")
      setTimeout(() => {
        return { ok: true }
      }, 2000)
      console.log("out test")
    },
    needsApproval: true
  })
}