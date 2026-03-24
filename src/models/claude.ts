/**
 * Claude LLM provider using the official Anthropic SDK.
 * Supports both API key auth and OAuth token auth (setup-token / Bearer).
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

/** Beta headers required for OAuth token access (matches Claude CLI / Pi-AI SDK). */
const OAUTH_BETA_HEADERS = {
  "anthropic-dangerous-direct-browser-access": "true",
  "anthropic-beta":
    "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14",
  "user-agent": "claude-cli/2.1.76",
  "x-app": "cli",
};

/** Check whether a token / header set indicates an OAuth (setup-token) flow. */
function isOAuthHeaders(headers: Record<string, string>): boolean {
  return (
    !!headers["Authorization"]?.startsWith("Bearer") ||
    !!headers["X-Api-Key"]?.includes("sk-ant-oat")
  );
}

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  private readonly authStrategy: AuthStrategy;
  private readonly model: string;
  private readonly timeout: number;
  private readonly baseUrl: string;

  constructor(authStrategy: AuthStrategy, options?: LLMProviderOptions) {
    this.authStrategy = authStrategy;
    this.model = options?.model ?? "claude-sonnet-4-6";
    this.timeout = options?.timeout ?? 120;
    this.baseUrl = options?.baseUrl ?? "https://api.anthropic.com";
  }

  async *chat(messages: Message[], tools?: Tool[]): AsyncIterable<Chunk> {
    const headers = await this.authStrategy.getHeaders();

    // Build the Anthropic client – OAuth tokens need Bearer + beta headers
    const isOAuth = isOAuthHeaders(headers);

    let client: Anthropic;
    if (isOAuth) {
      const token =
        headers["Authorization"]?.replace("Bearer ", "") ??
        headers["X-Api-Key"];
      client = new Anthropic({
        apiKey: "",          // SDK requires a string; we override with authToken
        authToken: token,
        baseURL: this.baseUrl,
        dangerouslyAllowBrowser: true,
        defaultHeaders: OAUTH_BETA_HEADERS,
      });
    } else {
      client = new Anthropic({
        apiKey: headers["X-Api-Key"] ?? "",
        baseURL: this.baseUrl,
      });
    }

    const toolDefs = tools?.length
      ? tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        }))
      : undefined;

    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 16384,
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
