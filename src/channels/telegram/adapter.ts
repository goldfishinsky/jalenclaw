import { Bot } from "grammy";
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from "../interface.js";

/**
 * Telegram adapter — wraps a grammY {@link Bot} instance and translates
 * platform-specific messages into the unified {@link InboundMessage} format.
 */
export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram" as const;

  private readonly bot: Bot;
  private handlers: Array<(msg: InboundMessage) => void> = [];

  constructor(token: string);
  constructor(bot: Bot);
  constructor(tokenOrBot: string | Bot) {
    this.bot =
      typeof tokenOrBot === "string" ? new Bot(tokenOrBot) : tokenOrBot;

    this.bot.on("message:text", (ctx) => {
      const msg = ctx.message;

      const inbound: InboundMessage = {
        channelType: "telegram",
        channelMessageId: String(msg.message_id),
        senderId: String(msg.from.id),
        groupId:
          msg.chat.type === "group" || msg.chat.type === "supergroup"
            ? String(msg.chat.id)
            : undefined,
        content: {
          type: "text",
          text: msg.text,
        },
        timestamp: msg.date * 1000, // Telegram sends seconds → ms
      };

      for (const handler of this.handlers) {
        handler(inbound);
      }
    });
  }

  async connect(): Promise<void> {
    // grammY's start() launches long-polling in the background.
    // We intentionally do NOT await it — it runs until stop() is called.
    void this.bot.start();
  }

  async disconnect(): Promise<void> {
    await this.bot.stop();
  }

  async sendMessage(target: string, message: OutboundMessage): Promise<void> {
    await this.bot.api.sendMessage(target, message.text);
  }

  onMessage(handler: (msg: InboundMessage) => void): void {
    this.handlers.push(handler);
  }
}
