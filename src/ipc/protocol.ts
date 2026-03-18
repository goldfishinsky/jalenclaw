// src/ipc/protocol.ts
import { Transform, type TransformCallback } from "node:stream";

export interface IpcMessage {
  type: string;
  id?: string;
  [key: string]: unknown;
}

/**
 * Encode an IPC message as a JSON Lines buffer (JSON + newline).
 */
export function encode(message: IpcMessage): Buffer {
  return Buffer.from(JSON.stringify(message) + "\n", "utf-8");
}

/**
 * Create a Transform stream that splits incoming data on newline boundaries
 * and parses each line as JSON, emitting IpcMessage objects.
 */
export function createDecoder(): Transform {
  let buffer = "";

  return new Transform({
    readableObjectMode: true,
    writableObjectMode: false,

    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) segment in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") continue;

        try {
          const parsed: unknown = JSON.parse(trimmed);
          this.push(parsed as IpcMessage);
        } catch {
          callback(new Error(`Invalid JSON in IPC message: ${trimmed}`));
          return;
        }
      }

      callback();
    },

    flush(callback: TransformCallback) {
      // Handle any remaining data in the buffer
      const trimmed = buffer.trim();
      if (trimmed !== "") {
        try {
          const parsed: unknown = JSON.parse(trimmed);
          this.push(parsed as IpcMessage);
        } catch {
          callback(new Error(`Invalid JSON in IPC message: ${trimmed}`));
          return;
        }
      }
      callback();
    },
  });
}
