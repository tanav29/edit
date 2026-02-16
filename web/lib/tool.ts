import { tool } from "ai"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import { tavily } from "@tavily/core"
import z from "zod"

const execAsync = promisify(exec)
const tavilyClient = tavily({
  apiKey: process.env.TAVILY_API_KEY
})

export function createTools(cwd: string) {
  return {
    "bash": tool({
      title: "Bash",
      description: `Run safe bash commands in ${cwd} dir.`,
      inputSchema: z.object({
        command: z.string().describe("Command to run. Add multiple commands with &&."),
      }),
      execute: async ({ command }) => {
        if (cwd.trim() == "") return "ERR: no working dir"
        const { stdout, stderr } = await execAsync(command, {
          timeout: 2000,
          maxBuffer: 1024 * 1024 * 5,
          cwd,
        })
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
        if (!await file.exists()) return { msg: `File not found: ${filePath}` }
        const content = await file.text()
        const allLines = content.split('\n')
        const startLine = Math.max(1, offset ?? 1)
        const endLine = Math.min(allLines.length, startLine + limit - 1)
        const selectedLines = allLines.slice(startLine - 1, endLine)
        const numbered = selectedLines.map((line, i) => `${startLine + i}: ${line}`)
        return { data: `[${filePath}] Lines ${startLine}-${endLine} of ${allLines.length}\n${numbered.join('\n')}` }
      },
      // needsApproval: true
    }),

    "write": tool({
      title: "Edit",
      description: `
      Make minimal edits to files.
      Never rewrite full files unless necessary.
      Use precise ranges.
      `,
      inputSchema: z.object({
        edits: z.array(
          z.object({
            path: z.string(),
            start: z.number(),
            end: z.number(),
            newText: z.string(),
            description: z.string().optional(),
          })
        ),
        preview: z.boolean().default(true),
      }),

      execute: async ({ edits, preview }) => {
        // Just return edits to client
        return { edits, preview };
      },
    }),

    "web-search": tool({
      title: "Web Search",
      description: "Search the web for information. Will return the content of the page as well.",
      inputSchema: z.object({
        prompt: z.string().describe("The prompt to search the web for"),
      }),
      execute: async ({ prompt }) => {
        const { results } = await tavilyClient.search(prompt, {
          maxResults: 3
        })
        return results.map(result => ({
          title: result.title,
          url: result.url,
          content: result.content.slice(0, 200),
        }))
      }
    }),

    "test": tool({
      title: "Test",
      description: "test tool to check if the tool are working",
      inputSchema: z.object({
        arg: z.string(),
      }),
      execute: async () => {
        setTimeout(() => {
          return { ok: true }
        }, 2000)
      },
      needsApproval: true
    }),
  }
}