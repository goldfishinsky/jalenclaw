// tests/unit/models/claude.test.ts
import { describe, it, expect, vi } from "vitest";
import { ClaudeProvider } from "../../../src/models/claude.js";
import type { AuthStrategy } from "../../../src/auth/strategy.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn().mockImplementation(() => {
          const events = [
            { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
            { type: "content_block_delta", delta: { type: "text_delta", text: " world" } },
            { type: "message_stop" },
          ];
          return {
            [Symbol.asyncIterator]: async function* () {
              for (const event of events) {
                yield event;
              }
            },
          };
        }),
      };
    },
  };
});

function createMockAuth(headers: Record<string, string>): AuthStrategy {
  return {
    getHeaders: vi.fn().mockResolvedValue(headers),
    isValid: vi.fn().mockResolvedValue(true),
  };
}

describe("ClaudeProvider", () => {
  it("sets default name", () => {
    const provider = new ClaudeProvider(createMockAuth({ "X-Api-Key": "k" }));
    expect(provider.name).toBe("claude");
  });

  it("accepts custom options", () => {
    const provider = new ClaudeProvider(createMockAuth({ "X-Api-Key": "k" }), {
      model: "claude-opus-4-20250514",
      timeout: 60,
      baseUrl: "https://custom.api.com",
    });
    expect(provider.name).toBe("claude");
  });

  it("calls getHeaders on chat", async () => {
    const auth = createMockAuth({ "X-Api-Key": "k" });
    const provider = new ClaudeProvider(auth);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of provider.chat([{ role: "user", content: "hi" }])) { /* drain */ }
    expect(auth.getHeaders).toHaveBeenCalled();
  });

  it("yields text chunks from stream", async () => {
    const provider = new ClaudeProvider(createMockAuth({ "X-Api-Key": "k" }));
    const chunks: string[] = [];
    for await (const chunk of provider.chat([{ role: "user", content: "hi" }])) {
      if (chunk.type === "text") chunks.push(chunk.content);
    }
    expect(chunks).toEqual(["Hello", " world"]);
  });

  it("works with Bearer token auth (OAuth)", async () => {
    const auth = createMockAuth({ Authorization: "Bearer sk-ant-oat01-test" });
    const provider = new ClaudeProvider(auth);
    const chunks: string[] = [];
    for await (const chunk of provider.chat([{ role: "user", content: "hi" }])) {
      if (chunk.type === "text") chunks.push(chunk.content);
    }
    expect(auth.getHeaders).toHaveBeenCalled();
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("countTokens returns approximate count", () => {
    const provider = new ClaudeProvider(createMockAuth({ "X-Api-Key": "k" }));
    expect(provider.countTokens("Hello, world!")).toBe(Math.ceil(13 / 4));
  });

  it("handles tools in request", async () => {
    const provider = new ClaudeProvider(createMockAuth({ "X-Api-Key": "k" }));
    const chunks: string[] = [];
    for await (const chunk of provider.chat(
      [{ role: "user", content: "search" }],
      [{ name: "search", description: "Search", parameters: { type: "object", properties: {} } }],
    )) {
      if (chunk.type === "text") chunks.push(chunk.content);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("handles system messages", async () => {
    const provider = new ClaudeProvider(createMockAuth({ "X-Api-Key": "k" }));
    const chunks: string[] = [];
    for await (const chunk of provider.chat([
      { role: "system", content: "You are helpful" },
      { role: "user", content: "hi" },
    ])) {
      if (chunk.type === "text") chunks.push(chunk.content);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });
});
