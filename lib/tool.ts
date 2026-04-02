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

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function ensureHttpUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs are supported");
  }
  return url;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; EditBot/1.0)",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseDuckDuckGoResults(
  html: string,
  maxResults: number,
): SearchResult[] {
  const results: SearchResult[] = [];

  const pattern =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && results.length < maxResults) {
    const rawUrl = decodeHtmlEntities(match[1] || "");
    const title = stripHtml(match[2] || "");
    const snippet = stripHtml(match[3] || "");

    let cleanedUrl = rawUrl;
    if (cleanedUrl.startsWith("//")) {
      cleanedUrl = `https:${cleanedUrl}`;
    } else if (cleanedUrl.startsWith("/l/?")) {
      const redirect = new URL(`https://duckduckgo.com${cleanedUrl}`);
      const target = redirect.searchParams.get("uddg");
      if (target) cleanedUrl = decodeURIComponent(target);
    }

    if (!title || !cleanedUrl) continue;

    results.push({ title, url: cleanedUrl, snippet });
  }

  return results;
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
          return { error: errorMessage(error) };
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
          return { error: errorMessage(error) };
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
          return { error: errorMessage(error) };
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
        } catch (error: unknown) {
          const withOutput = error as {
            stdout?: string;
            stderr?: string;
            message?: string;
          };
          return {
            stdout: withOutput.stdout || "",
            stderr: withOutput.stderr || "",
            error: withOutput.message || errorMessage(error),
            path: workspacePath,
          };
        }
      },
      needsApproval: true,
    }),

    web: tool({
      description: "Search the web and return top results",
      inputSchema: zodSchema(
        z.object({
          query: z.string().min(1).describe("The search query"),
          maxResults: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe("Maximum number of results to return (default: 5)"),
        }),
      ),
      execute: async ({ query, maxResults = 5 }) => {
        try {
          const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
          const response = await fetchWithTimeout(searchUrl, 15000);

          if (!response.ok) {
            throw new Error(
              `Search request failed with status ${response.status}`,
            );
          }

          const html = await response.text();
          const results = parseDuckDuckGoResults(html, maxResults);

          if (results.length === 0) {
            return {
              query,
              results: [],
              total: 0,
              message: "No results parsed from search response",
            };
          }

          return {
            query,
            results,
            total: results.length,
            provider: "duckduckgo",
          };
        } catch (error) {
          return { error: errorMessage(error), query, results: [], total: 0 };
        }
      },
    }),

    scrape: tool({
      description: "Fetch and extract readable content from a web page",
      inputSchema: zodSchema(
        z.object({
          url: z.string().url().describe("The page URL to scrape"),
          maxChars: z
            .number()
            .int()
            .min(500)
            .max(50000)
            .optional()
            .describe("Max extracted content length (default: 8000)"),
        }),
      ),
      execute: async ({ url, maxChars = 8000 }) => {
        try {
          const validatedUrl = ensureHttpUrl(url);
          const response = await fetchWithTimeout(
            validatedUrl.toString(),
            20000,
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch page: HTTP ${response.status}`);
          }

          const contentType = response.headers.get("content-type") || "";
          const raw = await response.text();

          if (!/html/i.test(contentType)) {
            return {
              url: validatedUrl.toString(),
              contentType,
              content: raw.slice(0, maxChars),
              truncated: raw.length > maxChars,
              length: raw.length,
            };
          }

          const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const descriptionMatch = raw.match(
            /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i,
          );

          const textContent = stripHtml(raw);

          return {
            url: validatedUrl.toString(),
            title: titleMatch ? stripHtml(titleMatch[1]) : null,
            description: descriptionMatch
              ? decodeHtmlEntities(descriptionMatch[1]).trim()
              : null,
            contentType,
            content: textContent.slice(0, maxChars),
            truncated: textContent.length > maxChars,
            length: textContent.length,
          };
        } catch (error) {
          return { error: errorMessage(error), url };
        }
      },
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
