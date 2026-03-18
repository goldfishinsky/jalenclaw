// tests/unit/models/claude.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClaudeProvider } from "../../../src/models/claude.js";
import type { AuthStrategy } from "../../../src/auth/strategy.js";
import type { Message, Tool } from "../../../src/models/interface.js";

function createMockAuthStrategy(
  headers: Record<string, string> = { "X-Api-Key": "sk-test" },
): AuthStrategy {
  return {
    getHeaders: vi.fn().mockResolvedValue(headers),
    isValid: vi.fn().mockResolvedValue(true),
  };
}

function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

describe("ClaudeProvider", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("sets default options", () => {
      const auth = createMockAuthStrategy();
      const provider = new ClaudeProvider(auth);

      expect(provider.name).toBe("claude");
    });

    it("accepts custom options", () => {
      const auth = createMockAuthStrategy();
      const provider = new ClaudeProvider(auth, {
        model: "claude-opus-4-20250514",
        timeout: 60,
        baseUrl: "https://custom.api.com",
      });

      expect(provider.name).toBe("claude");
    });
  });

  describe("chat", () => {
    it("calls getHeaders from auth strategy", async () => {
      const auth = createMockAuthStrategy();
      const provider = new ClaudeProvider(auth);

      const sseData = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
        "data: [DONE]\n\n",
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          body: createSSEStream(sseData),
        }),
      );

      const chunks = [];
      for await (const chunk of provider.chat([
        { role: "user", content: "Hello" },
      ])) {
        chunks.push(chunk);
      }

      expect(auth.getHeaders).toHaveBeenCalledOnce();
    });

    it("sends correct request to Anthropic API", async () => {
      const auth = createMockAuthStrategy();
      const provider = new ClaudeProvider(auth, {
        model: "claude-sonnet-4-20250514",
        baseUrl: "https://api.anthropic.com",
      });

      const sseData = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
        "data: [DONE]\n\n",
      ];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream(sseData),
      });
      vi.stubGlobal("fetch", mockFetch);

      const messages: Message[] = [{ role: "user", content: "Hello" }];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of provider.chat(messages)) {
        // consume
      }

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(options.method).toBe("POST");

      const headers = options.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      expect(headers["X-Api-Key"]).toBe("sk-test");

      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body.model).toBe("claude-sonnet-4-20250514");
      expect(body.stream).toBe(true);
      expect(body.max_tokens).toBe(4096);
      expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("yields text chunks from SSE stream", async () => {
      const auth = createMockAuthStrategy();
      const provider = new ClaudeProvider(auth);

      const sseData = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n',
        "data: [DONE]\n\n",
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          body: createSSEStream(sseData),
        }),
      );

      const chunks = [];
      for await (const chunk of provider.chat([
        { role: "user", content: "Hi" },
      ])) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
      ]);
    });

    it("throws on non-ok response", async () => {
      const auth = createMockAuthStrategy();
      const provider = new ClaudeProvider(auth);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          text: vi.fn().mockResolvedValue("Rate limited"),
        }),
      );

      const iter = provider.chat([{ role: "user", content: "Hi" }]);
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of iter) {
          // consume
        }
      }).rejects.toThrow("Claude API error 429: Rate limited");
    });

    it("includes tools in request when provided", async () => {
      const auth = createMockAuthStrategy();
      const provider = new ClaudeProvider(auth);

      const sseData = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Ok"}}\n\n',
        "data: [DONE]\n\n",
      ];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream(sseData),
      });
      vi.stubGlobal("fetch", mockFetch);

      const tools: Tool[] = [
        {
          name: "search",
          description: "Search the web",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
          },
        },
      ];

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of provider.chat(
        [{ role: "user", content: "Search for cats" }],
        tools,
      )) {
        // consume
      }

      const body = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      ) as Record<string, unknown>;
      expect(body.tools).toEqual([
        {
          name: "search",
          description: "Search the web",
          input_schema: {
            type: "object",
            properties: { query: { type: "string" } },
          },
        },
      ]);
    });
  });

  describe("countTokens", () => {
    it("returns approximate token count", () => {
      const auth = createMockAuthStrategy();
      const provider = new ClaudeProvider(auth);

      // ~4 chars per token
      expect(provider.countTokens("hello world")).toBe(
        Math.ceil("hello world".length / 4),
      );
      expect(provider.countTokens("")).toBe(0);
      expect(provider.countTokens("a")).toBe(1);
    });
  });
});
