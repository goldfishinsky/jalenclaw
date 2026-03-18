import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAgentRunner, type AgentRunner } from "../../../src/agent/runner.js";
import type { LLMProvider, Chunk } from "../../../src/models/interface.js";
import type { MemoryManager } from "../../../src/memory/manager.js";

function createMockProvider(responses: string[]): LLMProvider {
  return {
    name: "mock",
    async *chat(): AsyncIterable<Chunk> {
      for (const text of responses) {
        yield { type: "text", content: text };
      }
    },
    countTokens(text: string) {
      return text.length;
    },
  };
}

function createMockMemory(): MemoryManager & {
  _messages: Map<string, Array<{ role: string; content: string }>>;
} {
  const _messages = new Map<string, Array<{ role: string; content: string }>>();
  return {
    _messages,
    addMessage(groupId: string, role: string, content: string) {
      if (!_messages.has(groupId)) _messages.set(groupId, []);
      _messages.get(groupId)!.push({ role, content });
    },
    getContext(groupId: string) {
      return _messages.get(groupId) ?? [];
    },
    remember: vi.fn(),
    recall: vi.fn().mockReturnValue([]),
    forget: vi.fn(),
    close: vi.fn(),
  };
}

async function collectIterable(iter: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of iter) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("agent runner", () => {
  let runner: AgentRunner;
  let memory: ReturnType<typeof createMockMemory>;
  let provider: LLMProvider;

  beforeEach(() => {
    provider = createMockProvider(["Hello", " world"]);
    memory = createMockMemory();
    runner = createAgentRunner({ provider, memory });
  });

  it("creates a session on first message", async () => {
    expect(runner.getSession("g1")).toBeUndefined();
    await collectIterable(runner.handleMessage("g1", "hi"));
    const session = runner.getSession("g1");
    expect(session).toBeDefined();
    expect(session!.groupId).toBe("g1");
    expect(session!.id).toBeTruthy();
  });

  it("returns existing session for same groupId", async () => {
    await collectIterable(runner.handleMessage("g1", "first"));
    const session1 = runner.getSession("g1");
    await collectIterable(runner.handleMessage("g1", "second"));
    const session2 = runner.getSession("g1");
    expect(session1!.id).toBe(session2!.id);
  });

  it("handleMessage yields response chunks from LLM", async () => {
    const chunks = await collectIterable(runner.handleMessage("g1", "hi"));
    expect(chunks).toEqual(["Hello", " world"]);
  });

  it("saves user and assistant messages to memory", async () => {
    await collectIterable(runner.handleMessage("g1", "hi"));
    const stored = memory._messages.get("g1")!;
    expect(stored).toHaveLength(2);
    expect(stored[0]).toEqual({ role: "user", content: "hi" });
    expect(stored[1]).toEqual({ role: "assistant", content: "Hello world" });
  });

  it("loads context from memory on session creation", async () => {
    // Pre-populate memory
    memory.addMessage("g2", "user", "previous question");
    memory.addMessage("g2", "assistant", "previous answer");

    await collectIterable(runner.handleMessage("g2", "follow up"));
    const session = runner.getSession("g2");
    // Session messages should include the loaded context + new exchange
    expect(session!.messages.length).toBe(4); // 2 loaded + 1 user + 1 assistant
    expect(session!.messages[0].content).toBe("previous question");
    expect(session!.messages[1].content).toBe("previous answer");
  });

  it("destroySession removes session", async () => {
    await collectIterable(runner.handleMessage("g1", "hi"));
    expect(runner.getSession("g1")).toBeDefined();
    runner.destroySession("g1");
    expect(runner.getSession("g1")).toBeUndefined();
  });

  it("destroyIdleSessions cleans up stale sessions", async () => {
    // Create runner with very short idle timeout
    const shortRunner = createAgentRunner({
      provider,
      memory: createMockMemory(),
      idleTimeoutMs: 1,
    });

    await collectIterable(shortRunner.handleMessage("g1", "hi"));
    await collectIterable(shortRunner.handleMessage("g2", "hi"));

    // Wait just enough for the 1ms timeout to pass
    await new Promise((resolve) => setTimeout(resolve, 10));

    const destroyed = shortRunner.destroyIdleSessions();
    expect(destroyed).toBe(2);
    expect(shortRunner.getSession("g1")).toBeUndefined();
    expect(shortRunner.getSession("g2")).toBeUndefined();
  });

  it("destroyIdleSessions preserves active sessions", async () => {
    const shortRunner = createAgentRunner({
      provider,
      memory: createMockMemory(),
      idleTimeoutMs: 60_000,
    });

    await collectIterable(shortRunner.handleMessage("g1", "hi"));
    const destroyed = shortRunner.destroyIdleSessions();
    expect(destroyed).toBe(0);
    expect(shortRunner.getSession("g1")).toBeDefined();
  });

  it("isolates sessions across different groupIds", async () => {
    await collectIterable(runner.handleMessage("g1", "message for g1"));
    await collectIterable(runner.handleMessage("g2", "message for g2"));
    const s1 = runner.getSession("g1");
    const s2 = runner.getSession("g2");
    expect(s1!.id).not.toBe(s2!.id);
    expect(s1!.groupId).toBe("g1");
    expect(s2!.groupId).toBe("g2");
  });
});
