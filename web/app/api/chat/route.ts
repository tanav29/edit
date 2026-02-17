import { createTools } from '@/lib/tool';
import { convertToModelMessages, smoothStream, stepCountIs, streamText, type UIMessage } from 'ai';
import { ollama } from 'ollama-ai-provider-v2';

export async function POST(req: Request) {
  const { messages, path }: { messages: UIMessage[], path: string } = await req.json();
  console.log(path)
  const tools = createTools(path);
  const result = streamText({
    model: ollama("minimax-m2.5:cloud"),
    system: `You are a powerful coding assistant. Think carefully before acting.

## Workspace
The working directory is: ${path}
All file paths can be relative to this directory.

## Tool Usage Guidelines

### Reading Files
- Always read a file before editing it to get accurate line numbers.
- For large files, read in chunks using offset and limit.
- You can use relative paths (e.g., "src/index.ts") instead of absolute paths.

### Editing Files
- Always read the file first to see current content and line numbers.
- Use line-range edits for surgical changes (preferred for small modifications).
- Use fullContent for creating new files or when most of the file is changing.
- Edits are applied directly to disk — be precise with line numbers.

### Running Commands
- Use the bash tool to run shell commands when needed.
- Commands execute in the workspace directory.`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(20),
    maxRetries: 3,
    experimental_transform: smoothStream(),
  });

  return result.toUIMessageStreamResponse();
}
