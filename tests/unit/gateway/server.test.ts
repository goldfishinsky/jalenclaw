// tests/unit/gateway/server.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createGateway, type Gateway } from "../../../src/gateway/server.js";
import WebSocket from "ws";

const API_KEY = "test-server-api-key";

async function getJson(url: string, headers: Record<string, string> = {}): Promise<{
  status: number;
  body: string;
}> {
  const res = await fetch(url, { headers });
  return { status: res.status, body: await res.text() };
}

describe("Gateway server", () => {
  let gw: Gateway | undefined;

  afterEach(async () => {
    if (gw) {
      await gw.stop();
      gw = undefined;
    }
  });

  it("starts and responds to /health", async () => {
    gw = createGateway({ apiKey: API_KEY, port: 0 });
    await gw.start();

    const { status, body } = await getJson(`http://127.0.0.1:${gw.port}/health`);
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({ status: "ok" });
  });

  it("returns 401 without API key on protected routes", async () => {
    gw = createGateway({ apiKey: API_KEY, port: 0 });
    await gw.start();

    const { status } = await getJson(`http://127.0.0.1:${gw.port}/metrics`);
    expect(status).toBe(401);
  });

  it("returns 200 for /metrics with valid API key", async () => {
    gw = createGateway({ apiKey: API_KEY, port: 0 });
    await gw.start();

    const { status } = await getJson(`http://127.0.0.1:${gw.port}/metrics`, {
      "X-Api-Key": API_KEY,
    });
    expect(status).toBe(200);
  });

  it("handles WebSocket connections with valid auth and origin", async () => {
    gw = createGateway({
      apiKey: API_KEY,
      port: 0,
      allowedOrigins: ["http://localhost:3000"],
    });
    await gw.start();

    const received: unknown[] = [];
    gw.onMessage((_ws, data) => received.push(data));

    const ws = new WebSocket(
      `ws://127.0.0.1:${gw.port}?api_key=${API_KEY}`,
      { origin: "http://localhost:3000" },
    );

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    ws.send(JSON.stringify({ type: "ping" }));

    // Wait for the message handler to fire
    await new Promise((r) => setTimeout(r, 50));
    ws.close();

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: "ping" });
  });

  it("rejects WebSocket with invalid Origin header", async () => {
    gw = createGateway({
      apiKey: API_KEY,
      port: 0,
      allowedOrigins: ["http://localhost:3000"],
    });
    await gw.start();

    const ws = new WebSocket(
      `ws://127.0.0.1:${gw.port}?api_key=${API_KEY}`,
      { origin: "http://evil.com" },
    );

    const error = await new Promise<Event | Error>((resolve) => {
      ws.on("error", resolve);
      ws.on("unexpected-response", (_req, res) => {
        resolve(new Error(`Unexpected status: ${res.statusCode}`));
      });
    });

    expect(error).toBeInstanceOf(Error);
  });

  it("gracefully shuts down via stop()", async () => {
    gw = createGateway({ apiKey: API_KEY, port: 0 });
    await gw.start();
    const port = gw.port;
    expect(port).toBeGreaterThan(0);

    await gw.stop();
    gw = undefined;

    // After stop, the server should no longer accept connections
    await expect(
      getJson(`http://127.0.0.1:${port}/health`),
    ).rejects.toThrow();
  });
});
