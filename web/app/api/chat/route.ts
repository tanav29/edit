import { tools } from '@/lib/tool';
import { convertToModelMessages, smoothStream, stepCountIs, streamText, type UIMessage } from 'ai';
import { ollama } from 'ollama-ai-provider-v2';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: ollama("qwen3:8b"),
    system: 'You are a helpful assistant.',
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
    experimental_transform: smoothStream(),
  });

  return result.toUIMessageStreamResponse();
}
