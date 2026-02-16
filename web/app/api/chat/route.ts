import { tools } from '@/lib/tool';
import { convertToModelMessages, smoothStream, stepCountIs, streamText, type UIMessage } from 'ai';
import { ollama } from 'ollama-ai-provider-v2';

export async function POST(req: Request) {
  const { messages, path }: { messages: UIMessage[], path: string } = await req.json();

  const result = streamText({
    model: ollama("qwen3:8b"),
    system: `You are a powerful assistant that deep think before sending a token.
    
The base path is ${path} for agentic !!STRICTLY!!.`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(20),
    maxRetries: 3,
    experimental_transform: smoothStream(),
  });

  return result.toUIMessageStreamResponse();
}
