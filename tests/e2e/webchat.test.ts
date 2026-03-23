import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import WebSocket from "ws";
import { startApp, type AppContext } from "../../src/cli/start.js";

const TEST_CONFIG = join(import.meta.dirname, "..", "fixtures", "test-config.yml");
const API_KEY = "e2e-test-key";

async function sendAndReceive(ws: WebSocket, content: string, groupId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WS timeout")), 5000);
    ws.once("message", (data) => {
      clearTimeout(timeout);
      const msg = JSON.parse(data.toString());
      resolve(msg.content);
    });
    ws.send(JSON.stringify({ type: "message", content, groupId }));
  });
}

function connectWs(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?api_key=${API_KEY}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

describe("webchat e2e", { timeout: 15000 }, () => {
  let ctx: AppContext | null = null;

  afterEach(async () => {
    delete process.env["JALENCLAW_API_KEY"];
    if (ctx) {
      await ctx.shutdown();
      ctx = null;
    }
  });

  function baseUrl(): string {
    return `http://127.0.0.1:${ctx!.gateway.port}`;
  }

  it("multi-turn conversation — 3 messages in same groupId", async () => {
    process.env["JALENCLAW_API_KEY"] = API_KEY;
    ctx = await startApp({ configPath: TEST_CONFIG });

    const groupId = "multi-turn-group";

    // Use a fresh WS connection per message to avoid stale response buffering,
    // while keeping the same groupId to exercise multi-turn session state.
    const ws1 = await connectWs(ctx.gateway.port);
    const r1 = await sendAndReceive(ws1, "hello", groupId);
    ws1.close();
    expect(r1).toContain("[stub]");
    expect(r1).toContain("hello");

    const ws2 = await connectWs(ctx.gateway.port);
    const r2 = await sendAndReceive(ws2, "how are you", groupId);
    ws2.close();
    expect(r2).toContain("[stub]");
    expect(r2).toContain("how are you");

    const ws3 = await connectWs(ctx.gateway.port);
    const r3 = await sendAndReceive(ws3, "goodbye", groupId);
    ws3.close();
    expect(r3).toContain("[stub]");
    expect(r3).toContain("goodbye");
  });

  it("concurrent sessions — two groupIds don't cross", async () => {
    process.env["JALENCLAW_API_KEY"] = API_KEY;
    ctx = await startApp({ configPath: TEST_CONFIG });

    const ws1 = await connectWs(ctx.gateway.port);
    const ws2 = await connectWs(ctx.gateway.port);

    try {
      const groupA = "session-a";
      const groupB = "session-b";

      // Send both concurrently
      const [responseA, responseB] = await Promise.all([
        sendAndReceive(ws1, "message from A", groupA),
        sendAndReceive(ws2, "message from B", groupB),
      ]);

      // Each response should echo its own message, not the other's
      expect(responseA).toContain("message from A");
      expect(responseA).not.toContain("message from B");

      expect(responseB).toContain("message from B");
      expect(responseB).not.toContain("message from A");
    } finally {
      ws1.close();
      ws2.close();
    }
  });

  it("API status reflects sessions", async () => {
    process.env["JALENCLAW_API_KEY"] = API_KEY;
    ctx = await startApp({ configPath: TEST_CONFIG });

    const ws = await connectWs(ctx.gateway.port);
    try {
      await sendAndReceive(ws, "ping", "status-test-group");
    } finally {
      ws.close();
    }

    const res = await fetch(`${baseUrl()}/api/status`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("memoryUsage");
    expect(body).toHaveProperty("channels");
    expect(body).toHaveProperty("sessions");
    expect(typeof body.uptime).toBe("number");
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it("API messages/recent reflects activity", async () => {
    process.env["JALENCLAW_API_KEY"] = API_KEY;
    ctx = await startApp({ configPath: TEST_CONFIG });

    const ws = await connectWs(ctx.gateway.port);
    try {
      await sendAndReceive(ws, "test message", "messages-test-group");
    } finally {
      ws.close();
    }

    const res = await fetch(`${baseUrl()}/api/messages/recent`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
