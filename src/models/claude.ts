/**
 * Claude LLM provider using the official Anthropic SDK.
 * Supports both API key auth and OAuth token auth.
 */
import Anthropic from "@anthropic-ai/sdk";
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
    this.model = options?.model ?? "claude-haiku-4-5-20251001";
    this.timeout = options?.timeout ?? 120;
    this.baseUrl = options?.baseUrl ?? "https://api.anthropic.com";
  }

  async *chat(messages: Message[], tools?: Tool[]): AsyncIterable<Chunk> {
    const headers = await this.authStrategy.getHeaders();

    // Determine if this is OAuth (Bearer) or API key auth
    const isOAuth = !!headers["Authorization"];

    const client = isOAuth
      ? new Anthropic({
          authToken: headers["Authorization"].replace("Bearer ", ""),
          baseURL: this.baseUrl,
        })
      : new Anthropic({
          apiKey: headers["X-Api-Key"] ?? "",
          baseURL: this.baseUrl,
        });

    const toolDefs = tools?.length
      ? tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        }))
      : undefined;

    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ...(messages.some((m) => m.role === "system")
        ? { system: messages.find((m) => m.role === "system")!.content }
        : {}),
      ...(toolDefs ? { tools: toolDefs } : {}),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text", content: event.delta.text };
      }
    }
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
