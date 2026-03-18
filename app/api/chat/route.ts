import { createTools, DEFAULT_IGNORE_PATTERNS } from "@/lib/tool";
import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { ollama } from "ollama-ai-provider-v2";

export async function POST(req: Request) {
  const {
    messages,
    path: workspacePath,
  }: { messages: UIMessage[]; path: string } = await req.json();

  const tools = createTools(workspacePath);

  const result = streamText({
    model: ollama("minimax-m2.5:cloud"),
    system: `You are a powerful coding assistant/general. Working directory: ${workspacePath}. Ignore patterns: ${DEFAULT_IGNORE_PATTERNS.map((p: string) => `- ${p}`).join("\n")}. Be concise and direct.`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(30),
    maxRetries: 3,
    experimental_transform: smoothStream(),
  });

  return result.toUIMessageStreamResponse();
}
