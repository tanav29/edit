import { tool } from "ai"
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { Glob } from "bun"
import z from "zod"
import { stat, readdir } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

const execAsync = promisify(exec)

export const session = {
  cwd: process.cwd(),
}

// Generate a simple unified diff between two strings
export function generateDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const lines: string[] = []

  lines.push(`--- a/${filePath}`)
  lines.push(`+++ b/${filePath}`)

  // Simple line-by-line diff with context
  const maxLen = Math.max(oldLines.length, newLines.length)
  let inHunk = false
  let hunkStart = -1
  let hunkLines: string[] = []
  const contextSize = 3

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined
    const newLine = i < newLines.length ? newLines[i] : undefined

    if (oldLine !== newLine) {
      if (!inHunk) {
        inHunk = true
        hunkStart = Math.max(0, i - contextSize)
        // Add leading context
        for (let c = hunkStart; c < i; c++) {
          if (c < oldLines.length) hunkLines.push(` ${oldLines[c]}`)
        }
      }
      if (oldLine !== undefined) hunkLines.push(`-${oldLine}`)
      if (newLine !== undefined) hunkLines.push(`+${newLine}`)
    } else if (inHunk) {
      hunkLines.push(` ${oldLine}`)
      // Check if we're past the context window
      const lastChangeIdx = hunkLines.length - 1
      let trailingContext = 0
      for (let j = hunkLines.length - 1; j >= 0; j--) {
        if (hunkLines[j]!.startsWith(' ')) trailingContext++
        else break
      }
      if (trailingContext >= contextSize) {
        // Flush this hunk
        const oldCount = hunkLines.filter(l => l.startsWith('-') || l.startsWith(' ')).length
        const newCount = hunkLines.filter(l => l.startsWith('+') || l.startsWith(' ')).length
        lines.push(`@@ -${hunkStart + 1},${oldCount} +${hunkStart + 1},${newCount} @@`)
        lines.push(...hunkLines)
        hunkLines = []
        inHunk = false
      }
    }
  }

  // Flush remaining hunk
  if (inHunk && hunkLines.length > 0) {
    const oldCount = hunkLines.filter(l => l.startsWith('-') || l.startsWith(' ')).length
    const newCount = hunkLines.filter(l => l.startsWith('+') || l.startsWith(' ')).length
    lines.push(`@@ -${hunkStart + 1},${oldCount} +${hunkStart + 1},${newCount} @@`)
    lines.push(...hunkLines)
  }

  if (lines.length === 2) {
    return '(no changes)'
  }

  return lines.join('\n')
}

