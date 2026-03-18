import { App, type SlackEventMiddlewareArgs } from "@slack/bolt";
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from "../interface.js";

export interface SlackAdapterOptions {
  token: string;
  appToken: string;
  signingSecret: string;
}

/**
 * Slack adapter — wraps a Bolt {@link App} in Socket Mode and translates
 * platform-specific messages into the unified {@link InboundMessage} format.
 */
export class SlackAdapter implements ChannelAdapter {
  readonly name = "slack" as const;

  private readonly app: App;
  private handlers: Array<(msg: InboundMessage) => void> = [];

  constructor(options: SlackAdapterOptions);
  constructor(app: App);
  constructor(optionsOrApp: SlackAdapterOptions | App) {
    if ("token" in optionsOrApp && "appToken" in optionsOrApp) {
      this.app = new App({
        token: optionsOrApp.token,
        appToken: optionsOrApp.appToken,
        signingSecret: optionsOrApp.signingSecret,
        socketMode: true,
      });
    } else {
      this.app = optionsOrApp as App;
    }

    this.app.message(
      async ({
        message,
      }: SlackEventMiddlewareArgs<"message"> & { message: { ts: string } }) => {
        // Ignore non-standard message subtypes (edits, deletes, etc.)
        if ("subtype" in message) return;

        const m = message as {
          ts: string;
          user?: string;
          text?: string;
          channel: string;
          channel_type?: string;
        };

        const inbound: InboundMessage = {
          channelType: "slack",
          channelMessageId: m.ts,
          senderId: m.user ?? "unknown",
          groupId: m.channel_type !== "im" ? m.channel : undefined,
          content: {
            type: "text",
            text: m.text ?? "",
          },
          timestamp: Math.floor(parseFloat(m.ts) * 1000),
        };

        for (const handler of this.handlers) {
          handler(inbound);
        }
      },
    );
  }

  async connect(): Promise<void> {
    await this.app.start();
  }

  async disconnect(): Promise<void> {
    await this.app.stop();
  }

  async sendMessage(target: string, message: OutboundMessage): Promise<void> {
    await this.app.client.chat.postMessage({
      channel: target,
      text: message.text,
    });
  }

  onMessage(handler: (msg: InboundMessage) => void): void {
    this.handlers.push(handler);
  }
}
