import makeWASocket, {
  jidNormalizedUser,
  isJidGroup,
  type WASocket,
  type SocketConfig,
} from "@whiskeysockets/baileys";
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from "../interface.js";

/**
 * Extract the text body from a WAMessage, handling the two common shapes:
 * - `message.conversation` (plain text)
 * - `message.extendedTextMessage.text` (quoted replies, links, etc.)
 */
function extractText(
  waMsg: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!waMsg) return undefined;
  if (typeof waMsg.conversation === "string") return waMsg.conversation;
  const ext = waMsg.extendedTextMessage as
    | { text?: string }
    | null
    | undefined;
  return ext?.text ?? undefined;
}

/**
 * Normalize a JID so old-style `@c.us` JIDs are converted to the
 * canonical `@s.whatsapp.net` form.  Messages arriving with stale JIDs
 * were previously silently dropped — this ensures consistent sender IDs.
 */
export function normalizeJid(jid: string | null | undefined): string {
  if (!jid) return "";
  return jidNormalizedUser(jid);
}

// ── Adapter ─────────────────────────────────────────────────────────

export class WhatsAppAdapter implements ChannelAdapter {
  readonly name = "whatsapp" as const;

  private sock: WASocket | null = null;
  private handlers: Array<(msg: InboundMessage) => void> = [];
  private readonly socketConfig: Partial<SocketConfig>;

  /**
   * @param config — partial Baileys SocketConfig (auth, logger, etc.)
   *                 Callers typically pass at least `auth` from
   *                 `useMultiFileAuthState` or an in-memory store.
   */
  constructor(config: Partial<SocketConfig>);
  /**
   * Test-only overload: inject a pre-built socket.
   */
  constructor(sock: WASocket);
  constructor(configOrSock: Partial<SocketConfig> | WASocket) {
    if (typeof (configOrSock as WASocket).ev?.on === "function") {
      // Pre-built socket (test path)
      this.sock = configOrSock as WASocket;
      this.socketConfig = {};
      this.bindEvents(this.sock);
    } else {
      this.socketConfig = configOrSock as Partial<SocketConfig>;
    }
  }

  // ── ChannelAdapter contract ─────────────────────────────────────

  async connect(): Promise<void> {
    if (!this.sock) {
      this.sock = makeWASocket(this.socketConfig as SocketConfig);
      this.bindEvents(this.sock);
    }
  }

  async disconnect(): Promise<void> {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
  }

  async sendMessage(target: string, message: OutboundMessage): Promise<void> {
    if (!this.sock) {
      throw new Error("WhatsAppAdapter is not connected");
    }
    await this.sock.sendMessage(target, { text: message.text });
  }

  onMessage(handler: (msg: InboundMessage) => void): void {
    this.handlers.push(handler);
  }

  // ── Internals ───────────────────────────────────────────────────

  private bindEvents(sock: WASocket): void {
    sock.ev.on("messages.upsert", ({ messages, type }) => {
      // Only process real-time messages, not history syncs.
      if (type !== "notify") return;

      for (const waMsg of messages) {
        const text = extractText(
          waMsg.message as Record<string, unknown> | null,
        );
        if (text === undefined) continue; // not a text message

        const remoteJid = waMsg.key.remoteJid ?? "";
        const isGroup = !!isJidGroup(remoteJid);

        // In groups, participant holds the actual sender JID.
        // In DMs, remoteJid IS the sender.
        const rawSender = isGroup
          ? (waMsg.key.participant ?? "")
          : remoteJid;

        const inbound: InboundMessage = {
          channelType: "whatsapp",
          channelMessageId: waMsg.key.id ?? "",
          senderId: normalizeJid(rawSender),
          groupId: isGroup ? normalizeJid(remoteJid) : undefined,
          content: { type: "text", text },
          timestamp:
            typeof waMsg.messageTimestamp === "number"
              ? waMsg.messageTimestamp * 1000
              : Date.now(),
        };

        for (const handler of this.handlers) {
          handler(inbound);
        }
      }
    });
  }
}
