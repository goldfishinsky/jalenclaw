/**
 * Claude LLM provider using the Anthropic Messages API with streaming.
 * Authenticates via an AuthStrategy (API key or OAuth).
 */
import type { AuthStrategy } from "../auth/strategy.js";
import type {
  LLMProvider,
  Message,
  Tool,
  Chunk,
  LLMProviderOptions,
} from "./interface.js";

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  private readonly authStrategy: AuthStrategy;
  private readonly model: string;
  private readonly timeout: number;
  private readonly baseUrl: string;

  constructor(authStrategy: AuthStrategy, options?: LLMProviderOptions) {
    this.authStrategy = authStrategy;
    this.model = options?.model ?? "claude-sonnet-4-20250514";
    this.timeout = options?.timeout ?? 120;
    this.baseUrl = options?.baseUrl ?? "https://api.anthropic.com";
  }

  async *chat(messages: Message[], tools?: Tool[]): AsyncIterable<Chunk> {
    const headers = await this.authStrategy.getHeaders();

    const body = {
      model: this.model,
      max_tokens: 4096,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      ...(tools?.length
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
    };

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude API error ${response.status}: ${text}`);
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
            type: string;
            delta?: { type: string; text: string };
          };
          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta"
          ) {
            yield { type: "text", content: event.delta.text };
          }
        } catch {
          // skip malformed SSE events
        }
      }
    }
  }

  countTokens(text: string): number {
    // Approximate: ~4 chars per token for English, ~2 for CJK
    return Math.ceil(text.length / 4);
  }
}
