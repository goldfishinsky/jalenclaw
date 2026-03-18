/**
 * OpenAI LLM provider using the Chat Completions API with SSE streaming.
 * Authenticates via API key in Authorization header.
 */
import type {
  LLMProvider,
  Message,
  Tool,
  Chunk,
  LLMProviderOptions,
} from "./interface.js";

export interface OpenAIProviderOptions extends LLMProviderOptions {
  apiKey: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;
  private readonly baseUrl: string;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-4o";
    this.timeout = options.timeout ?? 120;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com";
  }

  async *chat(messages: Message[], tools?: Tool[]): AsyncIterable<Chunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      ...(tools?.length
        ? {
            tools: tools.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })),
          }
        : {}),
    };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") return;

        try {
          const event = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string };
            }>;
          };
          const content = event.choices?.[0]?.delta?.content;
          if (content) {
            yield { type: "text", content };
          }
        } catch {
          // skip malformed SSE events
        }
      }
    }
  }

  countTokens(text: string): number {
    // Approximate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }
}
