import z from "zod";
import * as fs from "fs";
import { Glob } from "bun";
import * as path from "path";
import { tool, zodSchema } from "ai";
import { spawnSync } from "child_process";
import { createTwoFilesPatch } from "diff";
import { webSearch } from "@exalabs/ai-sdk";

const DEFAULT_READ_LINE_LIMIT = 250;
const MAX_GREP_RESULTS = 200;
const MAX_LIST_DEPTH = 5;
const MAX_LIST_ENTRIES = 300;

type GrepMatch = {
    filePath: string;
    line: number;
    column: number;
    text: string;
};

type DirectoryEntry = {
    name: string;
    relativePath: string;
    type: "file" | "directory";
    size?: number;
    children?: DirectoryEntry[];
};

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
    timeoutMs = 2000,
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

function matchesPattern(filePath: string, pattern: string): boolean {
    if (pattern.startsWith("*.")) {
        const ext = pattern.slice(1);
        return filePath.endsWith(ext);
    }
    return filePath.includes(pattern);
}

function normalizeRelativePath(value: string): string {
    return value.replace(/\\/g, "/");
}

function isIgnoredPath(relativePath: string): boolean {
    const normalized = normalizeRelativePath(relativePath);
    return DEFAULT_IGNORE_PATTERNS.some((pattern) =>
        matchesPattern(normalized, pattern),
    );
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
    return normalizeRelativePath(
        path.relative(path.resolve(workspacePath), targetPath) || ".",
    );
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
        const startOffset = offset ? Math.max(offset - 1, 0) : 0;
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

function sortDirents(entries: fs.Dirent[]): fs.Dirent[] {
    return [...entries].sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
            return a.isDirectory() ? -1 : 1;
        }

        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

function formatDirectoryTree(
    entries: DirectoryEntry[],
    indent = "",
    lines: string[] = [],
): string {
    entries.forEach((entry, index) => {
        const isLast = index === entries.length - 1;
        const connector = isLast ? "└─ " : "├─ ";
        const suffix = entry.type === "directory" ? "/" : "";
        lines.push(`${indent}${connector}${entry.name}${suffix}`);

        if (entry.type === "directory" && entry.children?.length) {
            formatDirectoryTree(
                entry.children,
                `${indent}${isLast ? "   " : "│  "}`,
                lines,
            );
        }
    });

    return lines.join("\n");
}

function listWorkspaceDirectory(params: {
    workspacePath: string;
    targetPath?: string;
    depth: number;
    limit: number;
}) {
    const { workspacePath, targetPath = ".", depth, limit } = params;
    const fullPath = resolveWorkspacePath(workspacePath, targetPath);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Path not found: ${targetPath}`);
    }

    const info = fs.statSync(fullPath);
    const relativeTarget = getRelativeWorkspacePath(workspacePath, fullPath);

    if (!info.isDirectory()) {
        return {
            path: relativeTarget,
            type: "file" as const,
            entries: [
                {
                    name: path.basename(fullPath),
                    relativePath: relativeTarget,
                    type: "file" as const,
                    size: info.size,
                },
            ],
            tree: path.basename(fullPath),
            truncated: false,
            totalReturned: 1,
        };
    }

    let remaining = limit;
    let totalReturned = 0;
    let truncated = false;

    const visit = (
        directoryPath: string,
        currentDepth: number,
    ): DirectoryEntry[] => {
        if (remaining <= 0) {
            truncated = true;
            return [];
        }

        const rawEntries = sortDirents(
            fs.readdirSync(directoryPath, { withFileTypes: true }),
        );
        const children: DirectoryEntry[] = [];

        for (const entry of rawEntries) {
            const childFullPath = path.join(directoryPath, entry.name);
            const childRelativePath = getRelativeWorkspacePath(
                workspacePath,
                childFullPath,
            );

            if (isIgnoredPath(childRelativePath)) {
                continue;
            }

            if (remaining <= 0) {
                truncated = true;
                break;
            }

            remaining -= 1;
            totalReturned += 1;

            if (entry.isDirectory()) {
                children.push({
                    name: entry.name,
                    relativePath: childRelativePath,
                    type: "directory",
                    children:
                        currentDepth > 1
                            ? visit(childFullPath, currentDepth - 1)
                            : [],
                });
            } else {
                children.push({
                    name: entry.name,
                    relativePath: childRelativePath,
                    type: "file",
                    size: fs.statSync(childFullPath).size,
                });
            }
        }

        return children;
    };

    const entries = visit(fullPath, depth);

    return {
        path: relativeTarget,
        type: "directory" as const,
        entries,
        tree: formatDirectoryTree(entries),
        truncated,
        totalReturned,
    };
}

export function buildAgentSystemPrompt(workspacePath: string): string {
    return [
        "You are Edit, a coding agent working inside a code-editing workspace.",
        `Working directory: ${workspacePath}`,
        "Solve the user's latest request directly and keep replies concise unless they ask for more detail.",
        "The core loop is simple: inspect only what you need, use tools, observe results, then continue until the task is complete.",
        "Never invent files, paths, symbols, tool results, command output, or validation status.",
        "When the codebase is unclear, first get your bearings with ls, glob, or grep. Then read the smallest useful amount of code.",
        "Prefer grep for symbols or strings, glob for filename discovery, ls for directory structure, and read for file contents.",
        "Before editing an existing file, read it or search for the exact snippet you plan to change.",
        "Use edit_file for every file modification.",
        "edit_file works by exact old_str/new_str replacement.",
        "To create a new file, use edit_file with old_str as an empty string and new_str as the full file contents.",
        "If an edit fails, do not guess. Re-read the file, get a better exact snippet, and try again.",
        "Use bash for validation, diagnostics, and project workflows. Never use bash to edit files.",
        "If you change behavior, run a relevant validation command when practical and report the actual result.",
        "Do not claim tests or commands passed unless you actually ran them.",
        "If a truly important ambiguity would change the implementation, ask one brief question. Otherwise act.",
        "Finish with a short summary of what changed and what validation you ran.",
        "Ignore patterns:",
        ...DEFAULT_IGNORE_PATTERNS.map((pattern) => `- ${pattern}`),
    ].join("\n");
}

const editFileInputSchema = z
    .object({
        path: z.string().describe("The path to the file"),
        old_str: z
            .string()
            .describe(
                "Text to search for - must match exactly. Use an empty string only when creating a brand new file",
            ),
        new_str: z.string().describe("Text to replace old_str with"),
    })
    .superRefine((value, ctx) => {
        if (!value.path || value.old_str === value.new_str) {
            ctx.addIssue({
                code: "custom",
                message:
                    "invalid input parameters: path is required and old_str must be different from new_str",
            });
        }
    });

export function createTools(workspacePath: string) {
    return {
        ls: tool({
            description:
                "List files and directories inside the workspace. Use this to get your bearings, confirm a directory exists, or inspect local structure before reading or editing. Prefer this over read when you need navigation context rather than file contents.",
            inputSchema: zodSchema(
                z.object({
                    path: z
                        .string()
                        .optional()
                        .describe(
                            "Relative directory path to inspect inside the workspace (default: .)",
                        ),
                    depth: z
                        .number()
                        .int()
                        .min(1)
                        .max(MAX_LIST_DEPTH)
                        .optional()
                        .describe(
                            "How many directory levels to include recursively (default: 2)",
                        ),
                    limit: z
                        .number()
                        .int()
                        .min(1)
                        .max(MAX_LIST_ENTRIES)
                        .optional()
                        .describe(
                            "Maximum number of entries to return before truncating the result (default: 200)",
                        ),
                }),
            ),
            execute: async ({
                path: targetPath = ".",
                depth = 2,
                limit = 200,
            }) => {
                try {
                    return listWorkspaceDirectory({
                        workspacePath,
                        targetPath,
                        depth,
                        limit,
                    });
                } catch (error) {
                    return { error: errorMessage(error) };
                }
            },
        }),

        glob: tool({
            description:
                "Find files by glob pattern inside the workspace. Use this when you know roughly what a file is called or where it lives but do not know the exact path. Prefer this for filename discovery; prefer grep for symbols or code content.",
            inputSchema: zodSchema(
                z.object({
                    patterns: z
                        .union([z.string(), z.array(z.string())])
                        .describe(
                            "One or more glob patterns to search for. Examples: '**/*.ts', 'src/**', or ['**/*.ts', '**/*.tsx']",
                        ),
                    limit: z
                        .number()
                        .int()
                        .min(1)
                        .max(1000)
                        .optional()
                        .describe(
                            "Maximum number of matching files to return (default: 50)",
                        ),
                }),
            ),
            execute: async ({ patterns, limit = 50 }) => {
                try {
                    const patternArray = Array.isArray(patterns)
                        ? patterns
                        : [patterns];

                    const files: string[] = [];
                    for (const pattern of patternArray) {
                        const globInstance = new Glob(pattern);
                        for await (const file of globInstance.scan({
                            cwd: workspacePath,
                            onlyFiles: true,
                        })) {
                            files.push(normalizeRelativePath(file));
                        }
                    }

                    const uniqueFiles = Array.from(new Set(files))
                        .filter((file) => !isIgnoredPath(file))
                        .sort((a, b) =>
                            a.localeCompare(b, undefined, {
                                sensitivity: "base",
                            }),
                        );

                    return {
                        patterns: patternArray,
                        files: uniqueFiles.slice(0, limit),
                        total: uniqueFiles.length,
                        truncated: uniqueFiles.length > limit,
                    };
                } catch (error) {
                    return { error: errorMessage(error) };
                }
            },
        }),

        read: tool({
            description:
                "Read one or more files from the workspace. Use this after locating the right path with ls, glob, or grep. Prefer focused reads when possible, and read before editing an existing file so you can supply exact old_str text.",
            inputSchema: zodSchema(
                z.object({
                    filePaths: z
                        .union([z.string(), z.array(z.string())])
                        .describe(
                            "Single relative file path or an array of file paths to read. Examples: 'src/main.ts' or ['src/main.ts', 'src/utils.ts']",
                        ),
                    offset: z
                        .number()
                        .optional()
                        .describe(
                            "1-based line number to start reading from for a focused read",
                        ),
                    limit: z
                        .number()
                        .optional()
                        .describe(
                            "Maximum number of lines to read from each file",
                        ),
                }),
            ),
            execute: async ({ filePaths, offset, limit }) => {
                try {
                    const pathArray = Array.isArray(filePaths)
                        ? filePaths
                        : [filePaths];

                    const results = await Promise.all(
                        pathArray.map((filePath) =>
                            readFile({
                                workspacePath,
                                filePath,
                                offset,
                                limit,
                            }),
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

        edit_file: tool({
            description:
                "Make edits to a text file. Replaces old_str with new_str in the given file. old_str and new_str must be different. If the file does not exist and old_str is empty, the file will be created.",
            inputSchema: zodSchema(editFileInputSchema),
            execute: async ({ path: filePath, old_str, new_str }) => {
                try {
                    const fullPath = resolveWorkspacePath(
                        workspacePath,
                        filePath,
                    );
                    const existed = fs.existsSync(fullPath);

                    if (!existed) {
                        if (old_str !== "") {
                            return {
                                error: `File not found: ${fullPath}`,
                            };
                        }

                        const parentDir = path.dirname(fullPath);
                        if (!fs.existsSync(parentDir)) {
                            fs.mkdirSync(parentDir, { recursive: true });
                        }

                        fs.writeFileSync(fullPath, new_str, "utf-8");

                        return {
                            ...getPatchedWriteResult({
                                workspacePath,
                                fullPath,
                                previousContent: "",
                                nextContent: new_str,
                                existed: false,
                                includePatch: true,
                                editCount: 1,
                            }),
                            message: `Successfully created file ${filePath}`,
                        };
                    }

                    if (old_str === "") {
                        return {
                            error: "old_str not found in file",
                        };
                    }

                    const previousContent = fs.readFileSync(fullPath, "utf-8");
                    const occurrencesFound =
                        previousContent.split(old_str).length - 1;
                    const nextContent = previousContent
                        .split(old_str)
                        .join(new_str);

                    if (previousContent === nextContent) {
                        return {
                            error: "old_str not found in file",
                        };
                    }

                    fs.writeFileSync(fullPath, nextContent, "utf-8");

                    return {
                        ...getPatchedWriteResult({
                            workspacePath,
                            fullPath,
                            previousContent,
                            nextContent,
                            existed: true,
                            includePatch: true,
                            editCount: occurrencesFound,
                        }),
                        replacements: occurrencesFound,
                    };
                } catch (error) {
                    return { error: errorMessage(error) };
                }
            },
        }),

        grep: tool({
            description:
                "Search file contents in the workspace for symbols, strings, or code patterns. Use this to find the right file or the exact snippet to read or edit. Prefer this over glob when you know content but not the path.",
            inputSchema: zodSchema(
                z.object({
                    pattern: z
                        .string()
                        .min(1)
                        .describe(
                            "Text or regex pattern to search for inside files",
                        ),
                    glob: z
                        .union([z.string(), z.array(z.string())])
                        .optional()
                        .describe(
                            "Optional file glob filter to narrow the search, such as '*.ts', 'app/**', or ['**/*.ts', 'src/**']",
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
                "Execute a shell command in the selected workspace. Use this for validation, diagnostics, builds, tests, and project workflows after or around code changes. Do not use this to edit files; use edit_file for every file modification.",
            inputSchema: zodSchema(
                z.object({
                    command: z
                        .string()
                        .describe(
                            "The shell command to execute inside the workspace",
                        ),
                    timeout: z
                        .number()
                        .optional()
                        .describe(
                            "Optional timeout in milliseconds (default: 60000)",
                        ),
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
                        error: result.error
                            ? errorMessage(result.error)
                            : undefined,
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
        }),

        web: webSearch(),

        scrape: tool({
            description:
                "Fetch one or more URLs and extract readable text content from them in parallel. Use this only when the task needs external information from specific pages.",
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
                        .describe(
                            "Max extracted content length per URL (default: 8000)",
                        ),
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
                        totalChars: results.reduce(
                            (sum, r) => sum + (r.length ?? 0),
                            0,
                        ),
                    };
                } catch (error) {
                    return { error: errorMessage(error) };
                }
            },
        }),
    };
}
