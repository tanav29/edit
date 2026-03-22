import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { ollama } from "ollama-ai-provider-v2";

import { createTools, DEFAULT_IGNORE_PATTERNS } from "@/lib/tool";

type ChatRequestBody = {
  messages: UIMessage[];
  path: string;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequestBody;

  if (!body || !Array.isArray(body.messages) || typeof body.path !== "string") {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tools = createTools(body.path);

  const result = streamText({
    model: ollama("minimax-m2.5:cloud"),
    system: `You are a powerful coding assistant/general. Working directory: ${body.path}. Ignore patterns: ${DEFAULT_IGNORE_PATTERNS.map((pattern) => `- ${pattern}`).join("\n")}. Be concise and direct.`,
    messages: await convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(100),
    maxRetries: 3,
    experimental_transform: smoothStream(),
  });

  return result.toUIMessageStreamResponse();
}
