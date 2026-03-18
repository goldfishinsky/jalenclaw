/**
 * Ollama LLM provider using the Ollama REST API with NDJSON streaming.
 * No authentication needed (local models).
 */
import type {
  LLMProvider,
  Message,
  Tool,
  Chunk,
  LLMProviderOptions,
} from "./interface.js";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private readonly model: string;
  private readonly timeout: number;
  private readonly baseUrl: string;

  constructor(options?: LLMProviderOptions) {
    this.model = options?.model ?? "llama3";
    this.timeout = options?.timeout ?? 120;
    this.baseUrl = options?.baseUrl ?? "http://localhost:11434";
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async *chat(messages: Message[], _tools?: Tool[]): AsyncIterable<Chunk> {
    const body = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${text}`);
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
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
          };
          if (event.done) return;
          const content = event.message?.content;
          if (content) {
            yield { type: "text", content };
          }
        } catch {
          // skip malformed NDJSON lines
        }
      }
    }
  }

  countTokens(text: string): number {
    // Approximate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }
}