export const tools = {
  bash: tool({
    description: 'Run a shell command in the terminal. Handles cd by updating the session working directory. Returns stdout, stderr, and exit code.',
    inputSchema: z.object({
      command: z.string().describe('The bash command to execute'),
      timeout: z.number().optional().describe('Timeout in milliseconds (default: 10000)'),
    }),
    execute: async ({ command, timeout }) => {
      if (command.startsWith('cd ')) {
        const target = command.replace('cd ', '').trim()
        const next = target.startsWith('/')
          ? target
          : resolve(session.cwd, target)

        session.cwd = next
        return {
          stdout: `Changed directory to ${session.cwd}`,
          stderr: '',
          exitCode: 0,
          cwd: session.cwd,
        }
      }
      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: timeout ?? 10_000,
          maxBuffer: 1024 * 1024 * 5,
          cwd: session.cwd,
        })

        const out = stdout.trim()
        const err = stderr.trim()

        return {
          stdout: out || '(no output)',
          stderr: err || '',
          exitCode: 0,
          cwd: session.cwd,
        }
      } catch (err: any) {
        return {
          stdout: err.stdout?.trim() ?? '',
          stderr: err.stderr?.trim() ?? err.message,
          exitCode: err.code ?? 1,
          cwd: session.cwd,
        }
      }
    },
    needsApproval: true,
  }),

  read: tool({
    description: 'Read a file with line numbers. Supports offset and limit to read specific sections. Returns content prefixed with line numbers like "1: content".',
    inputSchema: z.object({
      filePath: z.string().describe('Absolute path to the file to read'),
      offset: z.number().optional().describe('Line number to start from (1-indexed, default: 1)'),
      limit: z.number().optional().describe('Maximum number of lines to read (default: 200)'),
    }),
    execute: async ({ filePath, offset, limit }) => {
      const file = Bun.file(filePath)
      if (!await file.exists()) {
        throw new Error(`File not found: ${filePath}`)
      }
      const content = await file.text()
      const allLines = content.split('\n')
      const startLine = Math.max(1, offset ?? 1)
      const maxLines = limit ?? 200
      const endLine = Math.min(allLines.length, startLine + maxLines - 1)
      const selectedLines = allLines.slice(startLine - 1, endLine)
      const numbered = selectedLines.map((line, i) => `${startLine + i}: ${line}`)
      const header = `[${filePath}] Lines ${startLine}-${endLine} of ${allLines.length}`
      return header + '\n' + numbered.join('\n')
    },
    needsApproval: false,
  }),

  write: tool({
    description: 'Write content to a file. If the file exists, shows a unified diff of changes. Creates parent directories if needed.',
    inputSchema: z.object({
      filePath: z.string().describe('Absolute path to the file to write'),
      content: z.string().describe('The full content to write to the file'),
    }),
    execute: async ({ filePath, content }) => {
      let diff = ''
      const file = Bun.file(filePath)
      const existed = await file.exists()

      if (existed) {
        const oldContent = await file.text()
        diff = generateDiff(oldContent, content, filePath)
      }

      await Bun.write(filePath, content)
      const lines = content.split('\n').length

      if (existed) {
        return `Wrote ${lines} lines to ${filePath}\n\n${diff}`
      }
      return `Created ${filePath} (${lines} lines)`
    },
    needsApproval: true,
  }),

  sed: tool({
    description: 'Edit a file by replacing exact string matches. Shows a unified diff of the changes made. Use this for surgical edits instead of rewriting entire files.',
    inputSchema: z.object({
      filePath: z.string().describe('Absolute path to the file to edit'),
      oldString: z.string().describe('The exact string to find and replace (must match exactly)'),
      newString: z.string().describe('The replacement string'),
      replaceAll: z.boolean().optional().describe('Replace all occurrences (default: false, replaces first match only)'),
    }),
    execute: async ({ filePath, oldString, newString, replaceAll }) => {
      const file = Bun.file(filePath)
      if (!await file.exists()) {
        throw new Error(`File not found: ${filePath}`)
      }

      const oldContent = await file.text()

      if (!oldContent.includes(oldString)) {
        throw new Error(`oldString not found in ${filePath}`)
      }

      // Check for multiple matches when replaceAll is not set
      if (!replaceAll) {
        const firstIdx = oldContent.indexOf(oldString)
        const secondIdx = oldContent.indexOf(oldString, firstIdx + 1)
        if (secondIdx !== -1) {
          const occurrences = oldContent.split(oldString).length - 1
          throw new Error(
            `Found ${occurrences} matches for oldString in ${filePath}. ` +
            `Set replaceAll: true to replace all, or provide more context to make the match unique.`
          )
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
    },
    needsApproval: true,
  }),

  grep: tool({
    description: 'Search file contents using regex patterns. Returns matching lines with file paths and line numbers. Filters by file glob pattern.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Directory to search in (defaults to cwd)'),
      include: z.string().optional().describe('File glob pattern to filter (e.g. "*.ts", "*.{ts,tsx}")'),
    }),
    execute: async ({ pattern, path, include }) => {
      const searchDir = path || session.cwd
      const globPattern = include || "**/*"
      const glob = new Glob(globPattern)
      const files = Array.from(glob.scanSync({ cwd: searchDir }))
      
      const results: string[] = []
      const regex = new RegExp(pattern, 'g')
      
      for (const file of files) {
        try {
          const fullPath = join(searchDir, file)
          const content = await Bun.file(fullPath).text()
          const lines = content.split('\n')
          
          let match
          regex.lastIndex = 0
          while ((match = regex.exec(content)) !== null) {
            const beforeMatch = content.substring(0, match.index)
            const lineNumber = beforeMatch.split('\n').length
            results.push(`${file}:${lineNumber}: ${lines[lineNumber - 1]?.trim() || ''}`)
          }
        } catch {
          continue
        }
      }
      
      if (results.length === 0) return 'No matches found'
      return `${results.length} match(es):\n${results.slice(0, 50).join('\n')}${results.length > 50 ? `\n... and ${results.length - 50} more` : ''}`
    },
    needsApproval: false,
  }),

  glob: tool({
    description: 'Find files matching a glob pattern. Returns a list of matching file paths.',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern (e.g. "**/*.ts", "src/**/*.tsx")'),
      path: z.string().optional().describe('Directory to search in (defaults to cwd)'),
    }),
    execute: async ({ pattern, path }) => {
      const searchDir = path || session.cwd
      const glob = new Glob(pattern)
      const files = Array.from(glob.scanSync({ cwd: searchDir }))
      if (files.length === 0) return 'No files found'
      return `${files.length} file(s):\n${files.join('\n')}`
    },
    needsApproval: false,
  }),

  ls: tool({
    description: 'List directory contents with file type indicators. Shows directories with trailing /, files with size.',
    inputSchema: z.object({
      path: z.string().optional().describe('Directory path to list (defaults to cwd)'),
      all: z.boolean().optional().describe('Show hidden files (default: false)'),
    }),
    execute: async ({ path, all }) => {
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
    },
    needsApproval: false,
  }),
}
