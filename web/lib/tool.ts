import { tool } from "ai";
import { tavily } from "@tavily/core";
import { resolve, extname } from "path";
import z from "zod";

// Patterns to ignore to avoid massive context
export const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".vercel",
  ".output",
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  ".DS_Store",
  "*.log",
  ".env*",
  "!.env.example",
  ".vscode",
  ".idea",
  "*.min.js",
  "*.min.css",
  "*.map",
];

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".svg",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".mkv",
  ".flac",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".sqlite",
  ".db",
]);
const tavilyClient = tavily({
  apiKey: process.env.TAVILY_API_KEY,
});

export function createTools(cwd: string) {
  return {
    bash: tool({
      title: "Bash",
      description: `Run safe bash commands in ${cwd} dir.`,
      inputSchema: z.object({
        command: z
          .string()
          .describe("Command to run. Add multiple commands with &&."),
      }),
      execute: async ({ command }) => {
        if (!cwd || cwd.trim() === "") {
          return { stdout: "ERR: no working dir" };
        }
        try {
          const proc = Bun.spawn({
            cmd: ["bash", "-lc", command], // important
            cwd,
          });

          // timeout killer
          const timer = setTimeout(() => {
            proc.kill();
          }, 2000);

          const out = await proc.stdout
            .getReader()
            .read()
            .then(({ value }) => new TextDecoder().decode(value));
          // const err = proc.stderr.getReader().read().then(({ value }) => new TextDecoder().decode(value));

          clearTimeout(timer);

          // let result = out || "(no output)";
          // if (err) result += `\nstderr:\n${err}`;

          return { stdout: out, path: cwd };
        } catch (e: any) {
          return { stdout: `ERR: ${e.message}` };
        }
      },
      needsApproval: true,
    }),

    read: tool({
      title: "Read",
      description: `Read a file from the workspace. Supports text files with line-numbered output.
Paths can be relative to the workspace root (${cwd}) or absolute.
Use offset and limit to read specific sections of large files.
Returns line-numbered content and file metadata (total lines, file size).`,
      inputSchema: z.object({
        filePath: z
          .string()
          .describe(
            "Path to the file. Can be relative to workspace or absolute.",
          ),
        offset: z
          .number()
          .default(1)
          .describe("Starting line number (1-indexed, default 1)."),
        limit: z
          .number()
          .default(200)
          .describe(
            "Maximum number of lines to return (default 200). Use smaller values for targeted reads.",
          ),
      }),
      execute: async ({ filePath, offset, limit }) => {
        try {
          const resolved = resolve(cwd, filePath);

          // Check if file is in an ignored directory
          const isIgnored = DEFAULT_IGNORE_PATTERNS.some((ignorePattern) => {
            if (ignorePattern.includes("*")) {
              const regex = new RegExp(
                "^" + ignorePattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$"
              );
              return regex.test(resolved) || resolved.split("/").some((part) => regex.test(part));
            }
            return resolved.includes(`/${ignorePattern}/`) || resolved.includes(`/${ignorePattern}`);
          });

          if (isIgnored) {
            return {
              error: `Cannot read file in ignored directory: ${resolved}`,
              filePath: resolved,
            };
          }

          const file = Bun.file(resolved);

          if (!(await file.exists())) {
            return { error: `File not found: ${resolved}` };
          }

          const ext = extname(resolved).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) {
            const size = file.size;
            return {
              error: `Binary file (${ext}), cannot display content.`,
              filePath: resolved,
              size,
            };
          }

          const content = await file.text();
          const allLines = content.split("\n");
          const totalLines = allLines.length;
          const startLine = Math.max(1, offset);
          const endLine = Math.min(totalLines, startLine + limit - 1);
          const selectedLines = allLines.slice(startLine - 1, endLine);
          const numbered = selectedLines.map(
            (line, i) => `${startLine + i}: ${line}`,
          );

          return {
            filePath: resolved,
            totalLines,
            range: `${startLine}-${endLine}`,
            size: file.size,
            content: numbered.join("\n"),
            ...(endLine < totalLines && {
              hint: `${totalLines - endLine} more lines below. Use offset=${endLine + 1} to continue reading.`,
            }),
          };
        } catch (e: unknown) {
          return {
            error: `Failed to read file: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    }),

    write: tool({
      title: "Edit",
      description: `Edit or create files in the workspace. Supports two modes:
1. Line-range edits: Provide an array of edits with start/end line numbers and replacement text. Lines are 1-indexed. To insert before line N, use start=N, end=N. To delete lines, use empty newText.
2. Full file write: Provide fullContent to write/overwrite the entire file. Use this for new files or when most of the file changes.

Paths can be relative to workspace (${cwd}) or absolute. Parent directories are created automatically.
Always read the file first before editing to get accurate line numbers.`,
      inputSchema: z.object({
        filePath: z
          .string()
          .describe(
            "Path to the file. Can be relative to workspace or absolute.",
          ),
        edits: z
          .array(
            z.object({
              start: z
                .number()
                .describe("Start line number (1-indexed, inclusive)."),
              end: z
                .number()
                .describe(
                  "End line number (1-indexed, inclusive). Same as start to insert before that line.",
                ),
              newText: z
                .string()
                .describe(
                  "Replacement text (can be multi-line). Empty string to delete lines.",
                ),
              description: z
                .string()
                .optional()
                .describe("Brief description of what this edit does."),
            }),
          )
          .optional()
          .describe(
            "Array of line-range edits. Omit if using fullContent instead.",
          ),
        fullContent: z
          .string()
          .optional()
          .describe(
            "Complete file content to write. Use for new files or full rewrites. Omit if using edits.",
          ),
      }),

      execute: async ({ filePath, edits, fullContent }) => {
        try {
          const resolved = resolve(cwd, filePath);

          // Ensure parent directory exists
          const dir = resolved.substring(0, resolved.lastIndexOf("/"));
          await Bun.$`mkdir -p ${dir}`.quiet();

          const file = Bun.file(resolved);
          const existed = await file.exists();

          // Mode 1: Full content write
          if (fullContent !== undefined) {
            await Bun.write(resolved, fullContent);
            const lines = fullContent.split("\n").length;
            return {
              filePath: resolved,
              action: existed ? "overwritten" : "created",
              totalLines: lines,
              message: `${existed ? "Overwrote" : "Created"} ${resolved} (${lines} lines)`,
            };
          }

          // Mode 2: Line-range edits
          if (!edits || edits.length === 0) {
            return { error: "No edits or fullContent provided." };
          }

          if (!existed) {
            return {
              error: `File does not exist: ${resolved}. Use fullContent to create a new file.`,
            };
          }

          const content = await file.text();
          const lines = content.split("\n");
          const originalLineCount = lines.length;

          // Sort edits by start line descending so later edits don't shift earlier ones
          const sortedEdits = [...edits].sort((a, b) => b.start - a.start);

          // Validate edit ranges
          for (const edit of sortedEdits) {
            if (edit.start < 1 || edit.start > originalLineCount + 1) {
              return {
                error: `Invalid start line ${edit.start}. File has ${originalLineCount} lines.`,
              };
            }
            if (edit.end < edit.start) {
              return {
                error: `Invalid range: end (${edit.end}) < start (${edit.start}).`,
              };
            }
          }

          const appliedEdits: {
            range: string;
            linesRemoved: number;
            linesAdded: number;
            description?: string;
          }[] = [];

          for (const edit of sortedEdits) {
            const startIdx = edit.start - 1;
            const endIdx = Math.min(edit.end, lines.length);
            const newLines =
              edit.newText === "" ? [] : edit.newText.split("\n");
            const removedCount = endIdx - startIdx;

            lines.splice(startIdx, removedCount, ...newLines);

            appliedEdits.push({
              range: `${edit.start}-${edit.end}`,
              linesRemoved: removedCount,
              linesAdded: newLines.length,
              description: edit.description,
            });
          }

          const newContent = lines.join("\n");
          await Bun.write(resolved, newContent);

          return {
            filePath: resolved,
            action: "edited",
            editCount: appliedEdits.length,
            previousLineCount: originalLineCount,
            newLineCount: lines.length,
            edits: appliedEdits,
            message: `Applied ${appliedEdits.length} edit(s) to ${resolved}`,
          };
        } catch (e: unknown) {
          return {
            error: `Failed to write file: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    }),

    "web-search": tool({
      title: "Web Search",
      description:
        "Search the web for information. Will return the content of the page as well.",
      inputSchema: z.object({
        prompt: z.string().describe("The prompt to search the web for"),
      }),
      execute: async ({ prompt }) => {
        const { results } = await tavilyClient.search(prompt, {
          maxResults: 3,
        });
        return results.map((result) => ({
          title: result.title,
          url: result.url,
          content: result.content.slice(0, 200),
        }));
      },
    }),

    test: tool({
      title: "Test",
      description: "test tool to check if the tool are working",
      inputSchema: z.object({
        arg: z.string(),
      }),
      execute: async () => {
        setTimeout(() => {
          return { ok: true };
        }, 2000);
      },
      needsApproval: true,
    }),

    glob: tool({
      title: "Glob",
      description: `Search for files matching a glob pattern in ${cwd}. Uses Bun's native glob implementation for fast file pattern matching. Supports standard glob patterns like "**/*.ts", "src/**/*.js", etc. Automatically excludes: ${DEFAULT_IGNORE_PATTERNS.join(", ")}`,
      inputSchema: z.object({
        pattern: z
          .string()
          .describe('Glob pattern to match files (e.g., "**/*.ts", "src/**/*.js")'),
        cwd: z
          .string()
          .optional()
          .describe(`Working directory to search in (default: ${cwd})`),
      }),
      execute: async ({ pattern, cwd: searchCwd }) => {
        try {
          const searchPath = searchCwd || cwd;
          if (!searchPath || searchPath.trim() === "") {
            return { error: "No working directory specified" };
          }

          const glob = new Bun.Glob(pattern);
          const results: string[] = [];

          for await (const file of glob.scan(searchPath)) {
            // Skip ignored patterns
            const shouldIgnore = DEFAULT_IGNORE_PATTERNS.some((ignorePattern) => {
              if (ignorePattern.includes("*")) {
                // Simple glob matching for patterns with wildcards
                const regex = new RegExp(
                  "^" + ignorePattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$"
                );
                return regex.test(file) || file.split("/").some((part) => regex.test(part));
              }
              return file.includes(`/${ignorePattern}/`) || file.startsWith(`${ignorePattern}/`);
            });

            if (!shouldIgnore) {
              results.push(file);
            }
          }

          // Sort by modification time, most recent first
          const filesWithStats = await Promise.all(
            results.map(async (file) => {
              try {
                const stat = await Bun.file(resolve(searchPath, file)).stat();
                return { file, mtime: stat.mtime.getTime() };
              } catch {
                return { file, mtime: 0 };
              }
            })
          );

          filesWithStats.sort((a, b) => b.mtime - a.mtime);
          const sortedFiles = filesWithStats.map((f) => f.file);

          return {
            pattern,
            cwd: searchPath,
            count: sortedFiles.length,
            files: sortedFiles,
          };
        } catch (e: unknown) {
          return {
            error: `Failed to glob files: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    }),
  };
}
