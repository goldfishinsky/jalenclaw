import { describe, expect, it, vi, beforeEach } from "vitest";
import type { InboundMessage } from "../../../src/channels/interface.js";

// ── Baileys mock ──────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

function createMockSocket() {
  const listeners: Record<string, EventHandler[]> = {};

  const sock = {
    ev: {
      on: vi.fn((event: string, handler: EventHandler) => {
        (listeners[event] ??= []).push(handler);
      }),
    },
    sendMessage: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
    /** Test helper — emit a Baileys event. */
    __emit(event: string, ...args: unknown[]) {
      for (const h of listeners[event] ?? []) {
        h(...args);
      }
    },
  };

  return sock;
}

vi.mock("@whiskeysockets/baileys", async () => {
  // Keep the real JID helpers so normalizeJid tests are meaningful.
  const actual = await vi.importActual<
    typeof import("@whiskeysockets/baileys")
  >("@whiskeysockets/baileys");
  return {
    ...actual,
    default: vi.fn(), // makeWASocket — not used when injecting sock
  };
});

import { WhatsAppAdapter, normalizeJid } from "../../../src/channels/whatsapp/adapter.js";

// ── Tests ─────────────────────────────────────────────────────────

describe("WhatsAppAdapter", () => {
  let mockSock: ReturnType<typeof createMockSocket>;
  let adapter: WhatsAppAdapter;

  beforeEach(() => {
    mockSock = createMockSocket();
    adapter = new WhatsAppAdapter(mockSock as never);
  });

  // 1
  it('sets name to "whatsapp"', () => {
    expect(adapter.name).toBe("whatsapp");
  });

  // 2
  it("disconnect calls sock.end", async () => {
    await adapter.disconnect();
    expect(mockSock.end).toHaveBeenCalledOnce();
  });

  // 3
  it("onMessage receives a DM text message", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockSock.__emit("messages.upsert", {
      type: "notify",
      messages: [
        {
          key: {
            remoteJid: "5511999999999@s.whatsapp.net",
            id: "MSG001",
            participant: null,
          },
          message: { conversation: "hello from whatsapp" },
          messageTimestamp: 1710000000,
        },
      ],
    });

    expect(received).toHaveLength(1);
    const msg = received[0];
    expect(msg.channelType).toBe("whatsapp");
    expect(msg.channelMessageId).toBe("MSG001");
    expect(msg.senderId).toBe("5511999999999@s.whatsapp.net");
    expect(msg.content.type).toBe("text");
    expect(msg.content.text).toBe("hello from whatsapp");
    expect(msg.timestamp).toBe(1710000000_000);
    expect(msg.groupId).toBeUndefined();
  });

  // 4 — JID normalization: old-style @c.us → @s.whatsapp.net
  it("normalizes old-style @c.us JIDs to @s.whatsapp.net", () => {
    expect(normalizeJid("5511999999999@c.us")).toBe(
      "5511999999999@s.whatsapp.net",
    );
    expect(normalizeJid("5511999999999@s.whatsapp.net")).toBe(
      "5511999999999@s.whatsapp.net",
    );
    expect(normalizeJid(null)).toBe("");
    expect(normalizeJid(undefined)).toBe("");
  });

  // 5 — Inbound messages with old-style JIDs are normalized
  it("normalizes sender JID from old-style format in messages", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockSock.__emit("messages.upsert", {
      type: "notify",
      messages: [
        {
          key: {
            remoteJid: "5511888888888@c.us",
            id: "MSG002",
            participant: null,
          },
          message: { conversation: "old jid" },
          messageTimestamp: 1710000001,
        },
      ],
    });

    expect(received[0].senderId).toBe("5511888888888@s.whatsapp.net");
  });

  // 6
  it("sendMessage delegates to sock.sendMessage", async () => {
    await adapter.sendMessage("5511999999999@s.whatsapp.net", {
      text: "reply",
    });
    expect(mockSock.sendMessage).toHaveBeenCalledWith(
      "5511999999999@s.whatsapp.net",
      { text: "reply" },
    );
  });

  // 7
  it("handles group messages with groupId and participant", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockSock.__emit("messages.upsert", {
      type: "notify",
      messages: [
        {
          key: {
            remoteJid: "120363012345678901@g.us",
            id: "MSG003",
            participant: "5511777777777@s.whatsapp.net",
          },
          message: { conversation: "group msg" },
          messageTimestamp: 1710000100,
        },
      ],
    });

    expect(received).toHaveLength(1);
    const msg = received[0];
    expect(msg.groupId).toBe("120363012345678901@g.us");
    expect(msg.senderId).toBe("5511777777777@s.whatsapp.net");
    expect(msg.content.text).toBe("group msg");
  });

  // 8 — extendedTextMessage shape
  it("extracts text from extendedTextMessage", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockSock.__emit("messages.upsert", {
      type: "notify",
      messages: [
        {
          key: {
            remoteJid: "5511999999999@s.whatsapp.net",
            id: "MSG004",
            participant: null,
          },
          message: {
            extendedTextMessage: { text: "quoted reply text" },
          },
          messageTimestamp: 1710000200,
        },
      ],
    });

    expect(received[0].content.text).toBe("quoted reply text");
  });

  // 9 — ignores non-notify upserts (history sync)
  it("ignores history-sync upserts", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockSock.__emit("messages.upsert", {
      type: "append",
      messages: [
        {
          key: { remoteJid: "5511999999999@s.whatsapp.net", id: "OLD" },
          message: { conversation: "old" },
          messageTimestamp: 1700000000,
        },
      ],
    });

    expect(received).toHaveLength(0);
  });

  // 10 — dispatches to multiple handlers
  it("dispatches to multiple handlers", () => {
    const a: InboundMessage[] = [];
    const b: InboundMessage[] = [];
    adapter.onMessage((msg) => a.push(msg));
    adapter.onMessage((msg) => b.push(msg));

    mockSock.__emit("messages.upsert", {
      type: "notify",
      messages: [
        {
          key: { remoteJid: "5511999999999@s.whatsapp.net", id: "M1" },
          message: { conversation: "x" },
          messageTimestamp: 1,
        },
      ],
    });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});
