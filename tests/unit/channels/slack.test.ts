import { describe, expect, it, vi, beforeEach } from "vitest";
import type { InboundMessage } from "../../../src/channels/interface.js";

// ── Bolt mock ──────────────────────────────────────────────────────

type MessageMiddleware = (args: unknown) => Promise<void>;

function createMockApp() {
  const middlewares: MessageMiddleware[] = [];

  const app = {
    message: vi.fn((handler: MessageMiddleware) => {
      middlewares.push(handler);
    }),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    client: {
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
    /** Test helper — fire the registered message middleware */
    async __fire(args: unknown) {
      for (const mw of middlewares) {
        await mw(args);
      }
    },
  };

  return app;
}

vi.mock("@slack/bolt", () => ({
  App: vi.fn(),
}));

import { SlackAdapter } from "../../../src/channels/slack/adapter.js";

// ── Tests ──────────────────────────────────────────────────────────

describe("SlackAdapter", () => {
  let mockApp: ReturnType<typeof createMockApp>;
  let adapter: SlackAdapter;

  beforeEach(() => {
    mockApp = createMockApp();
    adapter = new SlackAdapter(mockApp as never);
  });

  it('sets name to "slack"', () => {
    expect(adapter.name).toBe("slack");
  });

  it("connect starts the Bolt app", async () => {
    await adapter.connect();
    expect(mockApp.start).toHaveBeenCalledOnce();
  });

  it("disconnect stops the Bolt app", async () => {
    await adapter.disconnect();
    expect(mockApp.stop).toHaveBeenCalledOnce();
  });

  it("onMessage registers handler that receives InboundMessage for DM", async () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    await mockApp.__fire({
      message: {
        ts: "1710000000.000100",
        user: "U123",
        text: "hello from slack",
        channel: "D456",
        channel_type: "im",
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0].channelType).toBe("slack");
    expect(received[0].content.text).toBe("hello from slack");
    expect(received[0].senderId).toBe("U123");
    expect(received[0].groupId).toBeUndefined();
  });

  it("sendMessage calls chat.postMessage", async () => {
    await adapter.sendMessage("C789", { text: "reply" });
    expect(mockApp.client.chat.postMessage).toHaveBeenCalledWith({
      channel: "C789",
      text: "reply",
    });
  });

  it("handles channel (group) messages with groupId", async () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    await mockApp.__fire({
      message: {
        ts: "1710000001.000200",
        user: "U456",
        text: "channel msg",
        channel: "C100",
        channel_type: "channel",
      },
    });

    const msg = received[0];
    expect(msg.groupId).toBe("C100");
    expect(msg.senderId).toBe("U456");
  });

  it("ignores messages with subtypes (edits, etc.)", async () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    await mockApp.__fire({
      message: {
        ts: "1710000002.000300",
        user: "U789",
        text: "edited",
        channel: "C100",
        channel_type: "channel",
        subtype: "message_changed",
      },
    });

    expect(received).toHaveLength(0);
  });

  it("dispatches to multiple handlers", async () => {
    const a: InboundMessage[] = [];
    const b: InboundMessage[] = [];
    adapter.onMessage((msg) => a.push(msg));
    adapter.onMessage((msg) => b.push(msg));

    await mockApp.__fire({
      message: {
        ts: "1710000003.000400",
        user: "U111",
        text: "x",
        channel: "D111",
        channel_type: "im",
      },
    });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("converts Slack ts to millisecond timestamp", async () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    await mockApp.__fire({
      message: {
        ts: "1710000000.500000",
        user: "U222",
        text: "ts test",
        channel: "D222",
        channel_type: "im",
      },
    });

    expect(received[0].timestamp).toBe(1710000000500);
  });
});
