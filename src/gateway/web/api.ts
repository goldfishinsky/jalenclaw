// src/gateway/web/api.ts
import { type IncomingMessage, type ServerResponse } from "node:http";

export interface ChannelInfo {
  name: string;
  status: string;
  messageCount: number;
}

export interface SessionMessage {
  role: string;
  content: string;
  timestamp: number;
}

export interface SessionInfo {
  groupId: string;
  messageCount: number;
  lastActive: number;
}

export interface LLMProviderUsage {
  tokens: number;
  requests: number;
}

export interface DashboardData {
  uptime: number;
  memoryUsage: number;
  channels: ChannelInfo[];
  sessions: SessionInfo[];
  llmUsage: Record<string, LLMProviderUsage>;
}

export interface RecentMessage {
  timestamp: number;
  direction: "inbound" | "outbound";
  channel: string;
  preview: string;
}

export interface DashboardApi {
  handleRequest(req: IncomingMessage, res: ServerResponse): boolean;
  updateChannelStatus(name: string, status: string): void;
  recordMessage(direction: "inbound" | "outbound", channel: string, preview?: string): void;
  recordLLMUsage(provider: string, tokens: number): void;
  updateSession(groupId: string, messageCount?: number): void;
  setConfig(config: Record<string, unknown>): void;
  addSessionMessage(groupId: string, role: string, content: string): void;
  onSendMessage?: (content: string, groupId: string) => Promise<string>;
}

const MAX_RECENT_MESSAGES = 50;

export function createDashboardApi(): DashboardApi {
  const startTime = Date.now();
  const channels = new Map<string, ChannelInfo>();
  const sessions = new Map<string, SessionInfo>();
  const sessionMessages = new Map<string, SessionMessage[]>();
  const llmUsage = new Map<string, LLMProviderUsage>();
  const recentMessages: RecentMessage[] = [];
  let storedConfig: Record<string, unknown> = {};

  function json(res: ServerResponse, data: unknown, status = 200): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  }

  function getStatus(): DashboardData {
    const mem = process.memoryUsage();
    return {
      uptime: Math.floor((Date.now() - startTime) / 1000),
      memoryUsage: Math.round(mem.heapUsed / 1024 / 1024),
      channels: Array.from(channels.values()),
      sessions: Array.from(sessions.values()),
      llmUsage: Object.fromEntries(llmUsage),
    };
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {
    "/api/status": (_req, res) => {
      json(res, getStatus());
    },

    "/api/channels": (_req, res) => {
      json(res, Array.from(channels.values()));
    },

    "/api/sessions": (_req, res) => {
      json(res, Array.from(sessions.values()));
    },

    "/api/metrics": (_req, res) => {
      json(res, {
        llmUsage: Object.fromEntries(llmUsage),
        totalMessages: recentMessages.length,
        channelCount: channels.size,
        sessionCount: sessions.size,
      });
    },

    "/api/messages/recent": (_req, res) => {
      json(res, recentMessages);
    },

    "/api/config": (_req, res) => {
      json(res, storedConfig);
    },

    "/api/health": (_req, res) => {
      const providerStatuses: Record<string, string> = {};
      for (const key of llmUsage.keys()) {
        providerStatuses[key] = "connected";
      }
      const channelStatuses: Record<string, string> = {};
      for (const ch of channels.values()) {
        channelStatuses[ch.name] = ch.status;
      }
      const memoryBackend =
        typeof storedConfig.memory === "object" &&
        storedConfig.memory !== null &&
        "backend" in storedConfig.memory
          ? String((storedConfig.memory as Record<string, unknown>).backend)
          : "unknown";
      json(res, {
        status: "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        providers: providerStatuses,
        channels: channelStatuses,
        memory: memoryBackend,
      });
    },
  };

  const api: DashboardApi = {
    handleRequest(req: IncomingMessage, res: ServerResponse): boolean {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      // Check exact routes first
      const handler = routes[url.pathname];
      if (handler) {
        handler(req, res);
        return true;
      }

      // Parameterized routes
      const sessionMatch = url.pathname.match(/^\/api\/sessions\/(.+)$/);
      if (sessionMatch && req.method === "GET") {
        const groupId = decodeURIComponent(sessionMatch[1]);
        const messages = sessionMessages.get(groupId) ?? [];
        json(res, { groupId, messages });
        return true;
      }

      if (url.pathname === "/api/messages/send" && req.method === "POST") {
        void (async () => {
          try {
            const raw = await readBody(req);
            const { content, groupId } = JSON.parse(raw) as { content: string; groupId: string };
            if (!content || !groupId) {
              json(res, { error: "content and groupId are required" }, 400);
              return;
            }
            if (!api.onSendMessage) {
              json(res, { error: "No message handler configured" }, 503);
              return;
            }
            const response = await api.onSendMessage(content, groupId);
            json(res, { response, groupId });
          } catch {
            json(res, { error: "Invalid request" }, 400);
          }
        })();
        return true;
      }

      return false;
    },

    updateChannelStatus(name: string, status: string): void {
      const existing = channels.get(name);
      if (existing) {
        existing.status = status;
      } else {
        channels.set(name, { name, status, messageCount: 0 });
      }
    },

    recordMessage(direction: "inbound" | "outbound", channel: string, preview = ""): void {
      // Update channel message count
      const ch = channels.get(channel);
      if (ch) {
        ch.messageCount++;
      }

      // Add to recent messages
      recentMessages.push({
        timestamp: Date.now(),
        direction,
        channel,
        preview: preview.slice(0, 100),
      });

      // Trim to max
      while (recentMessages.length > MAX_RECENT_MESSAGES) {
        recentMessages.shift();
      }
    },

    recordLLMUsage(provider: string, tokens: number): void {
      const existing = llmUsage.get(provider);
      if (existing) {
        existing.tokens += tokens;
        existing.requests++;
      } else {
        llmUsage.set(provider, { tokens, requests: 1 });
      }
    },

    updateSession(groupId: string, messageCount?: number): void {
      const existing = sessions.get(groupId);
      if (existing) {
        if (messageCount !== undefined) {
          existing.messageCount = messageCount;
        } else {
          existing.messageCount++;
        }
        existing.lastActive = Date.now();
      } else {
        sessions.set(groupId, {
          groupId,
          messageCount: messageCount ?? 1,
          lastActive: Date.now(),
        });
      }
    },

    setConfig(config: Record<string, unknown>): void {
      storedConfig = config;
    },

    addSessionMessage(groupId: string, role: string, content: string): void {
      if (!sessionMessages.has(groupId)) {
        sessionMessages.set(groupId, []);
      }
      sessionMessages.get(groupId)!.push({ role, content, timestamp: Date.now() });
    },
  };

  return api;
}
