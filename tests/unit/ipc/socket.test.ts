// tests/unit/ipc/socket.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createIpcServer, connectIpc } from "../../../src/ipc/socket.js";
import type { IpcServer, IpcClient } from "../../../src/ipc/socket.js";
import type { IpcMessage } from "../../../src/ipc/protocol.js";
import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function tempSocketPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "jalenclaw-ipc-test-"));
  return join(dir, "test.sock");
}

function waitForMessage(target: IpcClient | { onMessage: IpcClient["onMessage"] }): Promise<IpcMessage> {
  return new Promise((resolve) => {
    target.onMessage((msg) => resolve(msg));
  });
}

describe("IPC Socket", () => {
  const servers: IpcServer[] = [];
  const clients: IpcClient[] = [];

  afterEach(async () => {
    for (const c of clients) c.close();
    clients.length = 0;
    for (const s of servers) await s.close();
    servers.length = 0;
  });

  it("server starts and listens on Unix socket", async () => {
    const sockPath = tempSocketPath();
    const server = await createIpcServer(sockPath);
    servers.push(server);

    expect(server.socketPath).toBe(sockPath);
    expect(existsSync(sockPath)).toBe(true);
  });

  it("client connects to server", async () => {
    const sockPath = tempSocketPath();
    const server = await createIpcServer(sockPath);
    servers.push(server);

    const connected = new Promise<void>((resolve) => {
      server.onConnection(() => resolve());
    });

    const client = await connectIpc(sockPath);
    clients.push(client);

    await connected;
  });

  it("client sends message, server receives it", async () => {
    const sockPath = tempSocketPath();
    const server = await createIpcServer(sockPath);
    servers.push(server);

    const received = new Promise<IpcMessage>((resolve) => {
      server.onConnection((remote) => {
        remote.onMessage((msg) => resolve(msg));
      });
    });

    const client = await connectIpc(sockPath);
    clients.push(client);
    client.send({ type: "hello", service: "test", pid: process.pid });

    const msg = await received;
    expect(msg.type).toBe("hello");
    expect(msg.service).toBe("test");
    expect(msg.pid).toBe(process.pid);
  });

  it("server sends message, client receives it", async () => {
    const sockPath = tempSocketPath();
    const server = await createIpcServer(sockPath);
    servers.push(server);

    server.onConnection((remote) => {
      remote.send({ type: "ack" });
    });

    const client = await connectIpc(sockPath);
    clients.push(client);

    const msg = await waitForMessage(client);
    expect(msg.type).toBe("ack");
  });

  it("handshake: client sends hello, server acks", async () => {
    const sockPath = tempSocketPath();
    const server = await createIpcServer(sockPath);
    servers.push(server);

    server.onConnection((remote) => {
      remote.onMessage((msg) => {
        if (msg.type === "hello") {
          remote.send({ type: "ack" });
        }
      });
    });

    const client = await connectIpc(sockPath);
    clients.push(client);

    const ackPromise = waitForMessage(client);
    client.send({ type: "hello", service: "channel:whatsapp", pid: process.pid });

    const ack = await ackPromise;
    expect(ack.type).toBe("ack");
  });

  it("multiple clients can connect", async () => {
    const sockPath = tempSocketPath();
    const server = await createIpcServer(sockPath);
    servers.push(server);

    let connectionCount = 0;
    server.onConnection(() => {
      connectionCount++;
    });

    const client1 = await connectIpc(sockPath);
    const client2 = await connectIpc(sockPath);
    clients.push(client1, client2);

    // Small delay to let connection handlers fire
    await new Promise((r) => setTimeout(r, 50));
    expect(connectionCount).toBe(2);
  });

  it("cleanup: socket file is removed on server close", async () => {
    const sockPath = tempSocketPath();
    const server = await createIpcServer(sockPath);
    expect(existsSync(sockPath)).toBe(true);

    await server.close();
    expect(existsSync(sockPath)).toBe(false);
  });
});
