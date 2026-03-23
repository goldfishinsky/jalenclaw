// src/cli/start.ts
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { JalenClawConfig } from "../config/schema.js";
import { loadConfig } from "../config/loader.js";
import { createLogger, type Logger } from "../observability/logger.js";
import { createMetricsRegistry, type MetricsRegistry } from "../observability/metrics.js";
import { createGateway, type Gateway } from "../gateway/server.js";
import { createDashboardApi } from "../gateway/web/api.js";
import { serveDashboard } from "../gateway/web/index.js";
import { createAgentRunner, type AgentRunner } from "../agent/runner.js";
import { createRouter, type Router } from "../router/router.js";
import { createMessageQueue } from "../router/queue.js";
import type { StandardMessage } from "../router/queue.js";
import { createMemoryManager, type MemoryManager } from "../memory/manager.js";
import { createSqliteAdapter } from "../memory/sqlite.js";
import { createProcessManager, type ProcessManager } from "../process/manager.js";
import { createHealthChecker, type HealthChecker } from "../process/health.js";
import type { LLMProvider } from "../models/interface.js";
import { ClaudeProvider } from "../models/claude.js";
import { OpenAIProvider } from "../models/openai.js";
import { DeepSeekProvider } from "../models/deepseek.js";
import { OllamaProvider } from "../models/ollama.js";
import { ApiKeyStrategy } from "../auth/apikey.js";
import { BearerTokenStrategy } from "../auth/bearer.js";
import { readTokens } from "../auth/token-store.js";
import type { AuthStrategy } from "../auth/strategy.js";
import { homedir } from "node:os";

export interface AppContext {
  config: JalenClawConfig;
  gateway: Gateway;
  logger: Logger;
  metrics: MetricsRegistry;
  agent: AgentRunner;
  router: Router;
  memory: MemoryManager;
  processManager: ProcessManager;
  healthChecker: HealthChecker;
  gatewayApiKey: string;
  shutdown(): Promise<void>;
}

export interface StartOptions {
  daemon?: boolean;
  configPath?: string;
}

/**
 * Print a user-friendly startup banner to the console.
 */
export function printBanner(ctx: AppContext): void {
  const { config, gateway, gatewayApiKey: apiKey } = ctx;
  const host = config.gateway.host;
  const port = gateway.port;

  // Determine provider info
  const providerNames = Object.keys(config.models.providers).filter(
    (k) => config.models.providers[k as keyof typeof config.models.providers],
  );
  const defaultProvider = config.models.default;
  const claudeConfig = config.models.providers.claude;
  const authLabel =
    claudeConfig && "authType" in claudeConfig ? claudeConfig.authType : "";
  const providerDisplay = authLabel
    ? `${defaultProvider} (${authLabel})`
    : providerNames[0] ?? "stub";

  // Determine enabled channels
  const enabledChannels = Object.entries(config.channels)
    .filter(([, ch]) => ch.enabled)
    .map(([name]) => name);
  const channelsDisplay =
    enabledChannels.length > 0 ? enabledChannels.join(", ") : "none";

  // Memory backend
  const memoryDisplay = config.memory.backend;

  // API key display
  const apiKeyDisplay = apiKey
    ? `${apiKey.slice(0, 8)}...${process.env["JALENCLAW_API_KEY"] ? "" : " (set JALENCLAW_API_KEY to customize)"}`
    : "not set";

  const banner = `
  \x1b[1m\x1b[35m🐾 JalenClaw v0.1.0\x1b[0m

  Dashboard:  http://${host}:${port}/dashboard
  Health:     http://${host}:${port}/health
  WebSocket:  ws://${host}:${port}

  API Key:    ${apiKeyDisplay}
  Provider:   ${providerDisplay}
  Channels:   ${channelsDisplay}
  Memory:     ${memoryDisplay}

  Press Ctrl+C to stop
`;

  console.log(banner);
}

/**
 * Build the default LLM provider based on config.
 * Falls back to a stub provider if no providers are configured (useful for testing).
 */
