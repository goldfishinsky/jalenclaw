// tests/unit/router/router.test.ts
import { describe, it, expect, vi } from "vitest";
import { createRouter } from "../../../src/router/router.js";
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

describe("createRouter", () => {
  it("routes inbound message to registered handler", async () => {
    const queue = createMessageQueue();
    const router = createRouter(queue);
    const handler = vi.fn().mockResolvedValue(undefined);

    router.onInbound(handler);

    const msg = makeMessage({ direction: "inbound" });
    await router.routeInbound(msg);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it("routes outbound message to correct channel handler", async () => {
    const queue = createMessageQueue();
    const router = createRouter(queue);
    const whatsappHandler = vi.fn().mockResolvedValue(undefined);
    const telegramHandler = vi.fn().mockResolvedValue(undefined);

    router.onOutbound("whatsapp", whatsappHandler);
    router.onOutbound("telegram", telegramHandler);

    const msg = makeMessage({ channelType: "telegram", direction: "outbound" });
    await router.routeOutbound(msg);

    expect(telegramHandler).toHaveBeenCalledOnce();
    expect(telegramHandler).toHaveBeenCalledWith(msg);
    expect(whatsappHandler).not.toHaveBeenCalled();
  });

  it("queues message when no handler registered", async () => {
    const queue = createMessageQueue();
    const router = createRouter(queue);

    const msg = makeMessage({ direction: "inbound" });
    // Should not throw
    await router.routeInbound(msg);

    expect(queue.size()).toBe(1);
    const queued = await queue.dequeue();
    expect(queued!.id).toBe(msg.id);
  });

  it("multiple channel handlers work independently", async () => {
    const queue = createMessageQueue();
    const router = createRouter(queue);
    const whatsappHandler = vi.fn().mockResolvedValue(undefined);
    const telegramHandler = vi.fn().mockResolvedValue(undefined);

    router.onOutbound("whatsapp", whatsappHandler);
    router.onOutbound("telegram", telegramHandler);

    await router.routeOutbound(makeMessage({ channelType: "whatsapp", direction: "outbound" }));
    await router.routeOutbound(makeMessage({ channelType: "telegram", direction: "outbound" }));
    await router.routeOutbound(makeMessage({ channelType: "whatsapp", direction: "outbound" }));

    expect(whatsappHandler).toHaveBeenCalledTimes(2);
    expect(telegramHandler).toHaveBeenCalledTimes(1);
  });

  it("message passes through queue", async () => {
    const queue = createMessageQueue();
    const router = createRouter(queue);
    const received: StandardMessage[] = [];
    const handler = vi.fn(async (msg: StandardMessage) => {
      received.push(msg);
    });

    router.onInbound(handler);

    const msg1 = makeMessage({ id: "q-1" });
    const msg2 = makeMessage({ id: "q-2" });
    await router.routeInbound(msg1);
    await router.routeInbound(msg2);

    expect(received).toHaveLength(2);
    expect(received[0]!.id).toBe("q-1");
    expect(received[1]!.id).toBe("q-2");
  });

  it("unhandled outbound messages don't crash", async () => {
    const queue = createMessageQueue();
    const router = createRouter(queue);

    // No handler for "slack" — should not throw
    const msg = makeMessage({ channelType: "slack", direction: "outbound" });
    await expect(router.routeOutbound(msg)).resolves.toBeUndefined();
  });
});
