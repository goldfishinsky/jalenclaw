// src/ipc/socket.ts
import * as net from "node:net";
import { unlinkSync, existsSync } from "node:fs";
import { encode, createDecoder, type IpcMessage } from "./protocol.js";

export interface IpcClient {
  send(message: IpcMessage): void;
  onMessage(handler: (message: IpcMessage) => void): void;
  close(): void;
}

export interface IpcServer {
  readonly socketPath: string;
  onConnection(handler: (client: IpcClient) => void): void;
  close(): Promise<void>;
}

function wrapSocket(socket: net.Socket): IpcClient {
  const decoder = createDecoder();
  socket.pipe(decoder);

  return {
    send(message: IpcMessage): void {
      socket.write(encode(message));
    },

    onMessage(handler: (message: IpcMessage) => void): void {
      decoder.on("data", handler);
    },

    close(): void {
      socket.destroy();
    },
  };
}

/**
 * Create an IPC server listening on a Unix Domain Socket.
 */
export async function createIpcServer(socketPath: string): Promise<IpcServer> {
  // Remove stale socket file if it exists
  if (existsSync(socketPath)) {
    unlinkSync(socketPath);
  }

  const server = net.createServer();
  const connectionHandlers: ((client: IpcClient) => void)[] = [];

  server.on("connection", (socket: net.Socket) => {
    const client = wrapSocket(socket);
    for (const handler of connectionHandlers) {
      handler(client);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(socketPath, () => resolve());
  });

  return {
    get socketPath() {
      return socketPath;
    },

    onConnection(handler: (client: IpcClient) => void): void {
      connectionHandlers.push(handler);
    },

    async close(): Promise<void> {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      if (existsSync(socketPath)) {
        unlinkSync(socketPath);
      }
    },
  };
}

/**
 * Connect to an IPC server via Unix Domain Socket.
 */
export async function connectIpc(socketPath: string): Promise<IpcClient> {
  const socket = new net.Socket();

  await new Promise<void>((resolve, reject) => {
    socket.on("error", reject);
    socket.connect(socketPath, () => resolve());
  });

  return wrapSocket(socket);
}
