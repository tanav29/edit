import { tool, zodSchema } from "ai";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import z from "zod";

export const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".cache",
  "*.log",
  ".DS_Store",
  "Thumbs.db",
  "coverage",
  ".nyc_output",
  ".env",
  ".env.local",
  "*.lock",
  "bun.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
];

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
}

function getFiles(dirPath: string, ignorePatterns: string[]): FileEntry[] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result: FileEntry[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (ignorePatterns.some((pattern) => matchesPattern(fullPath, pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        const children = getFiles(fullPath, ignorePatterns);
        result.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          children,
        });
      } else {
        result.push({
          name: entry.name,
          path: fullPath,
          isDirectory: false,
        });
      }
    }

    return result.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

function matchesPattern(filePath: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1);
    return filePath.endsWith(ext);
  }
  return filePath.includes(pattern);
}

export function createTools(workspacePath: string) {
  return {
    glob: tool({
      description: "Search for files by pattern in the workspace",
      inputSchema: zodSchema(
        z.object({
          pattern: z
            .string()
            .describe("The glob pattern to search for (e.g., '**/*.ts')"),
        }),
      ),
      execute: async ({ pattern }) => {
        try {
          const files = getFiles(workspacePath, DEFAULT_IGNORE_PATTERNS);
          const matches = findMatches(files, pattern);
          return {
            files: matches.slice(0, 50),
            total: matches.length,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    read: tool({
      description: "Read the contents of a file",
      inputSchema: zodSchema(
        z.object({
          filePath: z.string().describe("The path to the file to read"),
          offset: z
            .number()
            .optional()
            .describe("The line number to start reading from"),
          limit: z.number().optional().describe("The number of lines to read"),
        }),
      ),
      execute: async ({ filePath, offset, limit }) => {
        try {
          const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspacePath, filePath);

          if (!fs.existsSync(fullPath)) {
            return { error: `File not found: ${fullPath}` };
          }

          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          const totalLines = lines.length;

          const startOffset = offset ? offset - 1 : 0;
          const endOffset = limit ? startOffset + limit : lines.length;
          const selectedLines = lines.slice(startOffset, endOffset);

          return {
            filePath: fullPath,
            content: selectedLines.join("\n"),
            range: `${startOffset + 1}-${endOffset}`,
            totalLines,
            size: fs.statSync(fullPath).size,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    write: tool({
      description: "Write content to a file",
      inputSchema: zodSchema(
        z.object({
          filePath: z.string().describe("The path to the file to write"),
          content: z.string().describe("The content to write to the file"),
        }),
      ),
      execute: async ({ filePath, content }) => {
        try {
          const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspacePath, filePath);

          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          const existed = fs.existsSync(fullPath);
          const previousLineCount = existed
            ? fs.readFileSync(fullPath, "utf-8").split("\n").length
            : 0;

          fs.writeFileSync(fullPath, content, "utf-8");
          const newLineCount = content.split("\n").length;

          return {
            filePath: fullPath,
            action: existed ? "edited" : "created",
            previousLineCount,
            newLineCount,
            linesAdded: newLineCount - previousLineCount,
            linesRemoved: existed ? previousLineCount : 0,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
      needsApproval: true,
    }),

    bash: tool({
      description: "Execute a shell command in the workspace",
      inputSchema: zodSchema(
        z.object({
          command: z.string().describe("The command to execute"),
          timeout: z.number().optional().describe("Timeout in milliseconds"),
        }),
      ),
      execute: async ({ command, timeout }) => {
        try {
          const cwd = workspacePath;
          const output = execSync(command, {
            cwd,
            encoding: "utf-8",
            timeout: timeout || 60000,
            maxBuffer: 10 * 1024 * 1024,
          });
          return { stdout: output, path: cwd };
        } catch (error: any) {
          return {
            stdout: error.stdout || "",
            stderr: error.stderr || "",
            error: error.message,
            path: workspacePath,
          };
        }
      },
      needsApproval: true,
    }),
  };
}

function findMatches(files: FileEntry[], pattern: string): string[] {
  const matches: string[] = [];

  function matchAgainstPattern(name: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, ".");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(name);
  }

  function search(fileList: FileEntry[], patternParts: string[]) {
    if (patternParts.length === 0) {
      for (const file of fileList) {
        matches.push(file.path);
      }
      return;
    }

    const [currentPart, ...restParts] = patternParts;

    if (currentPart === "**") {
      for (const file of fileList) {
        if (file.isDirectory) {
          matches.push(file.path);
          search(file.children || [], patternParts);
        } else {
          matches.push(file.path);
        }
      }
      return;
    }

    for (const file of fileList) {
      if (file.isDirectory && matchAgainstPattern(file.name, currentPart)) {
        search(file.children || [], restParts);
      } else if (
        !file.isDirectory &&
        matchAgainstPattern(file.name, currentPart)
      ) {
        matches.push(file.path);
      }
    }
  }

  const patternParts = pattern.split("/");
  search(files, patternParts);

  return matches;
}
