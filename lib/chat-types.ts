export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  name: string;
  path: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
