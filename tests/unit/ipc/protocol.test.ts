// tests/unit/ipc/protocol.test.ts
import { describe, it, expect } from "vitest";
import { encode, createDecoder, type IpcMessage } from "../../../src/ipc/protocol.js";
import { PassThrough } from "node:stream";

function collectMessages(decoder: ReturnType<typeof createDecoder>): Promise<IpcMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: IpcMessage[] = [];
    decoder.on("data", (msg: IpcMessage) => messages.push(msg));
    decoder.on("end", () => resolve(messages));
    decoder.on("error", reject);
  });
}

describe("encode", () => {
  it("produces JSON + newline Buffer", () => {
    const msg: IpcMessage = { type: "ack", id: "123" };
    const buf = encode(msg);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("utf-8")).toBe('{"type":"ack","id":"123"}\n');
  });

  it("handles special characters", () => {
    const msg: IpcMessage = { type: "message", payload: "hello\nworld\t\"quoted\"" };
    const buf = encode(msg);
    const str = buf.toString("utf-8");
    // Must be a single line terminated by \n
    const lines = str.split("\n");
    expect(lines).toHaveLength(2); // content + empty after trailing \n
    expect(lines[1]).toBe("");
    // Round-trip: parsing it back should recover the payload
    const parsed = JSON.parse(lines[0]) as IpcMessage;
    expect(parsed.payload).toBe("hello\nworld\t\"quoted\"");
  });
});

describe("createDecoder", () => {
  it("splits multiple messages on newline boundary", async () => {
    const decoder = createDecoder();
    const input = new PassThrough();
    input.pipe(decoder);

    const collecting = collectMessages(decoder);
    input.end('{"type":"a"}\n{"type":"b"}\n{"type":"c"}\n');
    const messages = await collecting;

    expect(messages).toHaveLength(3);
    expect(messages[0]!.type).toBe("a");
    expect(messages[1]!.type).toBe("b");
    expect(messages[2]!.type).toBe("c");
  });

  it("handles partial messages (buffering)", async () => {
    const decoder = createDecoder();
    const input = new PassThrough();
    input.pipe(decoder);

    const collecting = collectMessages(decoder);

    // Send a message in two chunks
    input.write('{"type":"hel');
    input.write('lo"}\n');
    input.end();

    const messages = await collecting;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe("hello");
  });

  it("handles empty lines gracefully", async () => {
    const decoder = createDecoder();
    const input = new PassThrough();
    input.pipe(decoder);

    const collecting = collectMessages(decoder);
    input.end('{"type":"a"}\n\n\n{"type":"b"}\n');
    const messages = await collecting;

    expect(messages).toHaveLength(2);
    expect(messages[0]!.type).toBe("a");
    expect(messages[1]!.type).toBe("b");
  });

  it("rejects invalid JSON", async () => {
    const decoder = createDecoder();
    const input = new PassThrough();
    input.pipe(decoder);

    const errors: Error[] = [];
    decoder.on("error", (err: Error) => errors.push(err));

    await new Promise<void>((resolve) => {
      input.write("not valid json\n");
      // Give it a tick to process
      setTimeout(resolve, 50);
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/invalid/i);
  });
});
