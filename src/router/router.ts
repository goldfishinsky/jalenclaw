// src/router/router.ts
import type { StandardMessage, MessageQueue } from "./queue.js";

export type InboundHandler = (message: StandardMessage) => Promise<void>;
export type OutboundHandler = (message: StandardMessage) => Promise<void>;

export interface Router {
  routeInbound(message: StandardMessage): Promise<void>;
  routeOutbound(message: StandardMessage): Promise<void>;
  onInbound(handler: InboundHandler): void;
  onOutbound(channelType: string, handler: OutboundHandler): void;
}

export function createRouter(queue: MessageQueue): Router {
  let inboundHandler: InboundHandler | null = null;
  const outboundHandlers = new Map<string, OutboundHandler>();

  return {
    async routeInbound(message: StandardMessage): Promise<void> {
      await queue.enqueue(message);
      const msg = await queue.dequeue();
      if (!msg) return;

      if (inboundHandler) {
        await inboundHandler(msg);
      }
      // If no handler, message stays in queue (already dequeued, re-enqueue)
      else {
        await queue.enqueue(msg);
      }
    },

    async routeOutbound(message: StandardMessage): Promise<void> {
      const handler = outboundHandlers.get(message.channelType);
      if (handler) {
        await queue.enqueue(message);
        const msg = await queue.dequeue();
        if (msg) {
          await handler(msg);
        }
      } else {
        // No handler for this channel — queue it so it's not lost
        await queue.enqueue(message);
      }
    },

    onInbound(handler: InboundHandler): void {
      inboundHandler = handler;
    },

    onOutbound(channelType: string, handler: OutboundHandler): void {
      outboundHandlers.set(channelType, handler);
    },
  };
}
