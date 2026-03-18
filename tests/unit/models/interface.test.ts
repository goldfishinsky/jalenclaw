// tests/unit/models/interface.test.ts
import { describe, it, expect } from "vitest";
import type {
  Message,
  Tool,
  Chunk,
  LLMProvider,
  LLMProviderOptions,
} from "../../../src/models/interface.js";

describe("LLMProvider interface", () => {
  it("Message accepts system, user, and assistant roles", () => {
    const messages: Message[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];
    expect(messages).toHaveLength(3);
  });

  it("Tool has name, description, and parameters", () => {
    const tool: Tool = {
      name: "search",
      description: "Search the web",
      parameters: { query: { type: "string" } },
    };
    expect(tool.name).toBe("search");
    expect(tool.parameters).toHaveProperty("query");
  });

  it("Chunk supports text, tool_use, and error types", () => {
    const textChunk: Chunk = { type: "text", content: "Hello" };
    const toolChunk: Chunk = {
      type: "tool_use",
      content: '{"query":"test"}',
      toolName: "search",
    };
    const errorChunk: Chunk = { type: "error", content: "Something failed" };

    expect(textChunk.type).toBe("text");
    expect(toolChunk.toolName).toBe("search");
    expect(errorChunk.type).toBe("error");
  });

  it("LLMProviderOptions fields are all optional", () => {
    const empty: LLMProviderOptions = {};
    const partial: LLMProviderOptions = { model: "test-model" };
    const full: LLMProviderOptions = {
      model: "test-model",
      timeout: 60,
      baseUrl: "http://localhost:8080",
    };
    expect(empty).toEqual({});
    expect(partial.model).toBe("test-model");
    expect(full.timeout).toBe(60);
  });

  it("mock provider satisfies LLMProvider interface", async () => {
    const mockProvider: LLMProvider = {
      name: "mock",
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async *chat(messages: Message[], _tools?: Tool[]): AsyncIterable<Chunk> {
        yield { type: "text", content: `Echo: ${messages[0]?.content}` };
      },
      countTokens(text: string): number {
        return text.length;
      },
    };

    expect(mockProvider.name).toBe("mock");
    expect(mockProvider.countTokens("hello")).toBe(5);

    const chunks: Chunk[] = [];
    for await (const chunk of mockProvider.chat([
      { role: "user", content: "hi" },
    ])) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([{ type: "text", content: "Echo: hi" }]);
  });
});
