// src/gateway/web/api.ts
import { type IncomingMessage, type ServerResponse } from "node:http";

export interface ChannelInfo {
  name: string;
  status: string;
  messageCount: number;
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
  updateSession(groupId: string): void;
}

const MAX_RECENT_MESSAGES = 50;

export function createDashboardApi(): DashboardApi {
  const startTime = Date.now();
  const channels = new Map<string, ChannelInfo>();
  const sessions = new Map<string, SessionInfo>();
  const llmUsage = new Map<string, LLMProviderUsage>();
  const recentMessages: RecentMessage[] = [];

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
  };

  return {
    handleRequest(req: IncomingMessage, res: ServerResponse): boolean {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const handler = routes[url.pathname];
      if (handler) {
        handler(req, res);
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

    updateSession(groupId: string): void {
      const existing = sessions.get(groupId);
      if (existing) {
        existing.messageCount++;
        existing.lastActive = Date.now();
      } else {
        sessions.set(groupId, { groupId, messageCount: 1, lastActive: Date.now() });
      }
    },
  };
}
