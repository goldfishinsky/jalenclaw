// tests/unit/models/claude.test.ts
import { describe, it, expect, vi } from "vitest";
import { ClaudeProvider } from "../../../src/models/claude.js";
import type { AuthStrategy } from "../../../src/auth/strategy.js";

// Track constructor args for assertions
let lastConstructorArgs: Record<string, unknown> = {};

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      constructor(opts: Record<string, unknown>) {
        lastConstructorArgs = opts;
      }
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

  it("defaults to claude-sonnet-4-6 model", () => {
    // We can't directly access private field, but we verify it doesn't throw
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

  it("uses apiKey client for API key auth", async () => {
    const provider = new ClaudeProvider(createMockAuth({ "X-Api-Key": "sk-test-key" }));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of provider.chat([{ role: "user", content: "hi" }])) { /* drain */ }
    expect(lastConstructorArgs.apiKey).toBe("sk-test-key");
    expect(lastConstructorArgs.authToken).toBeUndefined();
    expect(lastConstructorArgs.dangerouslyAllowBrowser).toBeUndefined();
  });

  it("uses Bearer + beta headers for OAuth token (Authorization header)", async () => {
    const auth = createMockAuth({ Authorization: "Bearer sk-ant-oat01-test-token" });
    const provider = new ClaudeProvider(auth);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of provider.chat([{ role: "user", content: "hi" }])) { /* drain */ }
    expect(lastConstructorArgs.authToken).toBe("sk-ant-oat01-test-token");
    expect(lastConstructorArgs.dangerouslyAllowBrowser).toBe(true);
    const defaultHeaders = lastConstructorArgs.defaultHeaders as Record<string, string>;
    expect(defaultHeaders["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(defaultHeaders["anthropic-beta"]).toContain("oauth-2025-04-20");
    expect(defaultHeaders["user-agent"]).toBe("claude-cli/2.1.76");
    expect(defaultHeaders["x-app"]).toBe("cli");
  });

  it("uses Bearer + beta headers for OAuth token (X-Api-Key with sk-ant-oat)", async () => {
    const auth = createMockAuth({ "X-Api-Key": "sk-ant-oat01-fallback-token" });
    const provider = new ClaudeProvider(auth);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of provider.chat([{ role: "user", content: "hi" }])) { /* drain */ }
    expect(lastConstructorArgs.authToken).toBe("sk-ant-oat01-fallback-token");
    expect(lastConstructorArgs.dangerouslyAllowBrowser).toBe(true);
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
