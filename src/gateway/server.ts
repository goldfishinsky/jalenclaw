// src/gateway/server.ts
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { createAuthMiddleware } from "./auth.js";
import { createRateLimiter, type RateLimiterOptions } from "./rate-limiter.js";

export interface GatewayOptions {
  host?: string;
  port?: number;
  apiKey: string;
  rateLimit?: { maxRequestsPerMinute: number; burstSize: number };
  allowedOrigins?: string[];
  /** Custom request handlers called before built-in routes. Return true if handled. */
  customHandlers?: Array<(req: IncomingMessage, res: ServerResponse) => boolean>;
}

export interface Gateway {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly port: number;
  onMessage(handler: (ws: WebSocket, data: unknown) => void): void;
}

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Create a Gateway server with HTTP API, WebSocket support,
 * auth middleware, rate limiting, and Origin validation.
 */
export function createGateway(options: GatewayOptions): Gateway {
  const {
    host = "127.0.0.1",
    port = 18900,
    apiKey,
    rateLimit: rateLimitOpts = { maxRequestsPerMinute: 60, burstSize: 10 },
    allowedOrigins,
    customHandlers = [],
  } = options;

  const auth = createAuthMiddleware(apiKey);
  const rateLimiter = createRateLimiter(rateLimitOpts as RateLimiterOptions);
  const messageHandlers: Array<(ws: WebSocket, data: unknown) => void> = [];

  // --- Routes ---
  const routes: Record<string, RouteHandler> = {
    "/health": (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));
    },
    "/metrics": (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ metrics: {} }));
    },
  };

  // --- HTTP Server ---
  const server: Server = createServer((req, res) => {
    const ip = req.socket.remoteAddress ?? "unknown";

    // Rate limit check
    const rateResult = rateLimiter.check(ip);
    if (!rateResult.allowed) {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Retry-After", String(Math.ceil((rateResult.retryAfterMs ?? 1000) / 1000)));
      res.end(JSON.stringify({ error: "Too Many Requests" }));
      return;
    }

    // Auth middleware
    auth(req, res, () => {
      // Try custom handlers first
      for (const handler of customHandlers) {
        if (handler(req, res)) return;
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const routeHandler = routes[url.pathname];

      if (routeHandler) {
        routeHandler(req, res);
      } else {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Not Found" }));
      }
    });
  });

  // --- WebSocket Server ---
  const wss = new WebSocketServer({
    noServer: true,
  });

  server.on("upgrade", (req, socket, head) => {
    const ip = req.socket.remoteAddress ?? "unknown";

    // Rate limit check for upgrade requests
    const rateResult = rateLimiter.check(ip);
    if (!rateResult.allowed) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    // Auth check via query param for WebSocket
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const queryKey = url.searchParams.get("api_key");
    const headerKey = req.headers["x-api-key"] as string | undefined;
    const providedKey = headerKey ?? queryKey;

    if (!providedKey || providedKey !== apiKey) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Origin validation
    if (allowedOrigins && allowedOrigins.length > 0) {
      const origin = req.headers.origin;
      if (!origin || !allowedOrigins.includes(origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (raw: Buffer | string) => {
      let data: unknown;
      try {
        data = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
      } catch {
        // Invalid JSON; ignore
        return;
      }

      for (const handler of messageHandlers) {
        handler(ws, data);
      }
    });
  });

  let resolvedPort = 0;

  return {
    async start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, host, () => {
          const addr = server.address();
          resolvedPort = typeof addr === "object" && addr ? addr.port : port;
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        // Close all WebSocket connections
        for (const client of wss.clients) {
          client.close();
        }
        wss.close();
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    get port(): number {
      return resolvedPort;
    },

    onMessage(handler: (ws: WebSocket, data: unknown) => void): void {
      messageHandlers.push(handler);
    },
  };
}
