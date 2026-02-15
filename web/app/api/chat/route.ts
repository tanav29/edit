import { tools } from '@/lib/tool';
import { convertToModelMessages, smoothStream, streamText, tool, type UIMessage } from 'ai';
import { ollama } from 'ollama-ai-provider-v2';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: ollama("minimax-m2.5:cloud"),
    system: 'You are a helpful assistant.',
    messages: await convertToModelMessages(messages),
    tools,
    experimental_transform: smoothStream()
  });

  return result.toUIMessageStreamResponse();
}