async function buildProviders(config: JalenClawConfig, logger: Logger): Promise<Map<string, LLMProvider>> {
  const providers = new Map<string, LLMProvider>();
  const providerConfigs = config.models.providers;

  if (providerConfigs.claude) {
    const claudeConfig = providerConfigs.claude;
    let authStrategy: AuthStrategy;

    if (claudeConfig.authType === "apikey") {
      authStrategy = new ApiKeyStrategy(claudeConfig.apiKey);
    } else {
      // OAuth: read token from JalenClaw's token store (imported from Claude Code CLI)
      const tokenPath = join(homedir(), ".jalenclaw", "auth", "oauth-credentials.json");
      const tokens = await readTokens(tokenPath);
      if (tokens) {
        // Use BearerTokenStrategy directly with the access token instead of
        // OAuthStrategy, since the Claude Code OAuth flow doesn't expose a
        // refresh endpoint we can call ourselves.
        authStrategy = new BearerTokenStrategy(tokens.accessToken);
        logger.info("claude-oauth-loaded", {
          tokenPath,
          expiresAt: new Date(tokens.expiresAt).toISOString(),
        });
      } else {
        logger.warn("claude-oauth-not-configured", {
          message: "OAuth configured but no token found. Run 'jalenclaw auth login' first.",
        });
        return providers;
      }
    }

    providers.set("claude", new ClaudeProvider(authStrategy, {
      model: claudeConfig.model,
      timeout: claudeConfig.timeout,
      baseUrl: claudeConfig.baseUrl,
    }));
  }

  if (providerConfigs.openai) {
    providers.set("openai", new OpenAIProvider({
      apiKey: providerConfigs.openai.apiKey,
    }));
  }

  if (providerConfigs.deepseek) {
    providers.set("deepseek", new DeepSeekProvider({
      apiKey: providerConfigs.deepseek.apiKey,
    }));
  }

  if (providerConfigs.ollama) {
    providers.set("ollama", new OllamaProvider({
      baseUrl: providerConfigs.ollama.baseUrl,
    }));
  }

  return providers;
}

/**
 * Create a stub LLM provider for when no real providers are configured.
 * Returns a simple echo response so the system can still boot and handle messages.
 */
function createStubProvider(): LLMProvider {
  return {
    name: "stub",
    async *chat(messages) {
      const last = messages[messages.length - 1];
      yield { type: "text", content: `[stub] Echo: ${last?.content ?? ""}` };
    },
    countTokens(text) {
      return Math.ceil(text.length / 4);
    },
  };
}

/**
 * Create a channel adapter based on channel name and config.
 */
async function createChannelAdapter(
  channelName: string,
  channelConfig: Record<string, unknown>,
  logger: Logger,
): Promise<import("../channels/interface.js").ChannelAdapter | null> {
  const token = channelConfig.token as string | undefined;

  switch (channelName) {
    case "telegram": {
      if (!token) {
        logger.error("channel-missing-token", { channel: "telegram" });
        return null;
      }
      const { TelegramAdapter } = await import("../channels/telegram/adapter.js");
      return new TelegramAdapter(token);
    }
    case "whatsapp": {
      const { WhatsAppAdapter } = await import("../channels/whatsapp/adapter.js");
      return new WhatsAppAdapter({});
    }
    case "slack": {
      const slackToken = token;
      const appToken = channelConfig.appToken as string | undefined;
      const signingSecret = channelConfig.signingSecret as string | undefined;
      if (!slackToken || !appToken || !signingSecret) {
        logger.error("channel-missing-config", { channel: "slack", required: "token, appToken, signingSecret" });
        return null;
      }
      const { SlackAdapter } = await import("../channels/slack/adapter.js");
      return new SlackAdapter({ token: slackToken, appToken, signingSecret });
    }
    case "discord": {
      if (!token) {
        logger.error("channel-missing-token", { channel: "discord" });
        return null;
      }
      const { DiscordAdapter } = await import("../channels/discord/adapter.js");
      return new DiscordAdapter({ token });
    }
    default:
      return null;
  }
}

/**
 * Boot the full JalenClaw application.
 */
