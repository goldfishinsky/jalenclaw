// tests/unit/models/deepseek.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeepSeekProvider } from "../../../src/models/deepseek.js";
import type { Message, Tool } from "../../../src/models/interface.js";

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

describe("DeepSeekProvider", () => {
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
      const provider = new DeepSeekProvider({ apiKey: "sk-test" });

      expect(provider.name).toBe("deepseek");
    });

    it("accepts custom options", () => {
      const provider = new DeepSeekProvider({
        apiKey: "sk-custom",
        model: "deepseek-coder",
        timeout: 60,
        baseUrl: "https://custom.deepseek.com",
      });

      expect(provider.name).toBe("deepseek");
    });
  });

  describe("chat", () => {
    it("sends correct request to DeepSeek API", async () => {
      const provider = new DeepSeekProvider({
        apiKey: "sk-test",
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
      });

      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
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
      expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
      expect(options.method).toBe("POST");

      const headers = options.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["Authorization"]).toBe("Bearer sk-test");

      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body.model).toBe("deepseek-chat");
      expect(body.stream).toBe(true);
      expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("yields text chunks from SSE stream", async () => {
      const provider = new DeepSeekProvider({ apiKey: "sk-test" });

      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
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
      const provider = new DeepSeekProvider({ apiKey: "sk-test" });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          text: vi.fn().mockResolvedValue("Forbidden"),
        }),
      );

      const iter = provider.chat([{ role: "user", content: "Hi" }]);
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of iter) {
          // consume
        }
      }).rejects.toThrow("DeepSeek API error 403: Forbidden");
    });

    it("includes tools in request when provided", async () => {
      const provider = new DeepSeekProvider({ apiKey: "sk-test" });

      const sseData = [
        'data: {"choices":[{"delta":{"content":"Ok"}}]}\n\n',
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
          type: "function",
          function: {
            name: "search",
            description: "Search the web",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
            },
          },
        },
      ]);
    });

    it("skips SSE events with no content in delta", async () => {
      const provider = new DeepSeekProvider({ apiKey: "sk-test" });

      const sseData = [
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
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

      expect(chunks).toEqual([{ type: "text", content: "Hi" }]);
    });
  });

  describe("countTokens", () => {
    it("returns approximate token count", () => {
      const provider = new DeepSeekProvider({ apiKey: "sk-test" });

      // ~4 chars per token
      expect(provider.countTokens("hello world")).toBe(
        Math.ceil("hello world".length / 4),
      );
      expect(provider.countTokens("")).toBe(0);
      expect(provider.countTokens("a")).toBe(1);
    });
  });
});
