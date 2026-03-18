// tests/unit/router/queue.test.ts
import { describe, it, expect } from "vitest";
import { createMessageQueue, type StandardMessage } from "../../../src/router/queue.js";

function makeMessage(overrides: Partial<StandardMessage> = {}): StandardMessage {
  return {
    id: overrides.id ?? "msg-1",
    channelType: "whatsapp",
    channelMessageId: "ch-1",
    senderId: "user-1",
    content: { type: "text", text: "hello" },
    timestamp: Date.now(),
    direction: "inbound",
    ...overrides,
  };
}

describe("createMessageQueue", () => {
  it("enqueues and dequeues in FIFO order", async () => {
    const queue = createMessageQueue();
    const msg1 = makeMessage({ id: "msg-1" });
    const msg2 = makeMessage({ id: "msg-2" });
    const msg3 = makeMessage({ id: "msg-3" });

    await queue.enqueue(msg1);
    await queue.enqueue(msg2);
    await queue.enqueue(msg3);

    expect((await queue.dequeue())!.id).toBe("msg-1");
    expect((await queue.dequeue())!.id).toBe("msg-2");
    expect((await queue.dequeue())!.id).toBe("msg-3");
  });

  it("returns null when empty", async () => {
    const queue = createMessageQueue();
    expect(await queue.dequeue()).toBeNull();
  });

  it("tracks size correctly", async () => {
    const queue = createMessageQueue();
    expect(queue.size()).toBe(0);

    await queue.enqueue(makeMessage({ id: "a" }));
    expect(queue.size()).toBe(1);

    await queue.enqueue(makeMessage({ id: "b" }));
    expect(queue.size()).toBe(2);

    await queue.dequeue();
    expect(queue.size()).toBe(1);

    await queue.dequeue();
    expect(queue.size()).toBe(0);
  });

  it("peek returns next without removing", async () => {
    const queue = createMessageQueue();
    const msg = makeMessage({ id: "peek-me" });
    await queue.enqueue(msg);

    const peeked = await queue.peek();
    expect(peeked).not.toBeNull();
    expect(peeked!.id).toBe("peek-me");
    expect(queue.size()).toBe(1);

    // Dequeue should return the same message
    const dequeued = await queue.dequeue();
    expect(dequeued!.id).toBe("peek-me");
    expect(queue.size()).toBe(0);
  });

  it("peek returns null when empty", async () => {
    const queue = createMessageQueue();
    expect(await queue.peek()).toBeNull();
  });

  it("handles multiple enqueue/dequeue cycles", async () => {
    const queue = createMessageQueue();

    // First cycle
    await queue.enqueue(makeMessage({ id: "c1-1" }));
    await queue.enqueue(makeMessage({ id: "c1-2" }));
    expect((await queue.dequeue())!.id).toBe("c1-1");
    expect((await queue.dequeue())!.id).toBe("c1-2");
    expect(await queue.dequeue()).toBeNull();

    // Second cycle
    await queue.enqueue(makeMessage({ id: "c2-1" }));
    expect(queue.size()).toBe(1);
    expect((await queue.dequeue())!.id).toBe("c2-1");
    expect(queue.size()).toBe(0);
  });

  it("overflows to disk when exceeding maxMemoryItems", async () => {
    const queue = createMessageQueue({ maxMemoryItems: 3 });

    // Enqueue 5 items — 3 in memory, 2 overflow to disk
    for (let i = 0; i < 5; i++) {
      await queue.enqueue(makeMessage({ id: `overflow-${i}` }));
    }

    expect(queue.size()).toBe(5);

    // All 5 should dequeue in FIFO order
    for (let i = 0; i < 5; i++) {
      const msg = await queue.dequeue();
      expect(msg).not.toBeNull();
      expect(msg!.id).toBe(`overflow-${i}`);
    }

    expect(await queue.dequeue()).toBeNull();
    expect(queue.size()).toBe(0);
  });

  it("concurrent enqueue is safe", async () => {
    const queue = createMessageQueue();
    const count = 100;

    // Enqueue all concurrently
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        queue.enqueue(makeMessage({ id: `concurrent-${i}` })),
      ),
    );

    expect(queue.size()).toBe(count);

    // Dequeue all and verify no duplicates/gaps
    const ids = new Set<string>();
    for (let i = 0; i < count; i++) {
      const msg = await queue.dequeue();
      expect(msg).not.toBeNull();
      ids.add(msg!.id);
    }
    expect(ids.size).toBe(count);
  });
});
