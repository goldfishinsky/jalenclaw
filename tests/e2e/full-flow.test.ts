import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import WebSocket from "ws";
import { startApp, type AppContext } from "../../src/cli/start.js";

const TEST_CONFIG = join(import.meta.dirname, "..", "fixtures", "test-config.yml");

describe("full startup flow", { timeout: 15000 }, () => {
  let ctx: AppContext | null = null;

  afterEach(async () => {
    if (ctx) {
      await ctx.shutdown();
      ctx = null;
    }
  });

  function baseUrl(): string {
    return `http://127.0.0.1:${ctx!.gateway.port}`;
  }

  it("boot and verify /health", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });

    const res = await fetch(`${baseUrl()}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body).toEqual({ status: "ok" });
  });

  it("dashboard accessible", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });

    const res = await fetch(`${baseUrl()}/dashboard`);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("JalenClaw");
  });

  it("API status endpoint", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });

    const res = await fetch(`${baseUrl()}/api/status`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("memoryUsage");
    expect(body).toHaveProperty("channels");
    expect(body).toHaveProperty("sessions");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.memoryUsage).toBe("number");
    expect(Array.isArray(body.channels)).toBe(true);
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it("API channels endpoint", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });

    const res = await fetch(`${baseUrl()}/api/channels`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("WebSocket message round-trip", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });

    // Read the gateway API key from the environment or use the one generated at startup.
    // The gateway requires api_key query param for WS connections.
    // We need access to the internal API key. Since startApp generates a random one
    // unless JALENCLAW_API_KEY is set, we set it before starting.
    // Actually, ctx is already started above. We need to restart with a known key.
    await ctx.shutdown();
    ctx = null;

    const testApiKey = "test-e2e-key";
    process.env["JALENCLAW_API_KEY"] = testApiKey;
    try {
      ctx = await startApp({ configPath: TEST_CONFIG });

      const response = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${ctx!.gateway.port}/?api_key=${testApiKey}`,
        );

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("WebSocket response timed out"));
        }, 10000);

        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "message", content: "hello from e2e" }));
        });

        ws.on("message", (raw) => {
          const data = JSON.parse(raw.toString()) as { type: string; content: string };
          if (data.type === "response") {
            clearTimeout(timeout);
            ws.close();
            resolve(data.content);
          }
        });

        ws.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      expect(response).toContain("[stub]");
      expect(response).toContain("hello from e2e");
    } finally {
      delete process.env["JALENCLAW_API_KEY"];
    }
  });

  it("graceful shutdown", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });
    const port = ctx.gateway.port;

    await ctx.shutdown();
    ctx = null;

    // After shutdown, connection should be refused
    try {
      await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      expect.unreachable("Server should be stopped");
    } catch {
      // Expected: connection refused or timeout
    }
  });
});
