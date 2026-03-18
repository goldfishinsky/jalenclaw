/**
 * Channel Adapter System — unified interface for all messaging platforms.
 *
 * Every channel (Telegram, WhatsApp, Slack, Discord, ...) implements
 * {@link ChannelAdapter} so the Router can treat them identically.
 */

// ── Message content payload ────────────────────────────────────────

export interface MessageContent {
  type: "text" | "image" | "voice" | "file";
  text?: string;
  url?: string;
  mimeType?: string;
}

// ── Inbound: channel → core ────────────────────────────────────────

export interface InboundMessage {
  channelType: string;
  channelMessageId: string;
  senderId: string;
  groupId?: string;
  content: MessageContent;
  timestamp: number;
}

// ── Outbound: core → channel ───────────────────────────────────────

export interface OutboundMessage {
  text: string;
}

// ── Adapter contract ───────────────────────────────────────────────

export interface ChannelAdapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(target: string, message: OutboundMessage): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => void): void;
}
