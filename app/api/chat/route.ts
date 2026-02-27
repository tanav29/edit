import { catalog } from "@/lib/catalog";
import { createTools, DEFAULT_IGNORE_PATTERNS } from "@/lib/tool";
import { pipeJsonRender } from "@json-render/core";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { ollama } from "ollama-ai-provider-v2";
import * as fs from "fs";
import * as path from "path";

const HISTORY_DIR = path.join(process.env.HOME || "/home/thetanav", ".edit", "history");

function getHistoryFilePath(sessionPath: string): string {
  const sanitized = sessionPath.replace(/[^a-zA-Z0-9]/g, "_");
  return path.join(HISTORY_DIR, `${sanitized}.json`);
}

export async function POST(req: Request) {
  const { messages, path: workspacePath }: { messages: UIMessage[]; path: string } =
    await req.json();
  console.log(workspacePath);
  const tools = createTools(workspacePath);
  const systemPrompt = catalog.prompt();
  const result = streamText({
    model: ollama("minimax-m2.5:cloud"),
    system: `You are a powerful coding assistant/general agent. Think carefully before acting.

## Workspace
The working directory is: ${workspacePath}
All file paths can be relative to this directory.

## Ignore Patterns (DO NOT read/edit these)
The following patterns are automatically ignored to avoid massive context:
${DEFAULT_IGNORE_PATTERNS.map((p: string) => `- ${p}`).join("\n")}

## Tool Usage Guidelines

### Reading Files
- Always read a file before editing it to get accurate line numbers.
- For large files, read in chunks using offset and limit.
- You can use relative paths (e.g., "src/index.ts") instead of absolute paths.
- NEVER read files matching ignore patterns (node_modules, .git, build dirs, etc.).

### Editing Files
- Always read the file first to see current content and line numbers.
- Use line-range edits for surgical changes (preferred for small modifications).
- Use fullContent for creating new files or when most of the file is changing.
- Edits are applied directly to disk — be precise with line numbers.

### Running Commands
- Use the bash tool to run shell commands when needed.
- Commands execute in the workspace directory.

### Searching Files
- Use the glob tool to find files by pattern (e.g., "**/*.ts").
- Glob results are sorted by modification time, most recent first.
- Glob automatically excludes ignored patterns.

### Web Search
- Use web-search when you need current information or external documentation.
- Use web-fetch when given a specific URL to analyze.

## Response Guidelines
- Be concise and direct. Avoid unnecessary explanations.
- Only address the specific query or task at hand.
- When giving file paths, include line numbers (e.g., "src/index.ts:42").
- Never output text like "Here is..." or "Based on the information..."
- One-word answers are best when appropriate.

## JSON RENDER
- Catalog: ${systemPrompt}
- Dont create a new json file for json render`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(20),
    maxRetries: 3,
    experimental_transform: smoothStream(),
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const uiStream = pipeJsonRender(result.toUIMessageStream());
      writer.merge(uiStream);
      
      // We'll skip the complex collection for now and just rely on the existing 10s auto-save
      // which is more robust for streaming
    },
  });
  return createUIMessageStreamResponse({ stream });
}
