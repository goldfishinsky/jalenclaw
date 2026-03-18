import { describe, expect, it, vi, beforeEach } from "vitest";
import type { InboundMessage } from "../../../src/channels/interface.js";

// ── grammY mock ────────────────────────────────────────────────────

type MessageHandler = (ctx: unknown) => void;

function createMockBot() {
  const handlers: Record<string, MessageHandler> = {};

  const bot = {
    on: vi.fn((filter: string, handler: MessageHandler) => {
      handlers[filter] = handler;
    }),
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    api: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    /* test helper — fire a registered handler */
    __fire(filter: string, ctx: unknown) {
      handlers[filter]?.(ctx);
    },
  };

  return bot;
}

// We mock the grammy module so TelegramAdapter picks up our fake Bot.
vi.mock("grammy", () => ({
  Bot: vi.fn(),
}));

import { TelegramAdapter } from "../../../src/channels/telegram/adapter.js";

// ── Tests ──────────────────────────────────────────────────────────

describe("TelegramAdapter", () => {
  let mockBot: ReturnType<typeof createMockBot>;
  let adapter: TelegramAdapter;

  beforeEach(() => {
    mockBot = createMockBot();
    // Construct the adapter with the mock bot (uses the Bot-overload).
    adapter = new TelegramAdapter(mockBot as never);
  });

  it('sets name to "telegram"', () => {
    expect(adapter.name).toBe("telegram");
  });

  it("connect starts bot polling", async () => {
    await adapter.connect();
    expect(mockBot.start).toHaveBeenCalledOnce();
  });

  it("disconnect stops bot", async () => {
    await adapter.disconnect();
    expect(mockBot.stop).toHaveBeenCalledOnce();
  });

  it("onMessage registers handler that receives InboundMessage", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    // Simulate a DM text message from Telegram
    mockBot.__fire("message:text", {
      message: {
        message_id: 42,
        from: { id: 100 },
        chat: { id: 100, type: "private" },
        text: "hello",
        date: 1710000000,
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0].channelType).toBe("telegram");
    expect(received[0].content.text).toBe("hello");
  });

  it("sendMessage calls bot.api.sendMessage", async () => {
    await adapter.sendMessage("12345", { text: "reply" });
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith("12345", "reply");
  });

  it("handles text messages correctly", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockBot.__fire("message:text", {
      message: {
        message_id: 7,
        from: { id: 200 },
        chat: { id: 200, type: "private" },
        text: "hi there",
        date: 1710000099,
      },
    });

    const msg = received[0];
    expect(msg.channelMessageId).toBe("7");
    expect(msg.senderId).toBe("200");
    expect(msg.content.type).toBe("text");
    expect(msg.content.text).toBe("hi there");
    expect(msg.timestamp).toBe(1710000099_000);
    expect(msg.groupId).toBeUndefined();
  });

  it("handles group messages with groupId", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockBot.__fire("message:text", {
      message: {
        message_id: 99,
        from: { id: 300 },
        chat: { id: -1001234567890, type: "supergroup" },
        text: "group msg",
        date: 1710000200,
      },
    });

    const msg = received[0];
    expect(msg.groupId).toBe("-1001234567890");
    expect(msg.senderId).toBe("300");
  });

  it("dispatches to multiple handlers", () => {
    const a: InboundMessage[] = [];
    const b: InboundMessage[] = [];
    adapter.onMessage((msg) => a.push(msg));
    adapter.onMessage((msg) => b.push(msg));

    mockBot.__fire("message:text", {
      message: {
        message_id: 1,
        from: { id: 1 },
        chat: { id: 1, type: "private" },
        text: "x",
        date: 1,
      },
    });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});
