import { tool, zodSchema } from "ai";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createTwoFilesPatch } from "diff";
import { Glob } from "bun";
import z from "zod";

const DEFAULT_READ_LINE_LIMIT = 250;
const MAX_GREP_RESULTS = 200;

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

function getPatchStats(patch: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }

    if (line.startsWith("+")) {
      additions += 1;
      continue;
    }

    if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  return { additions, deletions };
}

function resolveWorkspacePath(
  workspacePath: string,
  targetPath?: string,
): string {
  const workspaceRoot = path.resolve(workspacePath);
  const resolvedTarget = targetPath
    ? path.resolve(workspaceRoot, targetPath)
    : workspaceRoot;
  const relative = path.relative(workspaceRoot, resolvedTarget);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Path must stay inside the selected workspace");
  }

  return resolvedTarget;
}

function getRelativeWorkspacePath(
  workspacePath: string,
  targetPath: string,
): string {
  return path.relative(path.resolve(workspacePath), targetPath) || ".";
}

function getPatchedWriteResult(params: {
  workspacePath: string;
  fullPath: string;
  previousContent: string;
  nextContent: string;
  existed: boolean;
  editCount?: number;
  action?: "created" | "edited";
  includePatch?: boolean;
}) {
  const {
    workspacePath,
    fullPath,
    previousContent,
    nextContent,
    existed,
    editCount = existed ? 1 : 0,
    action = existed ? "edited" : "created",
    includePatch = true,
  } = params;
  const previousLineCount = existed ? previousContent.split("\n").length : 0;
  const newLineCount = nextContent.split("\n").length;
  const relativePath =
    getRelativeWorkspacePath(workspacePath, fullPath) ||
    path.basename(fullPath);
  const patch = includePatch
    ? createTwoFilesPatch(
        relativePath,
        relativePath,
        previousContent,
        nextContent,
      )
    : undefined;
  const stats = patch ? getPatchStats(patch) : { additions: 0, deletions: 0 };

  return {
    filePath: fullPath,
    relativePath,
    action,
    previousLineCount,
    newLineCount,
    linesAdded: newLineCount - previousLineCount,
    linesRemoved: stats.deletions,
    ...(patch ? { patch } : {}),
    patchAdditions: stats.additions,
    patchDeletions: stats.deletions,
    editCount,
  };
}

type GrepMatch = {
  filePath: string;
  line: number;
  column: number;
  text: string;
};

function grepWorkspace(params: {
  workspacePath: string;
  pattern: string;
  glob?: string | string[];
  maxResults: number;
}): GrepMatch[] {
  const { workspacePath, pattern, glob, maxResults } = params;
  const rgArgs = [
    "--line-number",
    "--column",
    "--color",
    "never",
    "--no-heading",
    "--smart-case",
    "--max-count",
    String(maxResults),
  ];

  if (glob) {
    if (Array.isArray(glob)) {
      glob.forEach((globPattern) => rgArgs.push("--glob", globPattern));
    } else {
      rgArgs.push("--glob", glob);
    }
  }

  rgArgs.push(pattern, workspacePath);

  const rgResult = spawnSync("rg", rgArgs, {
    cwd: workspacePath,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });

  if (rgResult.error) {
    throw rgResult.error;
  }

  if (rgResult.status !== 0 && rgResult.status !== 1) {
    throw new Error(rgResult.stderr || "ripgrep failed");
  }

  if (!rgResult.stdout.trim()) {
    return [];
  }

  return rgResult.stdout
    .trim()
    .split("\n")
    .slice(0, maxResults)
    .map((line) => {
      const match = line.match(/^(.*?):(\d+):(\d+):(.*)$/);
      if (!match) return null;

      return {
        filePath: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        text: match[4],
      };
    })
    .filter((match): match is GrepMatch => match !== null);
}

