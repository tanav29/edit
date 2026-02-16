import { createTools } from '@/lib/tool';
import { convertToModelMessages, smoothStream, stepCountIs, streamText, type UIMessage } from 'ai';
import { ollama } from 'ollama-ai-provider-v2';

export async function POST(req: Request) {
  const { messages, path }: { messages: UIMessage[], path: string } = await req.json();
  console.log(path)
  const tools = createTools(path);
  const result = streamText({
    model: ollama("minimax-m2.5:cloud"),
    system: `You are a powerful assistant that deep think before sending a token.
    
  The working path is ${path} for agentic work !!STRICTLY!!.`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(20),
    maxRetries: 3,
    experimental_transform: smoothStream(),
  });

  return result.toUIMessageStreamResponse();
}
