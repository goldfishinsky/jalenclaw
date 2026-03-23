// tests/unit/gateway/web-api.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { createDashboardApi, type DashboardApi } from "../../../src/gateway/web/api.js";
import { serveDashboard } from "../../../src/gateway/web/index.js";

function startTestServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{
  server: Server;
  port: number;
}> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url);
  const body = await res.json();
  return { status: res.status, body };
}

async function getText(url: string): Promise<{ status: number; body: string; contentType: string }> {
  const res = await fetch(url);
  return {
    status: res.status,
    body: await res.text(),
    contentType: res.headers.get("content-type") ?? "",
  };
}

async function postJson(
  url: string,
  data: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe("Dashboard API", () => {
  let server: Server | undefined;
  let api: DashboardApi;
  let port: number;

  afterEach(async () => {
    if (server) {
      await stopServer(server);
      server = undefined;
    }
  });

  async function setup(): Promise<void> {
    api = createDashboardApi();
    const result = await startTestServer((req, res) => {
      if (serveDashboard(req, res, "test-key")) return;
      if (api.handleRequest(req, res)) return;
      res.statusCode = 404;
      res.end("Not Found");
    });
    server = result.server;
    port = result.port;
  }

  it("GET /api/status returns valid JSON with expected fields", async () => {
    await setup();
    const { status, body } = await getJson(`http://127.0.0.1:${port}/api/status`);
    expect(status).toBe(200);

    const data = body as Record<string, unknown>;
    expect(data).toHaveProperty("uptime");
    expect(data).toHaveProperty("memoryUsage");
    expect(data).toHaveProperty("channels");
    expect(data).toHaveProperty("sessions");
    expect(data).toHaveProperty("llmUsage");
    expect(typeof data.uptime).toBe("number");
    expect(typeof data.memoryUsage).toBe("number");
    expect(Array.isArray(data.channels)).toBe(true);
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  it("GET /api/channels returns an array", async () => {
    await setup();
    api.updateChannelStatus("telegram", "connected");
    api.updateChannelStatus("whatsapp", "disconnected");

    const { status, body } = await getJson(`http://127.0.0.1:${port}/api/channels`);
    expect(status).toBe(200);

    const channels = body as Array<Record<string, unknown>>;
    expect(Array.isArray(channels)).toBe(true);
    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({ name: "telegram", status: "connected", messageCount: 0 });
    expect(channels[1]).toMatchObject({ name: "whatsapp", status: "disconnected", messageCount: 0 });
  });

  it("recordMessage increments channel message counts", async () => {
    await setup();
    api.updateChannelStatus("telegram", "connected");
    api.recordMessage("inbound", "telegram", "hello");
    api.recordMessage("inbound", "telegram", "world");
    api.recordMessage("outbound", "telegram", "reply");

    const { body } = await getJson(`http://127.0.0.1:${port}/api/channels`);
    const channels = body as Array<{ name: string; messageCount: number }>;
    const tg = channels.find((c) => c.name === "telegram");
    expect(tg).toBeDefined();
    expect(tg!.messageCount).toBe(3);
  });

  it("recordLLMUsage tracks tokens and requests per provider", async () => {
    await setup();
    api.recordLLMUsage("openai", 500);
    api.recordLLMUsage("openai", 300);
    api.recordLLMUsage("anthropic", 1200);

    const { body } = await getJson(`http://127.0.0.1:${port}/api/metrics`);
    const data = body as { llmUsage: Record<string, { tokens: number; requests: number }> };

    expect(data.llmUsage.openai.tokens).toBe(800);
    expect(data.llmUsage.openai.requests).toBe(2);
    expect(data.llmUsage.anthropic.tokens).toBe(1200);
    expect(data.llmUsage.anthropic.requests).toBe(1);
  });

  it("GET /dashboard returns HTML content", async () => {
    await setup();
    const { status, body, contentType } = await getText(`http://127.0.0.1:${port}/dashboard`);
    expect(status).toBe(200);
    expect(contentType).toContain("text/html");
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("JalenClaw");
  });

  it("GET /api/messages/recent returns recorded messages", async () => {
    await setup();
    api.updateChannelStatus("telegram", "connected");
    api.recordMessage("inbound", "telegram", "hello there");
    api.recordMessage("outbound", "telegram", "hi back");

    const { status, body } = await getJson(`http://127.0.0.1:${port}/api/messages/recent`);
    expect(status).toBe(200);

    const messages = body as Array<{ direction: string; channel: string; preview: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ direction: "inbound", channel: "telegram", preview: "hello there" });
    expect(messages[1]).toMatchObject({ direction: "outbound", channel: "telegram", preview: "hi back" });
  });

  it("GET /api/sessions returns active sessions", async () => {
    await setup();
    api.updateSession("group-123");
    api.updateSession("group-123");
    api.updateSession("group-456");

    const { status, body } = await getJson(`http://127.0.0.1:${port}/api/sessions`);
    expect(status).toBe(200);

    const sessions = body as Array<{ groupId: string; messageCount: number }>;
    expect(sessions).toHaveLength(2);

    const g1 = sessions.find((s) => s.groupId === "group-123");
    expect(g1).toBeDefined();
    expect(g1!.messageCount).toBe(2);
  });

  it("handleRequest returns false for unknown routes", async () => {
    api = createDashboardApi();
    const result = await startTestServer((req, res) => {
      const handled = api.handleRequest(req, res);
      if (!handled) {
        res.statusCode = 404;
        res.end("Not Found");
      }
    });
    server = result.server;
    port = result.port;

    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
  });

  it("recent messages are capped at 50", async () => {
    await setup();
    api.updateChannelStatus("test", "connected");

    for (let i = 0; i < 60; i++) {
      api.recordMessage("inbound", "test", `msg-${i}`);
    }

    const { body } = await getJson(`http://127.0.0.1:${port}/api/messages/recent`);
    const messages = body as unknown[];
    expect(messages).toHaveLength(50);
  });

  it("updateChannelStatus updates existing channel status", async () => {
    await setup();
    api.updateChannelStatus("telegram", "connecting");
    api.updateChannelStatus("telegram", "connected");

    const { body } = await getJson(`http://127.0.0.1:${port}/api/channels`);
    const channels = body as Array<{ name: string; status: string }>;
    expect(channels).toHaveLength(1);
    expect(channels[0].status).toBe("connected");
  });

  it("GET /api/config returns sanitized config", async () => {
    await setup();
    api.setConfig({
      gateway: { host: "127.0.0.1", port: 18900 },
      models: { default: "claude", providers: ["claude"] },
      channels: { telegram: { enabled: true } },
      memory: { backend: "auto" },
    });

    const { status, body } = await getJson(`http://127.0.0.1:${port}/api/config`);
    expect(status).toBe(200);

    const data = body as Record<string, unknown>;
    expect(data).toHaveProperty("gateway");
    expect(data).toHaveProperty("models");
    expect(data).toHaveProperty("channels");
    expect(data).toHaveProperty("memory");
    expect((data.gateway as Record<string, unknown>).host).toBe("127.0.0.1");
  });

  it("setConfig stores config", async () => {
    await setup();
    api.setConfig({ foo: "bar" });

    const { body: first } = await getJson(`http://127.0.0.1:${port}/api/config`);
    expect((first as Record<string, unknown>).foo).toBe("bar");

    api.setConfig({ baz: 42 });
    const { body: second } = await getJson(`http://127.0.0.1:${port}/api/config`);
    expect((second as Record<string, unknown>).baz).toBe(42);
    expect((second as Record<string, unknown>).foo).toBeUndefined();
  });

  it("GET /api/sessions/:groupId returns session messages", async () => {
    await setup();
    api.addSessionMessage("webchat-123", "user", "hello");
    api.addSessionMessage("webchat-123", "assistant", "hi there");

    const { status, body } = await getJson(`http://127.0.0.1:${port}/api/sessions/webchat-123`);
    expect(status).toBe(200);

    const data = body as { groupId: string; messages: Array<{ role: string; content: string }> };
    expect(data.groupId).toBe("webchat-123");
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0]).toMatchObject({ role: "user", content: "hello" });
    expect(data.messages[1]).toMatchObject({ role: "assistant", content: "hi there" });
  });

  it("GET /api/sessions/:groupId returns empty messages for unknown group", async () => {
    await setup();
    const { status, body } = await getJson(`http://127.0.0.1:${port}/api/sessions/unknown-group`);
    expect(status).toBe(200);

    const data = body as { groupId: string; messages: unknown[] };
    expect(data.groupId).toBe("unknown-group");
    expect(data.messages).toHaveLength(0);
  });

  it("addSessionMessage stores messages per group", async () => {
    await setup();
    api.addSessionMessage("group-a", "user", "msg1");
    api.addSessionMessage("group-b", "user", "msg2");
    api.addSessionMessage("group-a", "assistant", "reply1");

    const { body: bodyA } = await getJson(`http://127.0.0.1:${port}/api/sessions/group-a`);
    const dataA = bodyA as { messages: unknown[] };
    expect(dataA.messages).toHaveLength(2);

    const { body: bodyB } = await getJson(`http://127.0.0.1:${port}/api/sessions/group-b`);
    const dataB = bodyB as { messages: unknown[] };
    expect(dataB.messages).toHaveLength(1);
  });

  it("GET /api/health returns detailed health", async () => {
    await setup();
    api.setConfig({ memory: { backend: "sqlite" } });
    api.updateChannelStatus("telegram", "connected");
    api.recordLLMUsage("claude", 100);

    const { status, body } = await getJson(`http://127.0.0.1:${port}/api/health`);
    expect(status).toBe(200);

    const data = body as {
      status: string;
      uptime: number;
      providers: Record<string, string>;
      channels: Record<string, string>;
      memory: string;
    };
    expect(data.status).toBe("ok");
    expect(typeof data.uptime).toBe("number");
    expect(data.providers.claude).toBe("connected");
    expect(data.channels.telegram).toBe("connected");
    expect(data.memory).toBe("sqlite");
  });

  it("POST /api/messages/send invokes onSendMessage callback", async () => {
    await setup();
    api.onSendMessage = async (content: string, groupId: string) => {
      return `Echo: ${content} (${groupId})`;
    };

    const { status, body } = await postJson(`http://127.0.0.1:${port}/api/messages/send`, {
      content: "hello",
      groupId: "test-123",
    });
    expect(status).toBe(200);

    const data = body as { response: string; groupId: string };
    expect(data.response).toBe("Echo: hello (test-123)");
    expect(data.groupId).toBe("test-123");
  });

  it("POST /api/messages/send returns 503 without handler", async () => {
    await setup();

    const { status, body } = await postJson(`http://127.0.0.1:${port}/api/messages/send`, {
      content: "hello",
      groupId: "test-123",
    });
    expect(status).toBe(503);
    expect((body as Record<string, unknown>).error).toBe("No message handler configured");
  });

  it("updateSession accepts optional messageCount", async () => {
    await setup();
    api.updateSession("group-x", 10);

    const { body } = await getJson(`http://127.0.0.1:${port}/api/sessions`);
    const sessions = body as Array<{ groupId: string; messageCount: number }>;
    const g = sessions.find((s) => s.groupId === "group-x");
    expect(g).toBeDefined();
    expect(g!.messageCount).toBe(10);
  });
});
