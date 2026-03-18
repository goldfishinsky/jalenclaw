// tests/unit/models/ollama.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "../../../src/models/ollama.js";
import type { Message } from "../../../src/models/interface.js";

function createNDJSONStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}

describe("OllamaProvider", () => {
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
      const provider = new OllamaProvider();

      expect(provider.name).toBe("ollama");
    });

    it("accepts custom options", () => {
      const provider = new OllamaProvider({
        model: "mistral",
        timeout: 60,
        baseUrl: "http://192.168.1.100:11434",
      });

      expect(provider.name).toBe("ollama");
    });
  });

  describe("chat", () => {
    it("sends correct request to Ollama API", async () => {
      const provider = new OllamaProvider({
        model: "llama3",
        baseUrl: "http://localhost:11434",
      });

      const ndjsonData = [
        '{"message":{"content":"Hi"},"done":false}\n',
        '{"message":{"content":""},"done":true}\n',
      ];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createNDJSONStream(ndjsonData),
      });
      vi.stubGlobal("fetch", mockFetch);

      const messages: Message[] = [{ role: "user", content: "Hello" }];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of provider.chat(messages)) {
        // consume
      }

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://localhost:11434/api/chat");
      expect(options.method).toBe("POST");

      const headers = options.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      // No auth header for Ollama
      expect(headers["Authorization"]).toBeUndefined();

      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body.model).toBe("llama3");
      expect(body.stream).toBe(true);
      expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("yields text chunks from NDJSON stream", async () => {
      const provider = new OllamaProvider();

      const ndjsonData = [
        '{"message":{"content":"Hello"},"done":false}\n',
        '{"message":{"content":" world"},"done":false}\n',
        '{"message":{"content":""},"done":true}\n',
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          body: createNDJSONStream(ndjsonData),
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
      const provider = new OllamaProvider();

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: vi.fn().mockResolvedValue("Model not found"),
        }),
      );

      const iter = provider.chat([{ role: "user", content: "Hi" }]);
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of iter) {
          // consume
        }
      }).rejects.toThrow("Ollama API error 500: Model not found");
    });

    it("stops yielding when done is true", async () => {
      const provider = new OllamaProvider();

      const ndjsonData = [
        '{"message":{"content":"Hi"},"done":false}\n',
        '{"message":{"content":""},"done":true}\n',
        '{"message":{"content":"should not appear"},"done":false}\n',
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          body: createNDJSONStream(ndjsonData),
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

    it("handles empty content in NDJSON events", async () => {
      const provider = new OllamaProvider();

      const ndjsonData = [
        '{"message":{"content":""},"done":false}\n',
        '{"message":{"content":"Hi"},"done":false}\n',
        '{"message":{"content":""},"done":true}\n',
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          body: createNDJSONStream(ndjsonData),
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
      const provider = new OllamaProvider();

      // ~4 chars per token
      expect(provider.countTokens("hello world")).toBe(
        Math.ceil("hello world".length / 4),
      );
      expect(provider.countTokens("")).toBe(0);
      expect(provider.countTokens("a")).toBe(1);
    });
  });
});