export async function startApp(options?: StartOptions): Promise<AppContext> {
  // 1. Load config
  const config = await loadConfig({ configPath: options?.configPath });

  // 2. Create logger
  const logger = createLogger({ service: "core", level: "info" });

  // 3. Create metrics registry
  const metrics = createMetricsRegistry();
  const messagesReceived = metrics.counter("jalenclaw_messages_received_total", "Total inbound messages");
  const messagesSent = metrics.counter("jalenclaw_messages_sent_total", "Total outbound messages");
  const messageLatency = metrics.histogram("jalenclaw_message_latency_ms", "Message processing latency in ms");

  // 4. Build LLM providers
  const providers = await buildProviders(config, logger);
  const defaultName = config.models.default;
  const defaultProvider = providers.get(defaultName) ?? providers.values().next().value ?? createStubProvider();

  logger.info("providers-loaded", { count: providers.size, default: defaultProvider.name });

  // 5. Create SQLite memory manager
  const dbPath = join(tmpdir(), `jalenclaw-memory-${randomUUID()}.db`);
  const storage = createSqliteAdapter(dbPath);
  const memory = createMemoryManager({ storage });

  // 6. Create agent runner
  const agent = createAgentRunner({
    provider: defaultProvider,
    memory,
    idleTimeoutMs: (config.agent.idleTimeout ?? 300) * 1000,
  });

  // 7. Create message router + queue
  const queue = createMessageQueue();
  const router = createRouter(queue);

  // 8. Create process manager + health checker
  const processManager = createProcessManager();
  const healthChecker = createHealthChecker();

  // 9. Wire inbound handler: router -> agent -> outbound
  router.onInbound(async (message: StandardMessage) => {
    messagesReceived.inc(1, { channel: message.channelType });
    const startTime = Date.now();

    const groupId = message.groupId ?? message.senderId;
    const content = message.content.text ?? "";

    let fullResponse = "";
    for await (const chunk of agent.handleMessage(groupId, content)) {
      fullResponse += chunk;
    }

    messageLatency.observe(Date.now() - startTime);

    if (fullResponse.length > 0) {
      const outbound: StandardMessage = {
        id: randomUUID(),
        channelType: message.channelType,
        channelMessageId: "",
        senderId: "jalenclaw",
        groupId: message.groupId,
        content: { type: "text", text: fullResponse },
        timestamp: Date.now(),
        direction: "outbound",
      };

      messagesSent.inc(1, { channel: message.channelType });
      await router.routeOutbound(outbound);
    }
  });

  // 10. Generate a gateway API key (for internal use; real deployments override via config)
  const gatewayApiKey = process.env["JALENCLAW_API_KEY"] ?? randomUUID();

  // 10b. Create dashboard API
  const dashboardApi = createDashboardApi();

  // 11. Create and start gateway with dashboard
  const gateway = createGateway({
    host: config.gateway.host,
    port: config.gateway.port,
    apiKey: gatewayApiKey,
    rateLimit: config.rateLimit,
    customHandlers: [
      (req, res) => serveDashboard(req, res, gatewayApiKey),
      (req, res) => dashboardApi.handleRequest(req, res),
    ],
  });

  logger.info("dashboard-available", { url: `http://${config.gateway.host}:${config.gateway.port}/dashboard` });

  // 12. Wire WebSocket messages -> router -> agent -> WebSocket response
  // Track WS clients by groupId for persistent sessions
  const wsClientsByGroup = new Map<string, import("ws").WebSocket>();

  // Register outbound handler once (not per-message)
  router.onOutbound("websocket", async (outMsg: StandardMessage) => {
    const gid = outMsg.groupId ?? "";
    const target = wsClientsByGroup.get(gid);
    if (target && target.readyState === 1 /* OPEN */) {
      target.send(JSON.stringify({
        type: "response",
        content: outMsg.content.text,
        groupId: gid,
      }));
    }
  });

  gateway.onMessage((ws, data) => {
    const msg = data as { type?: string; content?: string; groupId?: string };
    const msgType = msg.type ?? "message";

    // Handle ping/keepalive
    if (msgType === "ping") {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "pong" }));
      }
      return;
    }

    // Handle sessions list
    if (msgType === "sessions") {
      const sessions = Array.from(wsClientsByGroup.keys());
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "sessions", data: sessions }));
      }
      return;
    }

    // Handle chat messages
    if (msgType !== "message" || typeof msg.content !== "string") return;

    const groupId = msg.groupId ?? randomUUID();

    // Track this WS client by groupId (overwrites previous client for same group)
    wsClientsByGroup.set(groupId, ws);

    // Clean up on close
    ws.on("close", () => {
      // Only remove if this ws is still the tracked client for this group
      if (wsClientsByGroup.get(groupId) === ws) {
        wsClientsByGroup.delete(groupId);
      }
    });

    // Stream response directly via agent, bypassing the router outbound path
    // for chunk delivery (router still gets the final message for logging/metrics)
    const content = msg.content;
    messagesReceived.inc(1, { channel: "websocket" });
    const startTime = Date.now();

    (async () => {
      let fullResponse = "";
      try {
        for await (const chunk of agent.handleMessage(groupId, content)) {
          fullResponse += chunk;
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: "chunk",
              content: chunk,
              groupId,
            }));
          }
        }

        messageLatency.observe(Date.now() - startTime);

        // Send done message with full response
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: "response",
            content: fullResponse,
            groupId,
          }));
        }

        if (fullResponse.length > 0) {
          messagesSent.inc(1, { channel: "websocket" });
        }
      } catch (err) {
        logger.error("ws-message-error", { error: String(err), groupId });
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "error", message: "Internal error", groupId }));
        }
      }
    })();
  });

  await gateway.start();
  logger.info("gateway-started", { host: config.gateway.host, port: gateway.port });

  // 13. Start channel adapters in-process for enabled channels
  const enabledChannels = Object.entries(config.channels).filter(
    ([, channelConfig]) => channelConfig.enabled,
  );

  const activeAdapters: Array<import("../channels/interface.js").ChannelAdapter> = [];

  for (const [channelName, channelConfig] of enabledChannels) {
    logger.info("starting-channel", { channel: channelName });
    try {
      const adapter = await createChannelAdapter(channelName, channelConfig, logger);
      if (!adapter) {
        logger.warn("channel-unsupported", { channel: channelName });
        continue;
      }

      // Wire inbound: channel message → router → agent → response back to channel
      adapter.onMessage((inboundMsg) => {
        messagesReceived.inc(1, { channel: channelName });
        dashboardApi.recordMessage("inbound", channelName, inboundMsg.content.text?.slice(0, 100));
        const startTime = Date.now();
        const groupId = inboundMsg.groupId ?? inboundMsg.senderId;

        (async () => {
          let fullResponse = "";
          try {
            for await (const chunk of agent.handleMessage(groupId, inboundMsg.content.text ?? "")) {
              fullResponse += chunk;
            }
            messageLatency.observe(Date.now() - startTime);

            if (fullResponse.length > 0) {
              // Send response back via the channel
              const target = inboundMsg.groupId ?? inboundMsg.senderId;
              await adapter.sendMessage(target, { text: fullResponse });
              messagesSent.inc(1, { channel: channelName });
              dashboardApi.recordMessage("outbound", channelName, fullResponse.slice(0, 100));
              dashboardApi.updateSession(groupId, undefined);
            }
          } catch (err) {
            logger.error("channel-message-error", { channel: channelName, error: String(err), groupId });
          }
        })();
      });

      await adapter.connect();
      activeAdapters.push(adapter);
      dashboardApi.updateChannelStatus(channelName, "connected");
      logger.info("channel-started", { channel: channelName });
    } catch (err) {
      logger.error("channel-start-failed", { channel: channelName, error: String(err) });
      dashboardApi.updateChannelStatus(channelName, "error");
    }
  }

  // 14. Graceful shutdown
  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting-down");

    healthChecker.stopMonitoring();

    // Disconnect channel adapters
    for (const adapter of activeAdapters) {
      try {
        await adapter.disconnect();
      } catch (err) {
        logger.error("channel-disconnect-error", { channel: adapter.name, error: String(err) });
      }
    }

    try {
      await processManager.stopAll();
    } catch (err) {
      logger.error("process-stop-error", { error: String(err) });
    }

    try {
      await gateway.stop();
    } catch (err) {
      logger.error("gateway-stop-error", { error: String(err) });
    }

    memory.close();
    logger.info("shutdown-complete");
  }

  // Register signal handlers (only for non-test usage)
  const onSignal = () => {
    shutdown().catch((err) => {
      logger.error("shutdown-error", { error: String(err) });
      process.exit(1);
    });
  };

  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  return {
    config,
    gateway,
    logger,
    metrics,
    agent,
    router,
    memory,
    processManager,
    healthChecker,
    gatewayApiKey,
    shutdown,
  };
}