// Helper function to read a single file
async function readFile(params: {
  workspacePath: string;
  filePath: string;
  offset?: number;
  limit?: number;
}) {
  const { workspacePath, filePath, offset, limit } = params;
  try {
    const fullPath = resolveWorkspacePath(workspacePath, filePath);

    if (!fs.existsSync(fullPath)) {
      return {
        filePath: fullPath,
        relativePath: getRelativeWorkspacePath(workspacePath, fullPath),
        error: `File not found: ${fullPath}`,
      };
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;
    const requestedLimit = limit ?? DEFAULT_READ_LINE_LIMIT;
    const startOffset = offset ? offset - 1 : 0;
    const endOffset = Math.min(startOffset + requestedLimit, lines.length);
    const selectedLines = lines.slice(startOffset, endOffset);

    return {
      filePath: fullPath,
      relativePath: getRelativeWorkspacePath(workspacePath, fullPath),
      content: selectedLines.join("\n"),
      range: `${startOffset + 1}-${endOffset}`,
      totalLines,
      size: fs.statSync(fullPath).size,
      truncated: endOffset < totalLines,
      defaultLimitApplied: limit == null,
    };
  } catch (error) {
    return {
      filePath,
      relativePath: filePath,
      error: errorMessage(error),
    };
  }
}

// Helper function to search the web for a single query
async function searchWeb(query: string, maxResults: number = 5) {
  try {
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(searchUrl, 15000);

    if (!response.ok) {
      return {
        query,
        results: [],
        total: 0,
        error: `Search request failed with status ${response.status}`,
      };
    }

    const html = await response.text();
    const results = parseDuckDuckGoResults(html, maxResults);

    return {
      query,
      results,
      total: results.length,
      provider: "duckduckgo",
    };
  } catch (error) {
    return {
      query,
      results: [],
      total: 0,
      error: errorMessage(error),
    };
  }
}

// Helper function to scrape a single URL
async function scrapeUrl(url: string, maxChars: number = 8000) {
  try {
    const validatedUrl = ensureHttpUrl(url);
    const response = await fetchWithTimeout(validatedUrl.toString(), 20000);

    if (!response.ok) {
      return {
        url: validatedUrl.toString(),
        error: `Failed to fetch page: HTTP ${response.status}`,
      };
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
    return {
      url,
      error: errorMessage(error),
    };
  }
}

export function createTools(workspacePath: string) {
  return {
    glob: tool({
      description:
        "Search for files by pattern in the workspace using Bun's fast glob",
      inputSchema: zodSchema(
        z.object({
          patterns: z
            .union([z.string(), z.array(z.string())])
            .describe(
              "Glob pattern(s) to search for. Can be a single pattern like '**/*.ts' or multiple patterns like ['**/*.ts', 'src/**']",
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(1000)
            .optional()
            .describe("Maximum number of files to return (default: 50)"),
        }),
      ),
      execute: async ({ patterns, limit = 50 }) => {
        try {
          const patternArray = Array.isArray(patterns) ? patterns : [patterns];

          const files: string[] = [];
          for (const pattern of patternArray) {
            const globInstance = new Glob(pattern);
            for await (const file of globInstance.scan({
              cwd: workspacePath,
              onlyFiles: true,
            })) {
              files.push(file);
            }
          }

          // Remove duplicates, filter ignored patterns, and sort
          const uniqueFiles = Array.from(new Set(files))
            .filter(
              (file) =>
                !DEFAULT_IGNORE_PATTERNS.some((pattern) =>
                  matchesPattern(file, pattern),
                ),
            )
            .sort();

          return {
            patterns: patternArray,
            files: uniqueFiles.slice(0, limit),
            total: uniqueFiles.length,
          };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
    }),

    read: tool({
      description: "Read the contents of one or more files in parallel",
      inputSchema: zodSchema(
        z.object({
          filePaths: z
            .union([z.string(), z.array(z.string())])
            .describe(
              "Single file path or array of file paths to read. Can be a single path like 'src/main.ts' or multiple paths like ['src/main.ts', 'src/utils.ts']",
            ),
          offset: z
            .number()
            .optional()
            .describe("The line number to start reading from"),
          limit: z.number().optional().describe("The number of lines to read"),
        }),
      ),
      execute: async ({ filePaths, offset, limit }) => {
        try {
          const pathArray = Array.isArray(filePaths) ? filePaths : [filePaths];

          const results = await Promise.all(
            pathArray.map((filePath) =>
              readFile({ workspacePath, filePath, offset, limit }),
            ),
          );

          return {
            files: results,
            count: results.length,
            successCount: results.filter((r) => !r.error).length,
            errorCount: results.filter((r) => r.error).length,
          };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
    }),

    patch: tool({
      description:
        "Only editing tool: apply exact text replacements inside existing files for targeted patch-style changes.",
      inputSchema: zodSchema(
        z.object({
          filePath: z.string().describe("The path to the file to edit"),
          oldText: z.string().min(1).describe("Exact existing text to replace"),
          newText: z.string().describe("Replacement text"),
          replaceAll: z
            .boolean()
            .optional()
            .describe("Replace every exact match instead of only the first"),
        }),
      ),
      execute: async ({ filePath, oldText, newText, replaceAll = false }) => {
        try {
          const fullPath = resolveWorkspacePath(workspacePath, filePath);

          if (!fs.existsSync(fullPath)) {
            return { error: `File not found: ${fullPath}` };
          }

          const original = fs.readFileSync(fullPath, "utf-8");
          const occurrences = original.split(oldText).length - 1;

          if (occurrences === 0) {
            return {
              error:
                "Exact match not found. Read the file again and use a more precise oldText snippet.",
            };
          }

          const nextContent = replaceAll
            ? original.split(oldText).join(newText)
            : original.replace(oldText, newText);

          fs.writeFileSync(fullPath, nextContent, "utf-8");

          return {
            ...getPatchedWriteResult({
              workspacePath,
              fullPath,
              previousContent: original,
              nextContent,
              existed: true,
              editCount: replaceAll ? occurrences : 1,
              includePatch: true,
            }),
            replacements: replaceAll ? occurrences : 1,
            occurrencesFound: occurrences,
          };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
    }),

    grep: tool({
      description:
        "Search file contents in the workspace. Use this before reading or editing when you need to find symbols, strings, or code patterns.",
      inputSchema: zodSchema(
        z.object({
          pattern: z
            .string()
            .min(1)
            .describe("Text or regex pattern to search"),
          glob: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe(
              "Optional file glob filter such as '*.ts', 'app/**', or ['**/*.ts', 'src/**'] for multiple patterns",
            ),
          maxResults: z
            .number()
            .int()
            .min(1)
            .max(MAX_GREP_RESULTS)
            .optional()
            .describe("Maximum number of matches to return"),
        }),
      ),
      execute: async ({ pattern, glob, maxResults = 50 }) => {
        try {
          const matches = grepWorkspace({
            workspacePath,
            pattern,
            glob,
            maxResults,
          }).map((match) => ({
            ...match,
            relativePath: getRelativeWorkspacePath(
              workspacePath,
              match.filePath,
            ),
          }));

          return {
            pattern,
            glob: glob ?? null,
            total: matches.length,
            matches,
          };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
    }),

    bash: tool({
      description:
        "Execute a shell command in the workspace you are already in the workspace dir.",
      inputSchema: zodSchema(
        z.object({
          command: z.string().describe("The command to execute"),
          timeout: z.number().optional().describe("Timeout in milliseconds"),
        }),
      ),
      execute: async ({ command, timeout }) => {
        try {
          const cwd = resolveWorkspacePath(workspacePath);
          const result = spawnSync(command, {
            cwd,
            encoding: "utf8",
            shell: true,
            timeout: timeout || 60000,
            maxBuffer: 10 * 1024 * 1024,
          });

          const truncated =
            result.error instanceof Error &&
            "code" in result.error &&
            (result.error as { code?: string }).code === "ENOBUFS";

          const stdout = result.stdout ?? "";
          const stderr = result.stderr ?? "";
          const exitCode =
            typeof result.status === "number" ? result.status : -1;

          return {
            stdout,
            stderr,
            exitCode,
            signal: result.signal ?? null,
            success: exitCode === 0,
            truncated,
            path: cwd,
            error: result.error ? errorMessage(result.error) : undefined,
          };
        } catch (error: unknown) {
          return {
            stdout: "",
            stderr: "",
            exitCode: -1,
            success: false,
            signal: null,
            truncated: false,
            error: errorMessage(error),
            path: workspacePath,
          };
        }
      },
      // needsApproval: true,
    }),

    web: tool({
      description: "Search the web for one or more queries in parallel",
      inputSchema: zodSchema(
        z.object({
          queries: z
            .union([z.string(), z.array(z.string())])
            .describe(
              "Single search query or array of queries. Can be a single query like 'typescript' or multiple like ['typescript', 'bun runtime']",
            ),
          maxResults: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe("Maximum number of results per query (default: 5)"),
        }),
      ),
      execute: async ({ queries, maxResults = 5 }) => {
        try {
          const queryArray = Array.isArray(queries) ? queries : [queries];

          const results = await Promise.all(
            queryArray.map((query) => searchWeb(query, maxResults)),
          );

          return {
            searches: results,
            count: results.length,
            totalResults: results.reduce((sum, r) => sum + r.total, 0),
            successCount: results.filter((r) => !r.error).length,
            errorCount: results.filter((r) => r.error).length,
          };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
    }),

    scrape: tool({
      description:
        "Fetch and extract readable content from one or more URLs in parallel",
      inputSchema: zodSchema(
        z.object({
          urls: z
            .union([z.string().url(), z.array(z.string().url())])
            .describe(
              "Single URL or array of URLs to scrape. Can be a single URL like 'https://example.com' or multiple URLs",
            ),
          maxChars: z
            .number()
            .int()
            .min(500)
            .max(50000)
            .optional()
            .describe("Max extracted content length per URL (default: 8000)"),
        }),
      ),
      execute: async ({ urls, maxChars = 8000 }) => {
        try {
          const urlArray = Array.isArray(urls) ? urls : [urls];

          const results = await Promise.all(
            urlArray.map((url) => scrapeUrl(url, maxChars)),
          );

          return {
            pages: results,
            count: results.length,
            successCount: results.filter((r) => !r.error).length,
            errorCount: results.filter((r) => r.error).length,
            totalChars: results.reduce((sum, r) => sum + (r.length ?? 0), 0),
          };
        } catch (error) {
          return { error: errorMessage(error) };
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
