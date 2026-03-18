import { Client, Events, GatewayIntentBits } from "discord.js";
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from "../interface.js";

export interface DiscordAdapterOptions {
  token: string;
}

/**
 * Discord adapter — wraps a discord.js {@link Client} and translates
 * platform-specific messages into the unified {@link InboundMessage} format.
 */
export class DiscordAdapter implements ChannelAdapter {
  readonly name = "discord" as const;

  private readonly client: Client;
  private readonly token: string | undefined;
  private handlers: Array<(msg: InboundMessage) => void> = [];

  constructor(options: DiscordAdapterOptions);
  constructor(client: Client);
  constructor(optionsOrClient: DiscordAdapterOptions | Client) {
    if ("token" in optionsOrClient && typeof optionsOrClient.token === "string") {
      this.token = optionsOrClient.token;
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
      });
    } else {
      this.client = optionsOrClient as Client;
      this.token = undefined;
    }

    this.client.on(Events.MessageCreate, (message) => {
      // Ignore bot messages to prevent loops
      if (message.author.bot) return;

      const inbound: InboundMessage = {
        channelType: "discord",
        channelMessageId: message.id,
        senderId: message.author.id,
        groupId: message.guildId ?? undefined,
        content: {
          type: "text",
          text: message.content,
        },
        timestamp: message.createdTimestamp,
      };

      for (const handler of this.handlers) {
        handler(inbound);
      }
    });

    // Placeholder: slash command support
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      // TODO: route slash commands through the adapter
    });
  }

  async connect(): Promise<void> {
    if (this.token) {
      await this.client.login(this.token);
    }
  }

  async disconnect(): Promise<void> {
    await this.client.destroy();
  }

  async sendMessage(target: string, message: OutboundMessage): Promise<void> {
    const channel = await this.client.channels.fetch(target);
    if (channel && "send" in channel) {
      await (channel as { send: (text: string) => Promise<unknown> }).send(
        message.text,
      );
    }
  }

  onMessage(handler: (msg: InboundMessage) => void): void {
    this.handlers.push(handler);
  }
}
