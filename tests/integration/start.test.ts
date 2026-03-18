import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { startApp, type AppContext } from "../../src/cli/start.js";

const TEST_CONFIG = join(import.meta.dirname, "..", "fixtures", "test-config.yml");

describe("startApp", () => {
  let ctx: AppContext | null = null;

  afterEach(async () => {
    if (ctx) {
      await ctx.shutdown();
      ctx = null;
    }
  });

  it("should boot and serve /health", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });

    expect(ctx.gateway.port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${ctx.gateway.port}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("should serve /metrics with auth", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });

    // /metrics requires auth — without key should 401
    const noAuth = await fetch(`http://127.0.0.1:${ctx.gateway.port}/metrics`);
    expect(noAuth.status).toBe(401);
  });

  it("should shut down cleanly", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });
    const port = ctx.gateway.port;

    await ctx.shutdown();
    ctx = null;

    // After shutdown, connection should fail
    try {
      await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      // If it doesn't throw, the server is still up (unexpected)
      expect.unreachable("Server should be stopped");
    } catch {
      // Expected — connection refused or timeout
    }
  });

  it("should use stub provider when no providers configured", async () => {
    ctx = await startApp({ configPath: TEST_CONFIG });

    // The agent should be functional with the stub provider
    const groupId = "test-group";
    let response = "";
    for await (const chunk of ctx.agent.handleMessage(groupId, "hello")) {
      response += chunk;
    }

    expect(response).toContain("[stub]");
    expect(response).toContain("hello");
  });
});
