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
import { OAuthStrategy } from "../auth/oauth.js";
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
  shutdown(): Promise<void>;
}

export interface StartOptions {
  daemon?: boolean;
  configPath?: string;
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
        authStrategy = new OAuthStrategy({
          tokenPath,
          tokenEndpoint: "https://api.anthropic.com/v1/oauth/token",
          clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        });
        logger.info("claude-oauth-loaded", { expiresAt: new Date(tokens.expiresAt).toISOString() });
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
      (req, res) => serveDashboard(req, res),
      (req, res) => dashboardApi.handleRequest(req, res),
    ],
  });

  logger.info("dashboard-available", { url: `http://${config.gateway.host}:${config.gateway.port}/dashboard` });

  // 12. Wire WebSocket messages -> router -> agent -> WebSocket response
  const wsClients = new Map<string, import("ws").WebSocket>();

  gateway.onMessage((ws, data) => {
    const msg = data as { type?: string; content?: string; groupId?: string };
    if (msg.type !== "message" || typeof msg.content !== "string") return;

    const groupId = msg.groupId ?? randomUUID();
    const clientId = randomUUID();
    wsClients.set(clientId, ws);

    const standardMessage: StandardMessage = {
      id: randomUUID(),
      channelType: "websocket",
      channelMessageId: clientId,
      senderId: clientId,
      groupId,
      content: { type: "text", text: msg.content },
      timestamp: Date.now(),
      direction: "inbound",
    };

    // Register outbound handler for websocket channel
    router.onOutbound("websocket", async (outMsg: StandardMessage) => {
      const target = wsClients.get(outMsg.groupId ?? "");
      if (target && target.readyState === 1 /* OPEN */) {
        target.send(JSON.stringify({
          type: "response",
          content: outMsg.content.text,
          groupId: outMsg.groupId,
        }));
      }
      // Also try the original client
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: "response",
          content: outMsg.content.text,
          groupId,
        }));
      }
    });

    router.routeInbound(standardMessage).catch((err) => {
      logger.error("inbound-route-error", { error: String(err) });
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "error", message: "Internal error" }));
      }
    });
  });

  await gateway.start();
  logger.info("gateway-started", { host: config.gateway.host, port: gateway.port });

  // 13. Start channel adapter child processes for enabled channels
  const enabledChannels = Object.entries(config.channels).filter(
    ([, channelConfig]) => channelConfig.enabled,
  );

  for (const [channelName] of enabledChannels) {
    logger.info("starting-channel", { channel: channelName });
    // Channel adapters are expected at dist/channels/<name>/adapter.js
    const scriptPath = join(
      import.meta.url.replace("file://", "").replace(/\/cli\/start\.(ts|js)$/, ""),
      "channels",
      channelName,
      "adapter.js",
    );
    try {
      await processManager.start(channelName, scriptPath);
      logger.info("channel-started", { channel: channelName });
    } catch (err) {
      logger.error("channel-start-failed", { channel: channelName, error: String(err) });
    }
  }

  // 14. Graceful shutdown
  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting-down");

    healthChecker.stopMonitoring();

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
    shutdown,
  };
}
