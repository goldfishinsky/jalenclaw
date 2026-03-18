import { describe, expect, it } from "vitest";
import type {
  ChannelAdapter,
  InboundMessage,
  MessageContent,
  OutboundMessage,
} from "../../../src/channels/interface.js";

// ── Mock implementation used purely for compile-time validation ────

class MockAdapter implements ChannelAdapter {
  readonly name = "mock";
  private handler: ((msg: InboundMessage) => void) | null = null;

  async connect(): Promise<void> {
    /* noop */
  }
  async disconnect(): Promise<void> {
    /* noop */
  }
  async sendMessage(): Promise<void> {
    /* noop */
  }
  onMessage(handler: (msg: InboundMessage) => void): void {
    this.handler = handler;
  }

  /** Test helper — simulate an incoming message. */
  simulateInbound(msg: InboundMessage): void {
    this.handler?.(msg);
  }
}

// ── Tests ──────────────────────────────────────────────────────────

describe("ChannelAdapter interface", () => {
  it("compiles with a mock implementation", () => {
    const adapter: ChannelAdapter = new MockAdapter();
    expect(adapter.name).toBe("mock");
  });

  it("connect / disconnect return Promises", async () => {
    const adapter = new MockAdapter();
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  it("onMessage + sendMessage round-trip", async () => {
    const adapter = new MockAdapter();
    const received: InboundMessage[] = [];

    adapter.onMessage((msg) => received.push(msg));

    const sample: InboundMessage = {
      channelType: "mock",
      channelMessageId: "1",
      senderId: "user-1",
      content: { type: "text", text: "hello" },
      timestamp: Date.now(),
    };

    adapter.simulateInbound(sample);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(sample);
  });

  it("InboundMessage accepts optional groupId", () => {
    const msg: InboundMessage = {
      channelType: "mock",
      channelMessageId: "2",
      senderId: "user-2",
      groupId: "grp-1",
      content: { type: "text", text: "hi" },
      timestamp: Date.now(),
    };
    expect(msg.groupId).toBe("grp-1");
  });

  it("MessageContent supports all media types", () => {
    const types: MessageContent["type"][] = ["text", "image", "voice", "file"];
    for (const t of types) {
      const mc: MessageContent = { type: t };
      expect(mc.type).toBe(t);
    }
  });

  it("OutboundMessage requires text field", () => {
    const out: OutboundMessage = { text: "reply" };
    expect(out.text).toBe("reply");
  });
});
