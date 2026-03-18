/**
 * LLM Provider interface and shared types.
 * All model integrations (Claude, OpenAI, DeepSeek, Ollama) implement LLMProvider.
 */

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Chunk {
  type: "text" | "tool_use" | "error";
  content: string;
  toolName?: string;
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: Message[], tools?: Tool[]): AsyncIterable<Chunk>;
  countTokens(text: string): number;
}

export interface LLMProviderOptions {
  model?: string;
  timeout?: number;
  baseUrl?: string;
}
