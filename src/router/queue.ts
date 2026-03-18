// src/router/queue.ts
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface MessageContent {
  type: "text" | "image" | "voice" | "file";
  text?: string;
  url?: string;
  mimeType?: string;
}

export interface StandardMessage {
  id: string;
  channelType: string;
  channelMessageId: string;
  senderId: string;
  groupId?: string;
  content: MessageContent;
  timestamp: number;
  direction: "inbound" | "outbound";
}

export interface MessageQueue {
  enqueue(message: StandardMessage): Promise<void>;
  dequeue(): Promise<StandardMessage | null>;
  size(): number;
  peek(): Promise<StandardMessage | null>;
}

export interface MessageQueueOptions {
  maxMemoryItems?: number;
}

export function createMessageQueue(options?: MessageQueueOptions): MessageQueue {
  const maxMemoryItems = options?.maxMemoryItems ?? 1000;
  const memory: StandardMessage[] = [];
  const diskPath = join(tmpdir(), `jalenclaw-queue-${randomUUID()}.jsonl`);
  let diskCount = 0;
  let totalSize = 0;

  function writeToDisk(message: StandardMessage): void {
    const line = JSON.stringify(message) + "\n";
    writeFileSync(diskPath, line, { flag: "a" });
    diskCount++;
  }

  function readAllFromDisk(): StandardMessage[] {
    if (diskCount === 0 || !existsSync(diskPath)) return [];
    const content = readFileSync(diskPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim() !== "");
    const messages = lines.map((l) => JSON.parse(l) as StandardMessage);
    // Clean up disk file
    unlinkSync(diskPath);
    diskCount = 0;
    return messages;
  }

  return {
    async enqueue(message: StandardMessage): Promise<void> {
      if (memory.length >= maxMemoryItems) {
        // Overflow oldest memory item to disk
        const oldest = memory.shift()!;
        writeToDisk(oldest);
      }
      memory.push(message);
      totalSize++;
    },

    async dequeue(): Promise<StandardMessage | null> {
      if (totalSize === 0) return null;

      // If there are items on disk, they are older — dequeue from disk first
      if (diskCount > 0) {
        const diskMessages = readAllFromDisk();
        const result = diskMessages.shift()!;
        // Put remaining disk messages back
        if (diskMessages.length > 0) {
          for (const msg of diskMessages) {
            writeToDisk(msg);
          }
        }
        totalSize--;
        return result;
      }

      // Dequeue from memory
      const msg = memory.shift() ?? null;
      if (msg) totalSize--;
      return msg;
    },

    size(): number {
      return totalSize;
    },

    async peek(): Promise<StandardMessage | null> {
      if (totalSize === 0) return null;

      // If there are items on disk, the oldest is there
      if (diskCount > 0) {
        const diskMessages = readAllFromDisk();
        const result = diskMessages[0]!;
        // Put them all back
        for (const msg of diskMessages) {
          writeToDisk(msg);
        }
        return result;
      }

      return memory[0] ?? null;
    },
  };
}
