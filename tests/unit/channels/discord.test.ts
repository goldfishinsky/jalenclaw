import { describe, expect, it, vi, beforeEach } from "vitest";
import type { InboundMessage } from "../../../src/channels/interface.js";

// ── discord.js mock ────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

function createMockClient() {
  const handlers: Record<string, EventHandler[]> = {};

  const client = {
    on: vi.fn((event: string, handler: EventHandler) => {
      handlers[event] ??= [];
      handlers[event].push(handler);
      return client;
    }),
    login: vi.fn().mockResolvedValue("token"),
    destroy: vi.fn().mockResolvedValue(undefined),
    channels: {
      fetch: vi.fn().mockResolvedValue({
        send: vi.fn().mockResolvedValue(undefined),
      }),
    },
    /** Test helper — fire a registered event */
    __fire(event: string, ...args: unknown[]) {
      for (const h of handlers[event] ?? []) {
        h(...args);
      }
    },
  };

  return client;
}

vi.mock("discord.js", () => ({
  Client: vi.fn(),
  Events: {
    MessageCreate: "messageCreate",
    InteractionCreate: "interactionCreate",
  },
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8,
  },
}));

import { DiscordAdapter } from "../../../src/channels/discord/adapter.js";

// ── Tests ──────────────────────────────────────────────────────────

describe("DiscordAdapter", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let adapter: DiscordAdapter;

  beforeEach(() => {
    mockClient = createMockClient();
    adapter = new DiscordAdapter(mockClient as never);
  });

  it('sets name to "discord"', () => {
    expect(adapter.name).toBe("discord");
  });

  it("connect does not call login when constructed with a Client instance", async () => {
    await adapter.connect();
    // When passing a pre-built Client, token is undefined so login is skipped
    expect(mockClient.login).not.toHaveBeenCalled();
  });

  it("disconnect destroys the client", async () => {
    await adapter.disconnect();
    expect(mockClient.destroy).toHaveBeenCalledOnce();
  });

  it("onMessage registers handler that receives InboundMessage for DM", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockClient.__fire("messageCreate", {
      id: "msg-001",
      author: { id: "user-100", bot: false },
      guildId: null,
      content: "hello from discord",
      createdTimestamp: 1710000000000,
    });

    expect(received).toHaveLength(1);
    expect(received[0].channelType).toBe("discord");
    expect(received[0].content.text).toBe("hello from discord");
    expect(received[0].senderId).toBe("user-100");
    expect(received[0].groupId).toBeUndefined();
  });

  it("sendMessage fetches channel and calls send", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    mockClient.channels.fetch.mockResolvedValue({ send: mockSend });

    await adapter.sendMessage("chan-123", { text: "reply" });

    expect(mockClient.channels.fetch).toHaveBeenCalledWith("chan-123");
    expect(mockSend).toHaveBeenCalledWith("reply");
  });

  it("handles guild (group) messages with groupId", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockClient.__fire("messageCreate", {
      id: "msg-002",
      author: { id: "user-200", bot: false },
      guildId: "guild-999",
      content: "guild msg",
      createdTimestamp: 1710000001000,
    });

    const msg = received[0];
    expect(msg.groupId).toBe("guild-999");
    expect(msg.senderId).toBe("user-200");
  });

  it("ignores bot messages", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockClient.__fire("messageCreate", {
      id: "msg-003",
      author: { id: "bot-1", bot: true },
      guildId: null,
      content: "I am a bot",
      createdTimestamp: 1710000002000,
    });

    expect(received).toHaveLength(0);
  });

  it("dispatches to multiple handlers", () => {
    const a: InboundMessage[] = [];
    const b: InboundMessage[] = [];
    adapter.onMessage((msg) => a.push(msg));
    adapter.onMessage((msg) => b.push(msg));

    mockClient.__fire("messageCreate", {
      id: "msg-004",
      author: { id: "user-300", bot: false },
      guildId: null,
      content: "x",
      createdTimestamp: 1,
    });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("sets correct channelMessageId and timestamp", () => {
    const received: InboundMessage[] = [];
    adapter.onMessage((msg) => received.push(msg));

    mockClient.__fire("messageCreate", {
      id: "msg-005",
      author: { id: "user-400", bot: false },
      guildId: null,
      content: "ts test",
      createdTimestamp: 1710000099000,
    });

    expect(received[0].channelMessageId).toBe("msg-005");
    expect(received[0].timestamp).toBe(1710000099000);
    expect(received[0].content.type).toBe("text");
  });
});
